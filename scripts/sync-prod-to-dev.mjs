#!/usr/bin/env node

/**
 * Sync Production DynamoDB → Dev (Sandbox) DynamoDB
 *
 * Scans all items from each production table and writes them to the
 * corresponding sandbox table. Full overwrite — deletes existing dev
 * items first, then writes production data.
 *
 * Prerequisites:
 *   - AWS CLI configured with credentials that can access both environments
 *   - Both environments deployed in the same AWS account/region
 *
 * Usage:
 *   node scripts/sync-prod-to-dev.mjs
 *   node scripts/sync-prod-to-dev.mjs --dry-run   (preview without writing)
 *   node scripts/sync-prod-to-dev.mjs --tables Vendor,Service  (specific tables only)
 *
 *   # If auto-detection picks the wrong direction, set env vars:
 *   PROD_HASH=ioggmkvoizfdbjlunwydeowaim DEV_HASH=fijie4ecpbaghhganm4kvz2qkq node scripts/sync-prod-to-dev.mjs
 */

import {
  DynamoDBClient,
  ListTablesCommand,
  ScanCommand,
  BatchWriteItemCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = 'us-east-1';
const client = new DynamoDBClient({ region: REGION });

// Models defined in amplify/data/resource.ts
const MODEL_NAMES = [
  'Vendor',
  'ServiceCategory',
  'Service',
  'Bundle',
  'BundleSettings',
  'Appointment',
  'SiteSettings',
  'StaffSchedule',
  'Client',
  'ClientNote',
  'SplitPaymentSession',
];

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tablesArgIdx = args.indexOf('--tables');
const filterTables = tablesArgIdx !== -1
  ? args[tablesArgIdx + 1]?.split(',').map(t => t.trim())
  : null;

// Allow specifying hashes via CLI: --prod-hash X --dev-hash Y
const prodHashArgIdx = args.indexOf('--prod-hash');
const devHashArgIdx = args.indexOf('--dev-hash');
const cliProdHash = prodHashArgIdx !== -1 ? args[prodHashArgIdx + 1] : null;
const cliDevHash = devHashArgIdx !== -1 ? args[devHashArgIdx + 1] : null;

async function listAllTables() {
  const tables = [];
  let lastEvaluatedTableName;

  do {
    const cmd = new ListTablesCommand({
      ExclusiveStartTableName: lastEvaluatedTableName,
      Limit: 100,
    });
    const result = await client.send(cmd);
    tables.push(...(result.TableNames || []));
    lastEvaluatedTableName = result.LastEvaluatedTableName;
  } while (lastEvaluatedTableName);

  return tables;
}

function findTablePairs(allTables) {
  // Amplify Gen2 table naming: <Model>-<apiId>-NONE
  // Two environments will have different apiId hashes.
  // Detect the unique hashes and pair tables by model name.

  const pairs = [];

  // Extract all unique hashes from table names
  const hashSet = new Set();
  for (const table of allTables) {
    for (const modelName of MODEL_NAMES) {
      if (table.startsWith(modelName + '-')) {
        const rest = table.slice(modelName.length + 1); // e.g. "fijie4ec...-NONE"
        const hash = rest.replace(/-NONE$/, '');
        if (hash) hashSet.add(hash);
      }
    }
  }

  const hashes = [...hashSet];

  if (hashes.length < 2) {
    console.error('❌ Found fewer than 2 environment hashes. Both prod and sandbox must be deployed.');
    console.error('   Hashes found:', hashes);
    process.exit(1);
  }

  if (hashes.length > 2) {
    console.warn(`⚠  Found ${hashes.length} environment hashes: ${hashes.join(', ')}`);
    console.warn('   Using PROD_HASH and DEV_HASH env vars, or first two by default.');
  }

  // Allow override via CLI args, env vars, otherwise use positional (first = prod, second = dev)
  const prodHash = cliProdHash || process.env.PROD_HASH || hashes[0];
  const devHash = cliDevHash || process.env.DEV_HASH || hashes[1];

  console.log(`\n   Prod hash: ${prodHash}`);
  console.log(`   Dev hash:  ${devHash}`);

  for (const modelName of MODEL_NAMES) {
    if (filterTables && !filterTables.includes(modelName)) continue;

    const prodTable = allTables.find(t => t === `${modelName}-${prodHash}-NONE`);
    const devTable = allTables.find(t => t === `${modelName}-${devHash}-NONE`);

    if (!prodTable) {
      console.warn(`⚠  No prod table found for ${modelName} — skipping`);
      continue;
    }
    if (!devTable) {
      console.warn(`⚠  No dev table found for ${modelName} — skipping`);
      continue;
    }

    pairs.push({ modelName, prodTable, devTable });
  }

  return pairs;
}

async function scanAllItems(tableName) {
  const items = [];
  let lastEvaluatedKey;

  do {
    const cmd = new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
    });
    const result = await client.send(cmd);
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function getTableKeySchema(tableName) {
  const cmd = new DescribeTableCommand({ TableName: tableName });
  const result = await client.send(cmd);
  return result.Table.KeySchema;
}

async function deleteAllItems(tableName, keySchema) {
  const items = await scanAllItems(tableName);
  if (items.length === 0) return 0;

  const keyAttrs = keySchema.map(k => k.AttributeName);

  // BatchWriteItem supports max 25 items per call
  const batches = [];
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25).map(item => ({
      DeleteRequest: {
        Key: Object.fromEntries(keyAttrs.map(attr => [attr, item[attr]]))
      }
    }));
    batches.push(batch);
  }

  for (const batch of batches) {
    const cmd = new BatchWriteItemCommand({
      RequestItems: { [tableName]: batch }
    });
    await client.send(cmd);
  }

  return items.length;
}

async function writeItems(tableName, items) {
  if (items.length === 0) return;

  // BatchWriteItem supports max 25 items per call
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25).map(item => ({
      PutRequest: { Item: item }
    }));

    const cmd = new BatchWriteItemCommand({
      RequestItems: { [tableName]: batch }
    });

    let result = await client.send(cmd);

    // Handle unprocessed items with exponential backoff
    let retries = 0;
    while (result.UnprocessedItems?.[tableName]?.length > 0 && retries < 5) {
      retries++;
      await new Promise(r => setTimeout(r, Math.pow(2, retries) * 100));
      const retryCmd = new BatchWriteItemCommand({
        RequestItems: { [tableName]: result.UnprocessedItems[tableName] }
      });
      result = await client.send(retryCmd);
    }
  }
}

async function syncTable({ modelName, prodTable, devTable }) {
  console.log(`\n📋 ${modelName}`);
  console.log(`   Prod: ${prodTable}`);
  console.log(`   Dev:  ${devTable}`);

  // Scan prod
  const prodItems = await scanAllItems(prodTable);
  console.log(`   📖 Scanned ${prodItems.length} items from prod`);

  if (dryRun) {
    console.log(`   🏜️  DRY RUN — would delete dev items and write ${prodItems.length} items`);
    return;
  }

  // Get key schema for dev table (needed for deletion)
  const keySchema = await getTableKeySchema(devTable);

  // Delete all dev items
  const deleted = await deleteAllItems(devTable, keySchema);
  console.log(`   🗑️  Deleted ${deleted} existing dev items`);

  // Write prod items to dev
  await writeItems(devTable, prodItems);
  console.log(`   ✅ Wrote ${prodItems.length} items to dev`);
}

async function main() {
  console.log('🔄 Syncing Production → Dev (Sandbox)\n');
  if (dryRun) console.log('⚡ DRY RUN MODE — no writes will be performed\n');

  // List all DynamoDB tables in the account
  console.log('📡 Listing all DynamoDB tables...');
  const allTables = await listAllTables();
  console.log(`   Found ${allTables.length} tables total`);

  // Find prod/dev pairs
  const pairs = findTablePairs(allTables);

  if (pairs.length === 0) {
    console.error('\n❌ No matching table pairs found.');
    console.error('   Make sure both prod and sandbox are deployed.');
    console.error('   Tables found:', allTables.filter(t =>
      MODEL_NAMES.some(m => t.includes(m))
    ));
    process.exit(1);
  }

  // Quick diagnostic: scan Vendor table from each to show which has data
  console.log('\n📊 Quick item count check (Vendor table):');
  for (const pair of pairs) {
    if (pair.modelName === 'Vendor') {
      const prodItems = await scanAllItems(pair.prodTable);
      const devItems = await scanAllItems(pair.devTable);
      console.log(`   Prod (${pair.prodTable}): ${prodItems.length} items`);
      console.log(`   Dev  (${pair.devTable}): ${devItems.length} items`);
      if (prodItems.length === 0 && devItems.length > 0) {
        console.warn('\n⚠️  PROD has 0 items but DEV has data — hashes may be swapped!');
        console.warn('   Try: node scripts/sync-prod-to-dev.mjs --prod-hash <other> --dev-hash <other>');
      }
      break;
    }
  }

  console.log(`\n🎯 Found ${pairs.length} table pairs to sync:`);
  pairs.forEach(p => console.log(`   • ${p.modelName}: ${p.prodTable} → ${p.devTable}`));

  // Confirm unless dry run
  if (!dryRun) {
    console.log('\n⚠️  This will DELETE all data in dev tables and replace with prod data.');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...');
    await new Promise(r => setTimeout(r, 5000));
  }

  // Sync each table
  for (const pair of pairs) {
    await syncTable(pair);
  }

  console.log('\n✅ Sync complete!');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
