import type { EventBridgeHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { Client, Environment } from 'square';
import type { Schema } from '../../data/resource';
import { shouldProactivelyRefresh } from '../../../lib/square/core.js';

/**
 * Daily scheduled refresh of Square OAuth tokens for all connected StaffSchedule
 * records. Renews access tokens before they expire so card payments never lapse.
 *
 * For each record that should be refreshed (has a refresh token, not disconnected,
 * and expiring within the threshold), we call Square's refresh grant and persist
 * the new access/refresh token + expiry. On a hard failure (e.g. revoked refresh
 * token) we mark the record 'error' so staff are prompted to reconnect and the
 * kiosk shows the accurate "needs reconnect" state.
 *
 * Configuration: reads values injected into the Lambda environment
 *   - AMPLIFY_DATA_GRAPHQL_ENDPOINT  (injected because backend grants this
 *     function access to the data API via allow.resource(); the function's IAM
 *     role is authorized for AWS_IAM auth against AppSync)
 *   - AWS_REGION                     (provided by the Lambda runtime)
 *   - SQUARE_APPLICATION_ID / SQUARE_APPLICATION_SECRET (Amplify secrets)
 *   - SQUARE_ENVIRONMENT             (plain env, defaults to production)
 *
 * We configure the client explicitly from process.env (matching the existing
 * send-sms / send-email functions) rather than the codegen-dependent
 * `$amplify/env` module, so the backend typecheck passes without generated files.
 *
 * Idempotent and safe to re-run: records already fresh are skipped.
 */
export const handler: EventBridgeHandler<'Scheduled Event', null, void> = async () => {
  const graphqlEndpoint = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;
  const region = process.env.AWS_REGION || 'us-east-1';
  const appId = process.env.SQUARE_APPLICATION_ID;
  const appSecret = process.env.SQUARE_APPLICATION_SECRET;
  const squareEnv = (process.env.SQUARE_ENVIRONMENT || 'production').toLowerCase();

  if (!graphqlEndpoint) {
    console.error('[refresh-square-tokens] Missing AMPLIFY_DATA_GRAPHQL_ENDPOINT; data access not granted. Aborting.');
    return;
  }
  if (!appId || !appSecret) {
    console.error('[refresh-square-tokens] Missing SQUARE_APPLICATION_ID / SQUARE_APPLICATION_SECRET secrets; aborting.');
    return;
  }

  // Configure the Amplify data client to sign requests with the function's IAM
  // role (AWS_IAM), which backend.ts authorizes via allow.resource().
  Amplify.configure(
    {
      API: {
        GraphQL: {
          endpoint: graphqlEndpoint,
          region,
          defaultAuthMode: 'iam',
        },
      },
    },
    {
      Auth: {
        // Provide the Lambda's execution-role credentials to the signer.
        credentialsProvider: {
          getCredentialsAndIdentityId: async () => ({
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
              sessionToken: process.env.AWS_SESSION_TOKEN as string,
            },
          }),
          clearCredentialsAndIdentityId: () => {
            /* no-op */
          },
        },
      },
    }
  );

  const client = generateClient<Schema>({ authMode: 'iam' });

  const squareClient = new Client({
    environment: squareEnv === 'production' ? Environment.Production : Environment.Sandbox,
  });

  // Page through all staff schedules.
  const records: Array<Record<string, any>> = [];
  let nextToken: string | null | undefined = undefined;
  do {
    const page: any = await client.models.StaffSchedule.list({ nextToken, limit: 200 } as any);
    if (page?.data) records.push(...page.data);
    nextToken = page?.nextToken || null;
  } while (nextToken);

  const candidates = records.filter((r) => shouldProactivelyRefresh(r, 7));

  console.log(`[refresh-square-tokens] ${records.length} staff records; ${candidates.length} need refresh.`);

  let refreshed = 0;
  let failed = 0;

  for (const staff of candidates) {
    try {
      const { result } = await squareClient.oAuthApi.obtainToken({
        clientId: appId,
        clientSecret: appSecret,
        grantType: 'refresh_token',
        refreshToken: staff.squareRefreshToken,
      });

      if (!result.accessToken) {
        throw new Error('No access token returned from Square refresh');
      }

      const newExpiresAt =
        result.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await client.models.StaffSchedule.update({
        visibleId: staff.visibleId,
        squareAccessToken: result.accessToken,
        squareRefreshToken: result.refreshToken || staff.squareRefreshToken,
        squareTokenExpiresAt: newExpiresAt,
        squareOAuthStatus: 'connected',
      } as any);

      refreshed++;
    } catch (error: any) {
      failed++;
      // Token could not be refreshed (e.g. revoked). Flag for manual reconnect so
      // the dashboard warning and kiosk "needs reconnect" state kick in. Never
      // throw — one bad record must not stop the rest of the batch.
      console.error(`[refresh-square-tokens] refresh failed for ${staff.visibleId}:`, error?.message || error);
      try {
        await client.models.StaffSchedule.update({
          visibleId: staff.visibleId,
          squareOAuthStatus: 'error',
        } as any);
      } catch (updateErr: any) {
        console.error(`[refresh-square-tokens] could not mark ${staff.visibleId} as error:`, updateErr?.message || updateErr);
      }
    }
  }

  console.log(`[refresh-square-tokens] done. refreshed=${refreshed} failed=${failed}`);
};
