// Type declarations for the plain-JS Square core helpers, so TypeScript
// consumers (Next app routes and the Amplify functions under strict mode) get
// proper types from the single source of truth in core.js.

export interface SquareConnectableRecord {
  squareAccessToken?: string | null;
  squareRefreshToken?: string | null;
  squareLocationId?: string | null;
  squareOAuthStatus?: string | null;
  squareTokenExpiresAt?: string | null;
  [key: string]: unknown;
}

export function buildOAuthUrl(
  vendorId: string,
  opts: { appId?: string; baseUrl: string; environment?: string }
): string | null;

export function decodeOAuthState(state: string): Record<string, unknown> | null;

export function verifyWebhookSignature(
  body: string,
  signature: string,
  webhookUrl: string,
  sigKey: string
): boolean;

export function buildVendorTokenUpdate(
  vendorId: string,
  tokenResult: Record<string, unknown>,
  locationId: string,
  appId: string
): Record<string, unknown> | null;

export function buildVendorDisconnectUpdate(vendorId: string): Record<string, unknown>;

export function buildStaffTokenUpdate(
  visibleId: string,
  tokenResult: Record<string, unknown>,
  locationId: string
): Record<string, unknown> | null;

export function buildStaffDisconnectUpdate(visibleId: string): Record<string, unknown>;

export function processPaymentEvent(
  event: Record<string, any>,
  existingAppointment: Record<string, any>
): Record<string, unknown> | null;

export function validateVendorForPayment(
  vendor: Record<string, unknown>,
  staff: { squareAccessToken?: string; squareOAuthStatus?: string; squareLocationId?: string }
): { error: string; details: string; status: number } | { accessToken: string; locationId?: string };

export function isTokenExpiringSoon(
  expiresAt: string | null | undefined,
  thresholdDays?: number
): boolean;

export function isTokenExpired(expiresAt: string | null | undefined): boolean;

export function isSquareRecordChargeable(rec: SquareConnectableRecord | null | undefined): boolean;

export function squareRecordNeedsReconnect(rec: SquareConnectableRecord | null | undefined): boolean;

export function shouldProactivelyRefresh(
  rec: SquareConnectableRecord | null | undefined,
  thresholdDays?: number
): boolean;
