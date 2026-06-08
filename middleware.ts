import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Redirect rule definition for legacy vendor URL → provider URL mapping.
 */
export interface RedirectRule {
  pattern: RegExp;
  replacement: string | ((path: string, url: URL) => string);
  statusCode: 301;
}

/**
 * Legacy redirect rules mapping old vendor URLs to new provider URLs.
 * Order matters: more specific patterns should appear before general ones.
 */
export const REDIRECT_RULES: RedirectRule[] = [
  // /booking/multi-vendor → /booking/bundle
  {
    pattern: /^\/booking\/multi-vendor(\/.*)?$/,
    replacement: '/booking/bundle$1',
    statusCode: 301,
  },
  // /booking/service?vendor=X → /booking (strip vendor query param)
  {
    pattern: /^\/booking\/service$/,
    replacement: (path: string, url: URL) => {
      if (url.searchParams.has('vendor')) {
        return '/booking';
      }
      // If no vendor param, don't redirect
      return '';
    },
    statusCode: 301,
  },
  // /dashboard/vendors → /dashboard/providers
  {
    pattern: /^\/dashboard\/vendors(\/.*)?$/,
    replacement: '/dashboard/providers$1',
    statusCode: 301,
  },
  // /api/vendors → /api/providers
  {
    pattern: /^\/api\/vendors(\/.*)?$/,
    replacement: '/api/providers$1',
    statusCode: 301,
  },
  // /vendors/[id] → /providers/[id] and /vendors → /providers
  {
    pattern: /^\/vendors(\/.*)?$/,
    replacement: '/providers$1',
    statusCode: 301,
  },
];

/**
 * Resolves a redirect for a given path (and optional URL for query params).
 * Returns the redirect target and status code, or null if no redirect applies.
 *
 * Exported for testing purposes.
 */
export function resolveRedirect(
  path: string,
  url?: URL
): { redirectTo: string; statusCode: number } | null {
  for (const rule of REDIRECT_RULES) {
    const match = path.match(rule.pattern);
    if (match) {
      let redirectTo: string;

      if (typeof rule.replacement === 'function') {
        redirectTo = rule.replacement(path, url || new URL(`http://localhost${path}`));
        // If the function returns empty string, this rule doesn't apply
        if (!redirectTo) continue;
      } else {
        // Replace $1, $2, etc. capture group references
        redirectTo = rule.replacement.replace(/\$(\d+)/g, (_, index) => {
          return match[parseInt(index)] || '';
        });
      }

      return { redirectTo, statusCode: rule.statusCode };
    }
  }

  return null;
}

/**
 * Next.js middleware function.
 * Intercepts requests to legacy vendor URLs and returns 301 redirects.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const result = resolveRedirect(pathname, request.nextUrl);

  if (result) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = result.redirectTo;

    // For /booking/service?vendor=X → /booking, strip all query params
    if (pathname === '/booking/service' && request.nextUrl.searchParams.has('vendor')) {
      redirectUrl.search = '';
    }

    return NextResponse.redirect(redirectUrl, result.statusCode);
  }

  return NextResponse.next();
}

/**
 * Middleware matcher configuration.
 * Only run middleware on paths that might need redirection.
 */
export const config = {
  matcher: [
    '/vendors/:path*',
    '/vendors',
    '/dashboard/vendors/:path*',
    '/dashboard/vendors',
    '/api/vendors/:path*',
    '/api/vendors',
    '/booking/multi-vendor/:path*',
    '/booking/multi-vendor',
    '/booking/service',
  ],
};
