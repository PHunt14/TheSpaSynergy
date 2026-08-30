/**
 * Structured Error Logging - Error Logging Middleware
 *
 * Higher-order function that wraps Next.js App Router route handlers to:
 * - Catch unhandled exceptions and emit structured error logs
 * - Infer domain from route path
 * - Extract or generate correlation IDs
 * - Return standardized 500 responses on error
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import type { DomainTag, LogContext } from './types';
import { DOMAIN_ROUTE_MAPPINGS, DEFAULT_DOMAIN } from './constants';
import { Logger, createConfigFromEnv } from './logger';
import { sanitize } from './sanitizer';

/** UUID v4 validation regex */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Maximum stack trace length in characters */
const MAX_STACK_TRACE_LENGTH = 4096;

/** Maximum request body length in characters */
const MAX_REQUEST_BODY_LENGTH = 8192;

/**
 * Type for Next.js App Router route handlers.
 */
export type RouteHandler = (request: Request, context?: any) => Promise<Response>;

/**
 * Infers the business domain from a request URL pathname.
 *
 * Uses DOMAIN_ROUTE_MAPPINGS to match the path prefix to a domain tag.
 * Returns 'general' for unmatched paths.
 *
 * @param pathname - The URL pathname (e.g., "/api/payment/charge")
 * @returns The inferred DomainTag
 */
export function inferDomain(pathname: string): DomainTag {
  for (const mapping of DOMAIN_ROUTE_MAPPINGS) {
    if (pathname.startsWith(mapping.prefix)) {
      return mapping.domain;
    }
  }
  return DEFAULT_DOMAIN;
}

/**
 * Extracts a correlation ID from the request's X-Correlation-ID header.
 *
 * If the header contains a valid UUID v4, it is returned as-is.
 * If the header is missing, a new UUID v4 is generated.
 * If the header contains an invalid value, a new UUID v4 is generated
 * (the caller should store the original value in context as "originalCorrelationId").
 *
 * @param request - The incoming Request object
 * @returns An object containing the correlationId and optionally the original invalid value
 */
export function extractCorrelationId(request: Request): {
  correlationId: string;
  originalCorrelationId?: string;
} {
  const headerValue = request?.headers?.get?.('X-Correlation-ID') ?? null;

  if (!headerValue) {
    return { correlationId: crypto.randomUUID() };
  }

  if (UUID_V4_REGEX.test(headerValue)) {
    return { correlationId: headerValue };
  }

  // Invalid UUID — generate new one, keep original for context
  return {
    correlationId: crypto.randomUUID(),
    originalCorrelationId: headerValue,
  };
}

/**
 * Higher-order function that wraps a Next.js App Router route handler
 * with structured error logging capabilities.
 *
 * The wrapped handler:
 * - Extracts or generates a correlation ID from the request
 * - Infers the business domain from the request URL path
 * - Passes through successful responses with X-Correlation-ID header added
 * - On unhandled exception: logs error with full context and returns HTTP 500
 *
 * @param handler - The original route handler to wrap
 * @returns A wrapped route handler with error logging
 */
export function withErrorLogging(handler: RouteHandler): RouteHandler {
  return async (request: Request, routeContext?: any): Promise<Response> => {
    // Extract or generate correlation ID
    const { correlationId, originalCorrelationId } = extractCorrelationId(request);

    // Create a fresh Logger instance for this request
    const config = createConfigFromEnv();
    const logger = new Logger(config);
    logger.setCorrelationId(correlationId);

    // Infer domain from request URL path (handle mock requests without .url)
    let domain: DomainTag = DEFAULT_DOMAIN;
    let pathname = '';
    try {
      const url = new URL(request.url);
      pathname = url.pathname;
      domain = inferDomain(pathname);
    } catch {
      // request.url may be missing in test mocks — use default domain
    }

    try {
      // Call the original handler
      const response = await handler(request, routeContext);

      // Add correlation ID header to the successful response
      // Guard against mock responses that don't have standard Response properties
      try {
        const newResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
        });
        newResponse.headers.set('X-Correlation-ID', correlationId);
        return newResponse;
      } catch {
        return response;
      }
    } catch (error: unknown) {
      // Build error context
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const stackTrace =
        error instanceof Error && error.stack
          ? error.stack.slice(0, MAX_STACK_TRACE_LENGTH)
          : '';

      // Read and sanitize the request body
      let sanitizedBody = '';
      try {
        const bodyText = await request.clone().text();
        const truncatedBody = bodyText.slice(0, MAX_REQUEST_BODY_LENGTH);
        if (truncatedBody) {
          try {
            const parsedBody = JSON.parse(truncatedBody);
            const sanitizeResult = sanitize(
              typeof parsedBody === 'object' && parsedBody !== null
                ? parsedBody
                : { body: truncatedBody }
            );
            sanitizedBody = JSON.stringify(sanitizeResult.context);
          } catch {
            // Body is not JSON — sanitize as a plain string
            sanitizedBody = truncatedBody;
          }
        }
      } catch {
        // Unable to read body — leave empty
      }

      // Build log context
      const httpMethod = request?.method || 'UNKNOWN';
      const logContext: LogContext = {
        httpMethod,
        routePath: pathname,
        errorMessage,
        stackTrace,
      };

      if (sanitizedBody) {
        logContext.requestBody = sanitizedBody;
      }

      if (originalCorrelationId) {
        logContext.originalCorrelationId = originalCorrelationId;
      }

      // Emit error-level log entry
      logger.error(domain, `Unhandled exception in ${httpMethod} ${pathname}: ${errorMessage}`, logContext);

      // Return HTTP 500 response
      const errorResponse = new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          correlationId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId,
          },
        }
      );

      return errorResponse;
    }
  };
}
