/**
 * Migrate vendor-level Square tokens to staff-level.
 *
 * For each vendor that has a squareAccessToken, find the owner's
 * StaffSchedule record (matched by vendor email → staffEmail) and
 * copy the tokens over. Then clear the vendor-level tokens.
 *
 * Usage:
 *   node scripts/migrate-square-to-staff.js
 *
 * Dry-run (no writes):
 *   DRY_RUN=1 node scripts/migrate-square-to-staff.js
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();
const dryRun = !!process.env.DRY_RUN;

async function migrate() {
  if (dryRun) console.log('🔍 DRY RUN — no changes will be written\n');

  const { data: vendors } = await client.models.Vendor.list();
  const vendorsWithSquare = (vendors || []).filter(v => v.squareAccessToken);

  if (vendorsWithSquare.length === 0) {
    console.log('No vendors with Square tokens found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${vendorsWithSquare.length} vendor(s) with Square tokens:\n`);

  for (const vendor of vendorsWithSquare) {
    console.log(`── ${vendor.name} (${vendor.vendorId})`);

    // Find staff schedules for this vendor
    const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({
      vendorId: vendor.vendorId,
    });

    if (!staffList || staffList.length === 0) {
      console.log('   ⚠ No staff schedules found — skipping (create a staff schedule for the owner first)\n');
      continue;
    }

    // Try to match by email first
    let target = staffList.find(s => s.staffEmail && s.staffEmail === vendor.email);

    // If no email match, use the first active staff member
    if (!target) {
      target = staffList.find(s => s.isActive !== false);
    }

    if (!target) {
      console.log('   ⚠ No matching staff schedule found — skipping\n');
      continue;
    }

    if (target.squareAccessToken) {
      console.log(`   ℹ Staff "${target.staffName}" already has Square connected — skipping\n`);
      continue;
    }

    console.log(`   → Migrating tokens to staff "${target.staffName}" (${target.visibleId})`);

    if (!dryRun) {
      // Copy tokens to staff schedule
      await client.models.StaffSchedule.update({
        visibleId: target.visibleId,
        squareAccessToken: vendor.squareAccessToken,
        squareRefreshToken: vendor.squareRefreshToken,
        squareMerchantId: vendor.squareMerchantId,
        squareLocationId: vendor.squareLocationId,
        squareOAuthStatus: vendor.squareOAuthStatus || 'connected',
        squareTokenExpiresAt: vendor.squareTokenExpiresAt,
        squareConnectedAt: vendor.squareConnectedAt,
      });

      // Clear vendor-level tokens
      await client.models.Vendor.update({
        vendorId: vendor.vendorId,
        squareAccessToken: null,
        squareRefreshToken: null,
        squareMerchantId: null,
        squareLocationId: null,
        squareApplicationId: null,
        squareOAuthStatus: null,
        squareTokenExpiresAt: null,
        squareConnectedAt: null,
      });

      console.log('   ✓ Tokens migrated and vendor tokens cleared\n');
    } else {
      console.log('   (dry run — would migrate and clear)\n');
    }
  }

  console.log('✅ Migration complete!');
}

migrate().catch(console.error);
