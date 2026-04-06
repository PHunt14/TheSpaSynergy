import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { Amplify } from 'aws-amplify';
import config from '@/amplify_outputs.json';
import { cookies } from 'next/headers';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

export const client = generateClient<Schema>();

export async function getCurrentUser() {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        return {
          role: idToken.payload['custom:role'] as string || 'staff',
          vendorId: idToken.payload['custom:vendorId'] as string,
        };
      }
    });
  } catch {
    return null;
  }
}
