#!/usr/bin/env node

/**
 * Production cleanup: remove the temporary `vendorId` backfill from services
 * that should be vendor-less (global, staff-driven).
 *
 * CONTEXT: To unblock an empty service list (AppSync failing on a non-nullable
 * `vendorId`), 6 records were temporarily set to the house vendor. Once the
 * schema was changed to make `Service.vendorId` OPTIONAL, those records should
 * go back to vendor-less. This script removes `vendorId` from them.
 *
 * PRECONDITION: The `Service.vendorId` field must already be nullable in the
 * deployed schema. Run only after that schema deploy has completed.
 *
 * Usage:
 *   node scripts/renull-service-vendorid-prod.mjs            (dry run — no writes)
 *   node scripts/renull-service-vendorid-prod.mjs --apply    (perform writes)
 *   node scripts/renull-service-vendorid-prod.mjs --apply --table Service-<hash>-NONE
 *
 * Notes:
 *   - Corporate TLS interception may require: NODE_TLS_REJECT_UNAUTHORIZED=0
 *   - Uses REMOVE so the attribute is deleted entirely (true vendor-less).
 */

import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';

const REGION = 'us-east-1';
const DEFAULT_TABLE = 'Service-ioggmkvoizfdbjlunwydeowaim-NONE';

// The exact records that were backfilled and should return to vendor-less.
const TARGET_SERVICE_IDS = [
  'svc-1782803172578',      // Classic Manicure
  'svc-1782804073176',      // Make-Up Application
  'svc-1782803308027',      // Sauna 25 minutes
  'svc-addon-1782802137286',// Mini-facial
  'svc-1782996920432',      // Wedding Ceremony Officiant
  'svc-1787184410036',      // Perm
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const tableIdx = args.indexOf('--table');
const tableName = tableIdx !== -1 ? args[tableIdx + 1] : DEFAULT_TABLE;

const client = new DynamoDBClient({ region: REGION });

async function getService(serviceId) {
  const res = await client.send(new GetItemCommand({
    TableName: tableName,
    Key: { serviceId: { S: serviceId } },
    ProjectionExpression: 'serviceId, vendorId, #n',
    ExpressionAttributeNames: { '#n': 'name' },
  }));
  return res.Item || null;
}

async function main() {
  console.log(`\n🧹 Re-nulling vendorId on ${TARGET_SERVICE_IDS.length} services in ${tableName}`);
  console.log(`   Mode: ${apply ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}\n`);

  for (const serviceId of TARGET_SERVICE_IDS) {
    const item = await getService(serviceId);
    if (!item) {
      console.log(`   ⚠ Not found: ${serviceId}`);
      continue;
    }
    const name = item.name?.S || '(unnamed)';
    const currentVendor = item.vendorId?.S ?? '<none>';

    if (!apply) {
      console.log(`   [dry-run] would REMOVE vendorId (currently "${currentVendor}") on ${serviceId} | ${name}`);
      continue;
    }

    try {
      await client.send(new UpdateItemCommand({
        TableName: tableName,
        Key: { serviceId: { S: serviceId } },
        UpdateExpression: 'REMOVE vendorId',
      }));
      console.log(`   ✓ Removed vendorId on ${serviceId} | ${name}`);
    } catch (err) {
      console.log(`   ✗ Failed ${serviceId}: ${err?.message || err}`);
    }
  }

  console.log(`\n${apply ? '✅ Done.' : 'ℹ Dry run complete — re-run with --apply to write.'}`);
}

main().catch((err) => {
  console.error('❌ Error:', err?.message || err);
  process.exit(1);
});
