/**
 * Production Migration: Seed ServiceCategory table + copy category → categories
 *
 * Run ONCE after deploying the unified business model changes to production.
 * This script:
 * 1. Reads all existing services and extracts unique category names
 * 2. Creates ServiceCategory records for each unique category
 * 3. Updates each service to populate the 'categories' array from the legacy 'category' field
 *
 * Usage:
 *   Set amplify_outputs.json to point at production (or use amplify_outputs_main.json)
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/migrate-categories-prod.mjs
 *
 * Safe to run multiple times (idempotent via upsert logic).
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';

// Point at production — update this path if needed
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

async function migrate() {
  console.log('🔄 Starting category migration for production...\n');

  // 1. Fetch all services
  let allServices = [];
  let nextToken = null;
  do {
    const result = await client.models.Service.list({
      ...(nextToken ? { nextToken } : {}),
      limit: 200,
    });
    allServices.push(...(result.data || []));
    nextToken = result.nextToken;
  } while (nextToken);

  console.log(`  Found ${allServices.length} services\n`);

  // 2. Extract unique categories from legacy 'category' field
  const categorySet = new Set();
  for (const svc of allServices) {
    if (svc.category && typeof svc.category === 'string' && svc.category.trim()) {
      categorySet.add(svc.category.trim());
    }
    // Also pick up any that already have the array field
    if (svc.categories && Array.isArray(svc.categories)) {
      svc.categories.forEach(c => { if (c && c.trim()) categorySet.add(c.trim()) });
    }
  }

  const uniqueCategories = [...categorySet].sort();
  console.log(`  Found ${uniqueCategories.length} unique categories: ${uniqueCategories.join(', ')}\n`);

  // 3. Create ServiceCategory records
  console.log('── Creating ServiceCategory records ──');
  for (const name of uniqueCategories) {
    const categoryId = `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;
    try {
      await client.models.ServiceCategory.create({
        categoryId,
        name,
        createdAt: new Date().toISOString(),
      });
      console.log(`  ✓ Created: ${name} (${categoryId})`);
    } catch (err) {
      // Likely already exists
      if (err?.message?.includes('ConditionalCheckFailed') || err?.errors?.[0]?.message?.includes('ConditionalCheckFailed')) {
        console.log(`  - Already exists: ${name}`);
      } else {
        // Try update instead
        try {
          await client.models.ServiceCategory.update({ categoryId, name });
          console.log(`  ✓ Updated: ${name}`);
        } catch {
          console.log(`  ⚠ Skipped: ${name} (${err?.message || 'unknown error'})`);
        }
      }
    }
  }

  // 4. Update services: copy 'category' → 'categories' array where missing
  console.log('\n── Updating services with categories array ──');
  let updated = 0;
  let skipped = 0;

  for (const svc of allServices) {
    // Skip if already has categories array populated
    if (svc.categories && Array.isArray(svc.categories) && svc.categories.length > 0) {
      skipped++;
      continue;
    }

    // Only update if there's a legacy category to migrate
    if (!svc.category || typeof svc.category !== 'string' || !svc.category.trim()) {
      skipped++;
      continue;
    }

    try {
      await client.models.Service.update({
        serviceId: svc.serviceId,
        categories: [svc.category.trim()],
      });
      updated++;
      console.log(`  ✓ ${svc.name}: "${svc.category}" → ["${svc.category}"]`);
    } catch (err) {
      console.log(`  ⚠ Failed to update ${svc.name}: ${err?.message || 'unknown'}`);
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   ${uniqueCategories.length} categories seeded`);
  console.log(`   ${updated} services updated with categories array`);
  console.log(`   ${skipped} services skipped (already migrated or no category)`);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
