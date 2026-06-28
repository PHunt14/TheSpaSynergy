/**
 * Migration Script: Remove vendor dependency from Service records
 *
 * This script reads all existing Service records and:
 * 1. Removes `vendorId` and `leadVendorId` fields
 * 2. Populates `categories` array from the existing `category` string field (wraps in array)
 * 3. Sets `allowedStaff` to null for services that were previously available to all vendors
 *
 * Requirements: 9.5, 2.6
 *
 * Usage: Run via Next.js API route or directly with ts-node/tsx
 *   e.g., npx tsx app/utils/migrations/removeVendorFromServices.ts
 */

import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import type { Schema } from '@/amplify/data/resource';
import config from '@/amplify_outputs.json';

Amplify.configure(config);

const client = generateClient<Schema>();

export interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  errors: { serviceId: string; error: string }[];
}

/**
 * Migrates a single service record:
 * - Strips vendorId and leadVendorId
 * - Converts category string to categories array
 * - Sets allowedStaff to null if not already set (services available to all)
 */
export async function migrateServiceRecord(service: any): Promise<{ success: boolean; error?: string }> {
  try {
    const updatePayload: Record<string, any> = {
      serviceId: service.serviceId,
    };

    // Populate categories from old `category` field if categories is not already set
    if (!service.categories || service.categories.length === 0) {
      if (service.category && typeof service.category === 'string' && service.category.trim()) {
        updatePayload.categories = [service.category.trim()];
      } else {
        updatePayload.categories = [];
      }
    }

    // Set allowedStaff to null for services that were previously available to all vendors
    // (i.e., services that don't already have an allowedStaff list set)
    if (service.allowedStaff === undefined || service.allowedStaff === null) {
      updatePayload.allowedStaff = null;
    }

    // Remove vendorId and leadVendorId by setting them to null
    // In DynamoDB/Amplify, setting a field to null effectively removes it
    if (service.vendorId !== undefined && service.vendorId !== null) {
      updatePayload.vendorId = null;
    }
    if (service.leadVendorId !== undefined && service.leadVendorId !== null) {
      updatePayload.leadVendorId = null;
    }

    // Only update if there are changes to make beyond serviceId
    if (Object.keys(updatePayload).length <= 1) {
      return { success: true }; // Nothing to update
    }

    const { errors } = await (client.models.Service as any).update(updatePayload);

    if (errors && errors.length > 0) {
      return { success: false, error: errors.map((e: any) => e.message).join('; ') };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Fetches all Service records, handling pagination.
 */
async function fetchAllServices(): Promise<any[]> {
  const allServices: any[] = [];
  let nextToken: string | undefined;

  do {
    const result: any = await client.models.Service.list({
      ...(nextToken ? { nextToken } : {}),
    });

    if (result.data) {
      allServices.push(...result.data);
    }

    nextToken = result.nextToken;
  } while (nextToken);

  return allServices;
}

/**
 * Main migration function: reads all existing Service records and removes
 * vendor associations while preserving all other fields.
 */
export async function removeVendorFromServices(): Promise<MigrationResult> {
  const result: MigrationResult = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
  };

  console.log('[Migration] Starting: removeVendorFromServices');

  // Fetch all existing services
  const services = await fetchAllServices();
  result.total = services.length;

  console.log(`[Migration] Found ${services.length} service records to process`);

  for (const service of services) {
    // Determine if this service needs migration
    const needsMigration =
      service.vendorId != null ||
      service.leadVendorId != null ||
      (!service.categories || service.categories.length === 0);

    if (!needsMigration) {
      result.skipped++;
      continue;
    }

    const migrationOutcome = await migrateServiceRecord(service);

    if (migrationOutcome.success) {
      result.migrated++;
      console.log(`[Migration] Migrated service: ${service.serviceId} (${service.name})`);
    } else {
      result.errors.push({
        serviceId: service.serviceId,
        error: migrationOutcome.error || 'Unknown error',
      });
      console.error(`[Migration] Failed to migrate service: ${service.serviceId} - ${migrationOutcome.error}`);
    }
  }

  console.log(`[Migration] Complete. Total: ${result.total}, Migrated: ${result.migrated}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`);

  return result;
}

// Allow direct execution
if (typeof require !== 'undefined' && require.main === module) {
  removeVendorFromServices()
    .then((result) => {
      console.log('[Migration] Final result:', JSON.stringify(result, null, 2));
      process.exit(result.errors.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[Migration] Fatal error:', err);
      process.exit(1);
    });
}
