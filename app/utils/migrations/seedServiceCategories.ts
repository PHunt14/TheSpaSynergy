/**
 * Seed script: Extract unique categories from existing Service records
 * and create ServiceCategory records with case-insensitive deduplication.
 *
 * Requirements: 2.5, 2.6
 *
 * Usage: npx tsx app/utils/migrations/seedServiceCategories.ts
 */

import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import type { Schema } from '@/amplify/data/resource';
import config from '@/amplify_outputs.json';

Amplify.configure(config);

const client = generateClient<Schema>();

/**
 * Collects all unique category strings from existing Service records,
 * performing case-insensitive deduplication (keeps the first occurrence's casing).
 */
async function extractUniqueCategories(): Promise<string[]> {
  const categoryMap = new Map<string, string>(); // lowercase -> original casing

  let nextToken: string | undefined;
  do {
    const { data: services, nextToken: token } = await client.models.Service.list({
      ...(nextToken ? { nextToken } : {}),
    } as any);

    for (const service of services || []) {
      const categories = service.categories as string[] | null | undefined;
      if (categories && Array.isArray(categories)) {
        for (const cat of categories) {
          const trimmed = cat.trim();
          if (trimmed.length >= 2 && trimmed.length <= 50) {
            const key = trimmed.toLowerCase();
            if (!categoryMap.has(key)) {
              categoryMap.set(key, trimmed);
            }
          }
        }
      }
    }

    nextToken = token as string | undefined;
  } while (nextToken);

  return Array.from(categoryMap.values());
}

/**
 * Fetches existing ServiceCategory records to avoid creating duplicates.
 */
async function getExistingCategoryNames(): Promise<Set<string>> {
  const names = new Set<string>();

  let nextToken: string | undefined;
  do {
    const { data: categories, nextToken: token } = await client.models.ServiceCategory.list({
      ...(nextToken ? { nextToken } : {}),
    } as any);

    for (const cat of categories || []) {
      if (cat.name) {
        names.add(cat.name.toLowerCase());
      }
    }

    nextToken = token as string | undefined;
  } while (nextToken);

  return names;
}

/**
 * Creates ServiceCategory records for each unique category that doesn't already exist.
 */
async function seedServiceCategories(): Promise<void> {
  console.log('Starting ServiceCategory seed...');

  const uniqueCategories = await extractUniqueCategories();
  console.log(`Found ${uniqueCategories.length} unique categories from Service records.`);

  if (uniqueCategories.length === 0) {
    console.log('No categories found in existing services. Nothing to seed.');
    return;
  }

  const existingNames = await getExistingCategoryNames();
  console.log(`Found ${existingNames.size} existing ServiceCategory records.`);

  let created = 0;
  let skipped = 0;

  for (const categoryName of uniqueCategories) {
    if (existingNames.has(categoryName.toLowerCase())) {
      console.log(`  Skipped (already exists): "${categoryName}"`);
      skipped++;
      continue;
    }

    const { data, errors } = await client.models.ServiceCategory.create({
      categoryId: crypto.randomUUID(),
      name: categoryName,
      createdAt: new Date().toISOString(),
    });

    if (errors) {
      console.error(`  Failed to create category "${categoryName}":`, errors);
    } else {
      console.log(`  Created: "${categoryName}" (id: ${data?.categoryId})`);
      created++;
    }
  }

  console.log(`\nSeed complete. Created: ${created}, Skipped: ${skipped}`);
}

// Run the seed
seedServiceCategories()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });

export { extractUniqueCategories, getExistingCategoryNames, seedServiceCategories };
