import { defineFunction } from '@aws-amplify/backend';

/**
 * Scheduled function that proactively refreshes Square OAuth access tokens for
 * staff (and the house vendor's staff) BEFORE they expire.
 *
 * Square production access tokens last ~30 days; refresh tokens are long-lived.
 * Without this job, tokens only get refreshed just-in-time on the next card
 * payment — so if a location goes a while without card payments, its token
 * lapses and the kiosk shows "pay in person" until someone reconnects. Running
 * daily keeps every connected account chargeable.
 *
 * Credentials come from the SAME environment variables the rest of the app
 * already uses (set as Amplify app/branch environment variables, e.g.
 * SQUARE_APPLICATION_ID = sq0idp-... on the live app). They are read here at
 * backend BUILD time (during `ampx sandbox` / `ampx pipeline-deploy`, which run
 * with the branch env vars present) and passed into the function's runtime
 * environment. This means no separate secret needs to be configured — the
 * function automatically uses the local app's credentials in sandbox and the
 * production app's credentials on the deployed branch.
 *
 * The refresh MUST use the same Square application that minted the tokens, so
 * relying on the per-environment SQUARE_APPLICATION_ID is exactly right.
 *
 * NEXT_PUBLIC_SQUARE_ENVIRONMENT selects the Square API host; defaults to
 * production to match the live app.
 */
export const refreshSquareTokens = defineFunction({
  name: 'refresh-square-tokens',
  entry: './handler.ts',
  // Run every day. Tokens are refreshed when within 7 days of expiry, so a
  // daily cadence gives many chances to renew before a 30-day token lapses.
  schedule: 'every day',
  timeoutSeconds: 300,
  environment: {
    SQUARE_APPLICATION_ID: process.env.SQUARE_APPLICATION_ID || '',
    SQUARE_APPLICATION_SECRET: process.env.SQUARE_APPLICATION_SECRET || '',
    SQUARE_ENVIRONMENT: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT || 'production',
  },
});
