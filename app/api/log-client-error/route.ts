/**
 * API Route: /api/log-client-error
 *
 * Server-side endpoint that receives client error payloads and logs them
 * via the server Logger at error level with domain "general".
 *
 * - Accepts POST with JSON body matching ClientErrorPayload
 * - Validates required fields (message, url, userAgent)
 * - Returns 200 on success, 400 on invalid payload
 *
 * Requirements: 6.4, 6.5
 */

import { NextResponse } from 'next/server';
import { Logger, createConfigFromEnv } from '@/lib/logger/logger';
import type { ClientErrorPayload } from '@/lib/logger/client-reporter';

// Create a Logger instance for this route
const loggerConfig = createConfigFromEnv();
const logger = new Logger(loggerConfig);

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  // Validate the payload
  if (!isValidPayload(body)) {
    return NextResponse.json(
      { error: 'Invalid payload: message, url, and userAgent are required string fields' },
      { status: 400 }
    );
  }

  const payload = body as ClientErrorPayload;

  // Log the client error via the server Logger
  logger.error('general', `Client error: ${payload.message}`, {
    url: payload.url,
    userAgent: payload.userAgent,
    ...(payload.stack ? { stack: payload.stack } : {}),
    ...(payload.componentStack ? { componentStack: payload.componentStack } : {}),
  });

  return NextResponse.json({ success: true }, { status: 200 });
}

/**
 * Validates that the body contains the required ClientErrorPayload fields.
 */
function isValidPayload(body: unknown): body is ClientErrorPayload {
  if (typeof body !== 'object' || body === null) return false;

  const obj = body as Record<string, unknown>;

  return (
    typeof obj.message === 'string' &&
    obj.message.length > 0 &&
    typeof obj.url === 'string' &&
    obj.url.length > 0 &&
    typeof obj.userAgent === 'string' &&
    obj.userAgent.length > 0
  );
}
