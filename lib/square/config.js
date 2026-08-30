/**
 * Square configuration validation — shared by the kiosk client and the
 * server-side status/payment routes.
 *
 * The goal is to FAIL LOUDLY when Square is misconfigured, rather than letting
 * the kiosk silently show a blank/"not connected" state. The most dangerous
 * misconfiguration is an environment mismatch: the OAuth application ID encodes
 * its environment (sandbox IDs are prefixed with "sandbox-"), and this must
 * agree with NEXT_PUBLIC_SQUARE_ENVIRONMENT. If they disagree, tokens are
 * minted in one environment while the Web Payments SDK loads the other, and
 * `Square.payments()` throws — previously swallowed by a bare console.error.
 */

/** Normalize the configured environment to 'production' | 'sandbox'. */
export function normalizeEnvironment(rawEnv) {
  return rawEnv === 'production' ? 'production' : 'sandbox'
}

/** Derive the environment a Square application ID belongs to. */
export function environmentForAppId(appId) {
  if (!appId) return null
  return appId.startsWith('sandbox-') ? 'sandbox' : 'production'
}

/**
 * Validate the browser-facing Square configuration.
 *
 * @param {{ appId?: string, environment?: string }} cfg
 * @returns {{ ok: boolean, code: string, message: string, environment: string }}
 *   code is a stable identifier: 'ok' | 'missing_app_id' | 'env_mismatch'
 */
export function validateSquareClientConfig({ appId, environment } = {}) {
  const env = normalizeEnvironment(environment)

  if (!appId) {
    return {
      ok: false,
      code: 'missing_app_id',
      message:
        'Square is not configured: NEXT_PUBLIC_SQUARE_APPLICATION_ID is missing. ' +
        'Set it in the environment for this deployment.',
      environment: env,
    }
  }

  const appEnv = environmentForAppId(appId)
  if (appEnv !== env) {
    return {
      ok: false,
      code: 'env_mismatch',
      message:
        `Square environment mismatch: application ID is a ${appEnv} key but ` +
        `NEXT_PUBLIC_SQUARE_ENVIRONMENT is "${env}". These must match, otherwise ` +
        'the payment form cannot initialize. Align both to the same environment.',
      environment: env,
    }
  }

  return { ok: true, code: 'ok', message: '', environment: env }
}

/**
 * Validate the server-side Square configuration used by OAuth and payment
 * routes. Mirrors the client check but reads the server-side application id
 * (SQUARE_APPLICATION_ID, falling back to the public one) against the
 * configured environment.
 *
 * @param {{ appId?: string, environment?: string }} cfg
 * @returns {{ ok: boolean, code: string, message: string, environment: string }}
 */
export function validateSquareServerConfig({ appId, environment } = {}) {
  // The server accepts either the private or public app id; the validation
  // rule (presence + environment agreement) is identical to the client.
  return validateSquareClientConfig({ appId, environment })
}
