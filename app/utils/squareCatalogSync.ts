/**
 * Square Catalog Sync Trigger
 *
 * Synchronizes service catalog items to a staff member's Square account
 * when the service's allowedStaff list changes.
 *
 * - When action='add': adds the service to the staff member's Square catalog
 * - When action='remove': removes the service from the staff member's Square catalog
 * - Looks up staff member's Square credentials from StaffSchedule
 * - If sync fails, returns { success: false, error: '...' } (never throws)
 *
 * Requirements: 3.5, 3.6, 3.8
 */

export interface SyncResult {
  success: boolean;
  error?: string;
  itemsSynced?: number;
}

export interface Service {
  serviceId: string;
  name: string;
  description?: string;
  categories?: string[] | null;
  duration: number;
  price: number;
  allowedStaff?: string[] | null;
  [key: string]: unknown;
}

export interface StaffSquareInfo {
  visibleId: string;
  squareAccessToken?: string | null;
  squareLocationId?: string | null;
  squareOAuthStatus?: string | null;
  squareCatalogMappings?: string | null;
}

/**
 * Triggers a Square catalog sync for a specific staff member when their
 * allowedStaff assignment changes for a service.
 *
 * This function calls the internal catalog-sync API endpoint to perform
 * the actual Square API interaction. It handles failures gracefully
 * by returning a SyncResult with success=false rather than throwing.
 *
 * @param staffId - The staff member's visibleId
 * @param action - 'add' (service added to staff) or 'remove' (service removed from staff)
 * @param service - The service being added/removed
 * @param options - Optional configuration (e.g., base URL for internal API calls)
 * @returns Promise<SyncResult>
 */
export async function triggerSquareSync(
  staffId: string,
  action: 'add' | 'remove',
  service: Service,
  options?: { baseUrl?: string; fetchFn?: typeof fetch }
): Promise<SyncResult> {
  try {
    if (!staffId) {
      return { success: false, error: 'Staff ID is required' };
    }

    if (!service?.serviceId) {
      return { success: false, error: 'Service with valid serviceId is required' };
    }

    // Use the internal catalog-sync API to perform the Square sync.
    // The catalog-sync endpoint handles:
    // - Looking up staff credentials from StaffSchedule
    // - Building catalog objects
    // - Calling Square's batchUpsertCatalogObjects API
    // - Updating squareCatalogMappings on the staff record
    const baseUrl = options?.baseUrl || getBaseUrl();
    const fetchFn = options?.fetchFn || fetch;

    if (action === 'add') {
      // Trigger a full catalog sync for this staff member.
      // The catalog-sync endpoint will include all services assigned to the staff member,
      // which now includes the newly added service.
      const response = await fetchFn(`${baseUrl}/api/square/catalog-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as any)?.error || `Catalog sync failed with status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const result = await response.json();
      return {
        success: true,
        itemsSynced: (result as any)?.synced ?? 1,
      };
    } else {
      // action === 'remove'
      // Trigger a full catalog sync for this staff member.
      // The catalog-sync endpoint will rebuild the catalog without the removed service.
      // Note: The service is already removed from allowedStaff at this point,
      // so re-syncing will exclude it from the staff member's catalog.
      const response = await fetchFn(`${baseUrl}/api/square/catalog-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = (errorData as any)?.error || `Catalog sync (remove) failed with status ${response.status}`;
        return { success: false, error: errorMessage };
      }

      const result = await response.json();
      return {
        success: true,
        itemsSynced: (result as any)?.synced ?? 0,
      };
    }
  } catch (error: unknown) {
    // Handle network errors, timeouts, etc. gracefully
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    console.error(`[SquareCatalogSync] Failed to sync staff=${staffId} action=${action} service=${service?.serviceId}:`, message);
    return { success: false, error: `Square catalog sync failed: ${message}` };
  }
}

/**
 * Computes the diff between old and new allowedStaff arrays.
 * Returns arrays of added and removed staff IDs.
 */
export function computeAllowedStaffDiff(
  oldStaff: string[] | null | undefined,
  newStaff: string[] | null | undefined
): { added: string[]; removed: string[] } {
  const oldArr = oldStaff || [];
  const newArr = newStaff || [];
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);

  // Staff in new but not in old → added
  const added = newArr.filter((id) => !oldSet.has(id));

  // Staff in old but not in new → removed
  const removed = oldArr.filter((id) => !newSet.has(id));

  return { added, removed };
}

/**
 * Triggers Square catalog sync for all staff members affected by an
 * allowedStaff change. Runs syncs in parallel and collects results.
 *
 * Returns an array of sync results with staff IDs and actions.
 * Individual failures do NOT block other syncs or the local save.
 */
export async function syncAllowedStaffChanges(
  oldStaff: string[] | null | undefined,
  newStaff: string[] | null | undefined,
  service: Service,
  options?: { baseUrl?: string; fetchFn?: typeof fetch }
): Promise<{ staffId: string; action: 'add' | 'remove'; result: SyncResult }[]> {
  const { added, removed } = computeAllowedStaffDiff(oldStaff, newStaff);

  if (added.length === 0 && removed.length === 0) {
    return [];
  }

  const syncPromises: Promise<{ staffId: string; action: 'add' | 'remove'; result: SyncResult }>[] = [];

  for (const staffId of added) {
    syncPromises.push(
      triggerSquareSync(staffId, 'add', service, options).then((result) => ({
        staffId,
        action: 'add' as const,
        result,
      }))
    );
  }

  for (const staffId of removed) {
    syncPromises.push(
      triggerSquareSync(staffId, 'remove', service, options).then((result) => ({
        staffId,
        action: 'remove' as const,
        result,
      }))
    );
  }

  return Promise.all(syncPromises);
}

/**
 * Gets the base URL for internal API calls.
 * In server-side Next.js context, we need the full URL.
 */
function getBaseUrl(): string {
  // In production/deployed environments
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  // Fallback for local development
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  return 'http://localhost:3000';
}
