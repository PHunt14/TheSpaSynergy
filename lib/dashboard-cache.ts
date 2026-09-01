/**
 * Simple in-memory cache for dashboard queries
 * 
 * Prevents N+1 queries by caching service and staff lookups
 * Cache entries expire after 5 minutes (configurable)
 * 
 * Usage in api routes:
 *   import { getServiceCache, getStaffCache, invalidateCache } from '@/lib/dashboard-cache'
 *   const service = await getServiceCache('svc-123')
 *   const staff = await getStaffCache('staff-456')
 *   invalidateCache() // on mutation
 *
 * Requirement: 12.3 (performance optimization)
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class DashboardCache {
  private readonly serviceCache = new Map<string, CacheEntry<any>>();
  private readonly staffCache = new Map<string, CacheEntry<any>>();
  private readonly vendorServiceCache = new Map<string, CacheEntry<any[]>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.startCleanup();
  }

  private ttlMs: number;

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() > entry.expiresAt;
  }

  async getService(serviceId: string, fetcher: (id: string) => Promise<any>) {
    const cached = this.serviceCache.get(serviceId);
    if (cached && !this.isExpired(cached)) {
      return cached.value;
    }

    const value = await fetcher(serviceId);
    this.serviceCache.set(serviceId, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    return value;
  }

  async getStaff(staffId: string, fetcher: (id: string) => Promise<any>) {
    const cached = this.staffCache.get(staffId);
    if (cached && !this.isExpired(cached)) {
      return cached.value;
    }

    const value = await fetcher(staffId);
    this.staffCache.set(staffId, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    return value;
  }

  async getServicesByVendor(vendorId: string, fetcher: (id: string) => Promise<any[]>) {
    const cached = this.vendorServiceCache.get(vendorId);
    if (cached && !this.isExpired(cached)) {
      return cached.value;
    }

    const value = await fetcher(vendorId);
    this.vendorServiceCache.set(vendorId, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    return value;
  }

  invalidate() {
    this.serviceCache.clear();
    this.staffCache.clear();
    this.vendorServiceCache.clear();
  }

  invalidateService(serviceId: string) {
    this.serviceCache.delete(serviceId);
  }

  invalidateStaff(staffId: string) {
    this.staffCache.delete(staffId);
  }

  invalidateVendor(vendorId: string) {
    this.vendorServiceCache.delete(vendorId);
  }

  private startCleanup() {
    // Clean up expired entries every 60 seconds to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      let expiredServices = 0;
      let expiredStaff = 0;
      let expiredVendorServices = 0;

      for (const [key, entry] of this.serviceCache.entries()) {
        if (this.isExpired(entry)) {
          this.serviceCache.delete(key);
          expiredServices++;
        }
      }

      for (const [key, entry] of this.staffCache.entries()) {
        if (this.isExpired(entry)) {
          this.staffCache.delete(key);
          expiredStaff++;
        }
      }

      for (const [key, entry] of this.vendorServiceCache.entries()) {
        if (this.isExpired(entry)) {
          this.vendorServiceCache.delete(key);
          expiredVendorServices++;
        }
      }

      if (expiredServices + expiredStaff + expiredVendorServices > 0) {
        console.debug(`[DashboardCache] Cleaned up ${expiredServices} services, ${expiredStaff} staff, ${expiredVendorServices} vendor services`);
      }
    }, 60 * 1000);
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.invalidate();
  }

  getStats() {
    return {
      services: this.serviceCache.size,
      staff: this.staffCache.size,
      vendorServices: this.vendorServiceCache.size,
      ttlMs: this.ttlMs,
    };
  }
}

// Singleton instance for the server
let cacheInstance: DashboardCache | null = null;

export function getCache(): DashboardCache {
  if (!cacheInstance) {
    cacheInstance = new DashboardCache();
  }
  return cacheInstance;
}

export function resetCache() {
  if (cacheInstance) {
    cacheInstance.destroy();
    cacheInstance = null;
  }
}
