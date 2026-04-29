export function buildCategoryObject(categoryName: string): any;
export function buildItemObject(service: any, categoryId: string | null): any;
export function getStaffServices(allServices: any[], staffVisibleId: string): any[];
export function groupByCategory(services: any[]): Map<string, any[]>;
export function buildUpsertBatches(services: any[], existingCatalog?: { items: Map<string, string>; categories: Map<string, string> }): any[];
export function parseSyncResponse(responseObjects: any[] | null): { items: number; categories: number };
export function buildOrderLineItems(services: any[], people?: number | null): any[];
