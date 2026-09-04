#!/usr/bin/env node

/**
 * Production Backfill: set a non-null `vendorId` on Service records that have
 * a null/empty value.
 *
 * WHY: The `Service` model declares `vendorId` as required (GraphQL `String!`),
 * but services created through the app never set it (the write handlers strip
 * `vendorId`). Records with a null `vendorId` cause AppSync to fail the whole
 * `listServices` query with:
 *   "Cannot return null for non-nullable type: 'String' ... /vendorId"
 * which blanks the service list on the customer booking page and the provider
 * dashboard.
 *
 * This script scans the prod Service table and sets `vendorId` to the house
 * vendor (default: vendor-kera-studio) for any record missing it.
 *
 * Usage:
 *   node scripts/backfill-service-vendorid-prod.mjs            (dry run — no writes)
 *   node scripts/backfill-service-vendorid-prod.mjs --apply    (perform writes)
 *   node scripts/backfill-service-vendorid-prod.mjs --apply --vendor vendor-kera-studio
 *   node scripts/backfill-service-vendorid-prod.mjs --apply --table Service-<hash>-NONE
 *
 * Notes:
 *   - Corporate TLS interception may require: NODE_TLS_REJECT_UNAUTHORIZED=0
 *   - Requires AWS credentials with DynamoDB access to the prod table.
 */

import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = 'us-east-1';
const DEFAULT_TABLE = 'Service-ioggmkvoizfdbjlunwydeowaim-NONE';
const DEFAULT_VENDOR = 'vendor-kera-studio'; // house vendor (isHouse: true)

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const vendorIdx = args.indexOf('--vendor');
const tableIdx = args.indexOf('--table');
const vendorId = vendorIdx !== -1 ? args[vendorIdx + 1] : DEFAULT_VENDOR;
const tableName = tableIdx !== -1 ? args[tableIdx + 1] : DEFAULT_TABLE;

const client = new DynamoDBClient({ region: REGION });

async function scanAll() {
  const items = [];
  let lastKey;
  do {
    const res = await client.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'serviceId, vendorId, #n',
      ExpressionAttributeNames: { '#n': 'name' },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function isMissingVendor(item) {
  const v = item.vendorId;
  return !v || v.NULL === true || v.S === undefined || v.S === null || v.S === '';
}

async function main() {
  console.log(`\n🔎 Scanning ${tableName} for Service records missing vendorId...`);
  console.log(`   Mode: ${apply ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}`);
  console.log(`   Backfill vendorId = "${vendorId}"\n`);

  const items = await scanAll();
  const missing = items.filter(isMissingVendor);

  console.log(`   Total services: ${items.length}`);
  console.log(`   Missing vendorId: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('✅ Nothing to backfill.');
    return;
  }

  for (const item of missing) {
    const sid = item.serviceId?.S;
    const name = item.name?.S || '(unnamed)';
    if (!sid) {
      console.log(`   ⚠ Skipping record with no serviceId: ${name}`);
      continue;
    }

    if (!apply) {
      console.log(`   [dry-run] would set vendorId="${vendorId}" on ${sid}  |  ${name}`);
      continue;
    }

    try {
      await client.send(new UpdateItemCommand({
        TableName: tableName,
        Key: { serviceId: { S: sid } },
        // Only set when still missing/empty — safe to re-run (idempotent).
        UpdateExpression: 'SET vendorId = :v',
        ConditionExpression: 'attribute_not_exists(vendorId) OR vendorId = :empty OR vendorId = :nullstr',
        ExpressionAttributeValues: {
          ':v': { S: vendorId },
          ':empty': { S: '' },
          ':nullstr': { S: ' ' },
        },
      }));
      console.log(`   ✓ Updated ${sid}  |  ${name}`);
    } catch (err) {
      if (err?.name === 'ConditionalCheckFailedException') {
        console.log(`   - Skipped (already set) ${sid}  |  ${name}`);
      } else {
        console.log(`   ✗ Failed ${sid}: ${err?.message || err}`);
      }
    }
  }

  console.log(`\n${apply ? '✅ Backfill complete.' : 'ℹ Dry run complete — re-run with --apply to write.'}`);
}

main().catch((err) => {
  console.error('❌ Error:', err?.message || err);
  process.exit(1);
});
