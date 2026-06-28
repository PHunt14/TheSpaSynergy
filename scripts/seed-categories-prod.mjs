/**
 * Production: Seed ServiceCategory records + assign categories to existing services
 *
 * Unlike migrate-categories-prod.mjs (which tries to migrate a legacy 'category' field
 * that doesn't exist), this script:
 * 1. Creates the ServiceCategory records from a known list
 * 2. Maps existing production services to categories based on their serviceId
 *
 * Usage:
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/seed-categories-prod.mjs
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/seed-categories-prod.mjs --dry-run
 *
 * Safe to run multiple times (idempotent).
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

const DRY_RUN = process.argv.includes('--dry-run');

// ═══════════════════════════════════════════════════════════════
// CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const categories = [
  { categoryId: 'cat-hair', name: 'Hair Studio' },
  { categoryId: 'cat-spa-room', name: 'Spa Room' },
  { categoryId: 'cat-massage', name: 'Massage' },
  { categoryId: 'cat-wellness', name: 'Wellness' },
  { categoryId: 'cat-sauna', name: 'Sauna' },
  { categoryId: 'cat-nails', name: 'Nail Care' },
  { categoryId: 'cat-waxing', name: 'Waxing' },
  { categoryId: 'cat-facials', name: 'Facials' },
  { categoryId: 'cat-wedding', name: 'Wedding' },
  { categoryId: 'cat-signature', name: 'Signature Rituals' },
  { categoryId: 'cat-red-light', name: 'Red Light' },
  { categoryId: 'cat-tarot', name: 'Tarot' },
];

// ═══════════════════════════════════════════════════════════════
// SERVICE → CATEGORY MAPPING
// Map production serviceIds to their categories.
// Based on service names/IDs from the production output.
// ═══════════════════════════════════════════════════════════════

const serviceCategoryMap = {
  // ─── Hair Studio ───
  'svc-kera-mens-haircut': ['Hair Studio'],
  'svc-kera-womens-haircut': ['Hair Studio'],
  'svc-kera-kids-cut': ['Hair Studio'],
  'svc-kera-trim': ['Hair Studio'],
  'svc-kera-shampoo-style': ['Hair Studio'],
  'svc-kera-up-do': ['Hair Studio', 'Wedding'],
  'svc-kera-highlights': ['Hair Studio'],
  'svc-kera-color-treatment': ['Hair Studio'],
  'svc-kera-partial-vivid-color': ['Hair Studio'],
  'svc-1774876100984': ['Hair Studio'],           // Full Vivid Color Service
  'svc-1777898542360': ['Hair Studio'],           // Root Retouch
  'svc-1779208266549': ['Hair Studio'],           // Bang Trim
  'svc-selene-curling-iron': ['Hair Studio'],
  'svc-selene-flat-iron': ['Hair Studio'],
  'svc-selene-deep-conditioning': ['Hair Studio'],
  'svc-selene-hot-oil-treatment': ['Hair Studio'],
  'svc-1781971499061': ['Hair Studio'],           // Tinsel-5 Strands
  'svc-1781971549339': ['Hair Studio'],           // Tinsel-10 Strands

  // ─── Spa Room / Head Bath ───
  'svc-kera-head-bath': ['Spa Room'],
  'svc-kera-head-bath-30': ['Spa Room'],
  'svc-selene-head-bath': ['Spa Room'],
  'svc-winsome-head-bath': ['Spa Room'],
  'svc-kera-couple-head-bath': ['Spa Room'],
  'svc-kera-facial': ['Spa Room', 'Facials'],
  'svc-kera-beard-facial': ['Spa Room'],
  'svc-kera-mini-facial': ['Spa Room', 'Facials'],

  // ─── Head Bath Add-ons ───
  'svc-kera-head-bath-addon-mini-facial': ['Spa Room'],
  'svc-selene-head-bath-addon-mini-facial': ['Spa Room'],
  'svc-winsome-head-bath-addon-mini-facial': ['Spa Room'],
  'svc-kera-head-bath-addon-steam': ['Spa Room'],
  'svc-selene-head-bath-addon-steam': ['Spa Room'],
  'svc-winsome-head-bath-addon-steam': ['Spa Room'],
  'svc-kera-head-bath-addon-heat-style': ['Spa Room'],
  'svc-selene-head-bath-addon-heat-style': ['Spa Room'],
  'svc-winsome-head-bath-addon-heat-style': ['Spa Room'],
  'svc-addon-1780067725366': ['Spa Room'],        // Hot towels

  // ─── Massage ───
  'svc-winsome-massage-30': ['Massage'],          // Massage - 35 min
  'svc-winsome-massage-60': ['Massage'],
  'svc-winsome-massage-90': ['Massage'],
  'svc-1775316465220': ['Massage'],               // New Client massage

  // ─── Wellness ───
  'svc-winsome-frisson-therapy': ['Wellness'],
  'svc-winsome-reiki': ['Wellness'],
  'svc-winsome-sound-healing-30': ['Wellness'],
  'svc-winsome-salt-soak': ['Wellness'],
  'svc-1781644263682': ['Wellness', 'Red Light'], // Red light service
  'svc-winsome-redlight-therapy': ['Red Light', 'Wellness'],

  // ─── Tarot ───
  'svc-winsome-tarot-60': ['Tarot'],

  // ─── Sauna ───
  'svc-kera-sauna-25': ['Sauna'],
  'svc-kera-sauna-45': ['Sauna'],

  // ─── Nail Care ───
  'svc-kera-foot-soak': ['Nail Care'],
  'svc-kera-pedicure': ['Nail Care'],
  'svc-selene-classic-pedicure': ['Nail Care'],
  'svc-selene-deluxe-pedicure': ['Nail Care'],

  // ─── Waxing ───
  'svc-kera-wax-brows': ['Waxing'],
  'svc-kera-wax-lip-chin': ['Waxing'],

  // ─── Facials (Selene) ───
  'svc-selene-lip-treatment': ['Facials'],
  'svc-selene-eye-treatment': ['Facials'],
  'svc-selene-deluxe-ritual-addon': ['Facials'],

  // ─── Wedding ───
  'svc-kera-wedding': ['Wedding', 'Hair Studio'],

  // ─── Waxing (Selene legs/arms) ───
  'svc-selene-half-legs-wax': ['Waxing'],
  'svc-selene-full-legs-wax': ['Waxing'],
  'svc-selene-full-arms-wax': ['Waxing'],
  'svc-selene-half-arms-wax': ['Waxing'],

  // ─── Hair (additional Kids Cut) ───
  'svc-1780686405344': ['Hair Studio'],

  // ─── Wellness (Tuning forks add-on) ───
  'svc-addon-1780067756667': ['Wellness'],
};

// ═══════════════════════════════════════════════════════════════
// KEYWORD-BASED FALLBACK MAPPING
// For services not explicitly mapped above, try to infer category from name
// ═══════════════════════════════════════════════════════════════

function inferCategories(serviceId, name) {
  // Check explicit map first
  if (serviceCategoryMap[serviceId]) {
    return serviceCategoryMap[serviceId];
  }

  const lower = (name || '').toLowerCase();
  const id = (serviceId || '').toLowerCase();
  const inferred = [];

  // Waxing
  if (lower.includes('wax')) inferred.push('Waxing');

  // Facials
  if (lower.includes('facial') || lower.includes('glow facial') || lower.includes('glass skin')) inferred.push('Facials');

  // Nail Care
  if (lower.includes('manicure') || lower.includes('pedicure') || lower.includes('polish') || lower.includes('nail') || lower.includes('gel mani') || lower.includes('gel pedi')) inferred.push('Nail Care');

  // Massage
  if (lower.includes('massage')) inferred.push('Massage');

  // Hair
  if (lower.includes('haircut') || lower.includes('hair cut') || lower.includes('color') || lower.includes('highlights') || lower.includes('blowout') || lower.includes('shampoo') || lower.includes('conditioning') || lower.includes('trim') || lower.includes('tinsel') || lower.includes('silk press') || lower.includes('curling')) inferred.push('Hair Studio');

  // Spa Room / Head Bath
  if (lower.includes('head bath') || lower.includes('head spa')) inferred.push('Spa Room');

  // Sauna
  if (lower.includes('sauna')) inferred.push('Sauna');

  // Wellness
  if (lower.includes('reiki') || lower.includes('sound healing') || lower.includes('frisson') || lower.includes('detox') || lower.includes('salt') || lower.includes('red light')) inferred.push('Wellness');

  // Tarot
  if (lower.includes('tarot')) inferred.push('Tarot');

  // Signature Rituals
  if (lower.includes('ritual') || lower.includes('she-king') || lower.includes('lunar luxe')) inferred.push('Signature Rituals');

  // Wedding
  if (lower.includes('wedding') || lower.includes('bridal')) inferred.push('Wedding');

  return [...new Set(inferred)]; // dedupe
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function upsert(model, data, label) {
  try {
    const { errors } = await model.update(data);
    if (errors && errors.length > 0) {
      await model.create(data);
      console.log(`  ✓ Created: ${label}`);
    } else {
      console.log(`  ✓ Updated: ${label}`);
    }
  } catch {
    try {
      await model.create(data);
      console.log(`  ✓ Created: ${label}`);
    } catch (e2) {
      console.log(`  ⚠ Skipped: ${label} (${e2?.message || 'unknown'})`);
    }
  }
}

async function run() {
  if (DRY_RUN) console.log('🏜 DRY RUN MODE — no changes will be written\n');
  console.log('🔄 Starting category seeding for production...\n');

  // ── Step 1: Create ServiceCategory records ──
  console.log('── Creating ServiceCategory records ──');
  for (const cat of categories) {
    if (DRY_RUN) {
      console.log(`  → would create/update: ${cat.name} (${cat.categoryId})`);
    } else {
      await upsert(client.models.ServiceCategory, { ...cat, createdAt: new Date().toISOString() }, cat.name);
    }
  }

  // ── Step 2: Fetch all services ──
  console.log('\n── Fetching services ──');
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

  // ── Step 3: Assign categories ──
  console.log('── Assigning categories to services ──');
  let updated = 0;
  let skipped = 0;
  let noMatch = [];

  for (const svc of allServices) {
    // Skip if already has categories
    if (svc.categories && Array.isArray(svc.categories) && svc.categories.length > 0) {
      skipped++;
      continue;
    }

    const cats = inferCategories(svc.serviceId, svc.name);

    if (cats.length === 0) {
      noMatch.push({ serviceId: svc.serviceId, name: svc.name });
      continue;
    }

    if (DRY_RUN) {
      console.log(`  → ${svc.name}: would set categories = ${JSON.stringify(cats)}`);
    } else {
      try {
        await client.models.Service.update({
          serviceId: svc.serviceId,
          categories: cats,
        });
        console.log(`  ✓ ${svc.name}: ${JSON.stringify(cats)}`);
        updated++;
      } catch (err) {
        console.log(`  ⚠ Failed: ${svc.name} — ${err?.message || 'unknown'}`);
      }
    }
  }

  // ── Summary ──
  console.log('\n════════════════════════════════════════════════════════════');
  if (DRY_RUN) {
    console.log('🏜 DRY RUN COMPLETE (no changes written)');
  } else {
    console.log('✅ Category seeding complete!');
  }
  console.log(`   ${categories.length} ServiceCategory records created/updated`);
  console.log(`   ${updated} services assigned categories`);
  console.log(`   ${skipped} services skipped (already have categories)`);

  if (noMatch.length > 0) {
    console.log(`\n⚠ ${noMatch.length} services could NOT be categorized (no match):`);
    for (const s of noMatch) {
      console.log(`   - ${s.name} (${s.serviceId})`);
    }
    console.log('\n   → Add these to the serviceCategoryMap in this script and re-run.');
  }
}

run().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
