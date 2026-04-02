// Targeted upsert for individual DynamoDB records via Amplify Data.
//
// Usage:
//   node scripts/upsert.js <model> <id> <json>
//   node scripts/upsert.js <model> <id> --file <path>
//   node scripts/upsert.js --batch <batchName>
//   node scripts/upsert.js --batch <batchName> --dry-run
//
// Examples:
//   node scripts/upsert.js Service svc-kera-head-bath '{"name":"Head Bath","vendorId":"vendor-kera-studio","duration":60,"price":120}'
//   node scripts/upsert.js Vendor vendor-kera-studio '{"phone":"240-329-6537"}'
//   node scripts/upsert.js StaffSchedule staff-kera-stacey --file data/stacey-schedule.json
//   node scripts/upsert.js --batch head-bath-addons
//   node scripts/upsert.js --batch head-bath-addons --dry-run

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Model name → { idField, jsonFields (fields that need JSON.stringify) }
const MODEL_CONFIG = {
  Vendor:        { idField: 'vendorId',      jsonFields: ['workingHours', 'saunaHours'] },
  Service:       { idField: 'serviceId',     jsonFields: [] },
  Appointment:   { idField: 'appointmentId', jsonFields: ['customer'] },
  StaffSchedule: { idField: 'visibleId',     jsonFields: ['schedule', 'autoAssignRules'] },
  Bundle:        { idField: 'bundleId',      jsonFields: ['vendorConfirmations', 'addOns'] },
  BundleSettings:{ idField: 'settingsId',    jsonFields: [] },
};

function usage() {
  console.log(`
Usage:
  node scripts/upsert.js <Model> <id> '<json>'
  node scripts/upsert.js <Model> <id> --file <path>
  node scripts/upsert.js --batch <batchName> [--dry-run]

Models: ${Object.keys(MODEL_CONFIG).join(', ')}

Batches are defined in scripts/batches/  (e.g. scripts/batches/head-bath-addons.js)
`);
  process.exit(1);
}

// Stringify any JSON fields that are objects
function prepareData(modelName, data) {
  const cfg = MODEL_CONFIG[modelName];
  if (!cfg) return data;
  const prepared = { ...data };
  for (const field of cfg.jsonFields) {
    if (prepared[field] !== undefined && typeof prepared[field] !== 'string') {
      prepared[field] = JSON.stringify(prepared[field]);
    }
  }
  return prepared;
}

async function upsertOne(modelName, id, fields, { dryRun = false } = {}) {
  const cfg = MODEL_CONFIG[modelName];
  if (!cfg) {
    console.error(`Unknown model: ${modelName}. Valid: ${Object.keys(MODEL_CONFIG).join(', ')}`);
    return false;
  }

  const model = client.models[modelName];
  if (!model) {
    console.error(`Model "${modelName}" not found on client`);
    return false;
  }

  const record = { [cfg.idField]: id, ...prepareData(modelName, fields) };

  if (dryRun) {
    console.log(`[dry-run] ${modelName} ${id}:`, JSON.stringify(record, null, 2));
    return true;
  }

  // Try update first, fall back to create
  try {
    const { data, errors } = await model.update(record);
    if (errors) throw errors;
    console.log(`✓ Updated ${modelName}: ${id}`);
    return true;
  } catch {
    try {
      const { data, errors } = await model.create(record);
      if (errors) {
        console.error(`✗ Failed to create ${modelName} ${id}:`, JSON.stringify(errors, null, 2));
        return false;
      }
      console.log(`✓ Created ${modelName}: ${id}`);
      return true;
    } catch (err) {
      console.error(`✗ Error upserting ${modelName} ${id}:`, err.message || err);
      return false;
    }
  }
}

async function runBatch(batchName, dryRun) {
  const batchPath = resolve(__dirname, 'batches', `${batchName}.js`);
  if (!existsSync(batchPath)) {
    console.error(`Batch not found: ${batchPath}`);
    console.log('Available batches:');
    const batchDir = resolve(__dirname, 'batches');
    if (existsSync(batchDir)) {
      const { readdirSync } = await import('fs');
      readdirSync(batchDir).filter(f => f.endsWith('.js')).forEach(f => console.log(`  ${f.replace('.js', '')}`));
    } else {
      console.log('  (no batches directory — create scripts/batches/)');
    }
    process.exit(1);
  }

  const batch = await import(`file://${batchPath}`);
  const operations = batch.default || batch.operations;
  if (!Array.isArray(operations)) {
    console.error('Batch must export an array as default or named "operations"');
    process.exit(1);
  }

  console.log(`Running batch "${batchName}" (${operations.length} operations)${dryRun ? ' [DRY RUN]' : ''}...\n`);

  let success = 0, failed = 0;
  for (const op of operations) {
    const { model, id, data } = op;
    const ok = await upsertOne(model, id, data, { dryRun });
    ok ? success++ : failed++;
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

// --- CLI ---
const args = process.argv.slice(2);

if (args.length === 0) usage();

if (args[0] === '--batch') {
  const batchName = args[1];
  if (!batchName) usage();
  const dryRun = args.includes('--dry-run');
  await runBatch(batchName, dryRun);
} else {
  const modelName = args[0];
  const id = args[1];
  if (!modelName || !id) usage();

  let fields;
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1) {
    const filePath = resolve(args[fileIdx + 1]);
    fields = JSON.parse(readFileSync(filePath, 'utf-8'));
  } else {
    const jsonStr = args[2];
    if (!jsonStr) usage();
    fields = JSON.parse(jsonStr);
  }

  const ok = await upsertOne(modelName, id, fields);
  process.exit(ok ? 0 : 1);
}
