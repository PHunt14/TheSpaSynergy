/**
 * Production Migration: Populate allowedStaff arrays on services
 *
 * Run AFTER migrate-categories-prod.mjs during the unified model rollout.
 * This script:
 * 1. Reads all services and staff from production
 * 2. For services WITHOUT an allowedStaff array, infers the correct staff
 *    based on the legacy vendorId ownership (staff.vendorId === service.vendorId)
 * 3. Writes the allowedStaff array (additive only — never overwrites existing assignments)
 *
 * Special handling:
 * - Services with resourceType 'sauna' → assigned to 'resource-sauna'
 * - Services with allowedStaff already populated → SKIPPED (no overwrite)
 * - Services with no vendorId and no allowedStaff → reported for manual review
 *
 * Usage:
 *   Set amplify_outputs.json to point at production (or use amplify_outputs_main.json)
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/migrate-staff-assignments-prod.mjs
 *
 * Safe to run multiple times (idempotent — skips already-assigned services).
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';

// Point at production — update this path if needed
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

// ═══════════════════════════════════════════════════════════════
// DRY-RUN MODE: set to false to actually write changes
// ═══════════════════════════════════════════════════════════════
const DRY_RUN = process.argv.includes('--dry-run');

async function fetchAll(model) {
  const items = [];
  let nextToken = null;
  do {
    const result = await model.list({
      ...(nextToken ? { nextToken } : {}),
      limit: 200,
    });
    items.push(...(result.data || []));
    nextToken = result.nextToken;
  } while (nextToken);
  return items;
}

async function migrate() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE — no changes will be written\n');
  }
  console.log('🔄 Starting staff assignment migration for production...\n');

  // 1. Fetch all services and staff
  const allServices = await fetchAll(client.models.Service);
  const allStaff = await fetchAll(client.models.StaffSchedule);

  console.log(`  Found ${allServices.length} services`);
  console.log(`  Found ${allStaff.length} staff members\n`);

  // 2. Build vendor → staff mapping
  const staffByVendor = new Map();
  for (const s of allStaff) {
    if (s.isActive === false) continue;
    if (!staffByVendor.has(s.vendorId)) {
      staffByVendor.set(s.vendorId, []);
    }
    staffByVendor.get(s.vendorId).push(s.visibleId);
  }

  console.log('── Vendor → Staff mapping ──');
  for (const [vendorId, staffIds] of staffByVendor) {
    const names = allStaff
      .filter(s => staffIds.includes(s.visibleId))
      .map(s => s.staffName);
    console.log(`  ${vendorId}: [${names.join(', ')}]`);
  }
  console.log('');

  // 3. Ensure resource-sauna StaffSchedule record exists
  const saunaExists = allStaff.some(s => s.visibleId === 'resource-sauna');
  if (!saunaExists) {
    // Determine the vendor for the sauna resource — use the first vendor that has sauna-type services,
    // or fall back to the first vendor in the staffByVendor map
    const saunaService = allServices.find(s => s.resourceType === 'sauna' && s.vendorId);
    const saunaVendorId = saunaService?.vendorId || [...staffByVendor.keys()][0];

    if (saunaVendorId) {
      const saunaSchedule = JSON.stringify({
        monday: { start: '06:30', end: '18:00' },
        tuesday: { start: '06:30', end: '18:00' },
        wednesday: { start: '06:30', end: '18:00' },
        thursday: { start: '06:30', end: '18:00' },
        friday: { start: '06:30', end: '18:00' },
        saturday: { start: '10:00', end: '14:00' },
        sunday: { start: null, end: null },
      });

      if (DRY_RUN) {
        console.log(`  🔍 resource-sauna: would CREATE StaffSchedule record (vendor: ${saunaVendorId})`);
      } else {
        await client.models.StaffSchedule.create({
          visibleId: 'resource-sauna',
          staffName: 'Sauna',
          staffEmail: 'sauna@thespasynergy.com',
          vendorId: saunaVendorId,
          schedule: saunaSchedule,
          isActive: true,
        });
        console.log(`  ✓ resource-sauna: CREATED StaffSchedule record (vendor: ${saunaVendorId})`);
      }
    } else {
      console.log(`  ⚠ resource-sauna: cannot create — no vendor found for sauna services`);
    }
  } else {
    console.log(`  ✓ resource-sauna: StaffSchedule record already exists`);
  }
  console.log('');

  // 4. Process each service
  console.log('── Processing services ──');
  let updated = 0;
  let skipped = 0;
  let needsReview = [];

  for (const svc of allServices) {
    // Skip inactive services
    if (svc.isActive === false) {
      skipped++;
      continue;
    }

    // Skip services that already have allowedStaff populated
    if (svc.allowedStaff && Array.isArray(svc.allowedStaff) && svc.allowedStaff.length > 0) {
      console.log(`  ⏭ ${svc.name}: already has allowedStaff [${svc.allowedStaff.join(', ')}]`);
      skipped++;
      continue;
    }

    // Special case: sauna resource type
    if (svc.resourceType === 'sauna') {
      const assignment = ['resource-sauna'];
      if (DRY_RUN) {
        console.log(`  🔍 ${svc.name}: would assign → [resource-sauna]`);
      } else {
        await client.models.Service.update({
          serviceId: svc.serviceId,
          allowedStaff: assignment,
        });
        console.log(`  ✓ ${svc.name}: assigned → [resource-sauna]`);
      }
      updated++;
      continue;
    }

    // Infer from legacy vendorId
    const vendorId = svc.vendorId;
    if (!vendorId) {
      // No vendorId and no allowedStaff — needs manual review
      needsReview.push(svc);
      console.log(`  ⚠ ${svc.name}: no vendorId and no allowedStaff — NEEDS MANUAL REVIEW`);
      continue;
    }

    // Get all active staff for this vendor (excluding resource calendars)
    const vendorStaff = (staffByVendor.get(vendorId) || [])
      .filter(id => !id.startsWith('resource-'));

    if (vendorStaff.length === 0) {
      needsReview.push(svc);
      console.log(`  ⚠ ${svc.name}: vendor "${vendorId}" has no active staff — NEEDS MANUAL REVIEW`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  🔍 ${svc.name}: would assign → [${vendorStaff.join(', ')}]`);
    } else {
      await client.models.Service.update({
        serviceId: svc.serviceId,
        allowedStaff: vendorStaff,
      });
      console.log(`  ✓ ${svc.name}: assigned → [${vendorStaff.join(', ')}]`);
    }
    updated++;
  }

  // 5. Summary
  console.log(`\n${'═'.repeat(60)}`);
  if (DRY_RUN) {
    console.log(`🔍 DRY RUN COMPLETE (no changes written)`);
  } else {
    console.log(`✅ Migration complete!`);
  }
  console.log(`   ${updated} services ${DRY_RUN ? 'would be' : ''} updated with allowedStaff`);
  console.log(`   ${skipped} services skipped (already assigned or inactive)`);

  if (needsReview.length > 0) {
    console.log(`\n⚠ ${needsReview.length} services need manual review:`);
    for (const svc of needsReview) {
      console.log(`   - ${svc.name} (${svc.serviceId}) — vendorId: ${svc.vendorId || 'NONE'}`);
    }
    console.log('\n   These services have no vendorId or no matching staff.');
    console.log('   Assign them manually in Dashboard → Services → Edit → Allowed Staff.');
  }

  console.log('');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
