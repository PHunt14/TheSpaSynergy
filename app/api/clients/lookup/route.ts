import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { normalizePhone, normalizeEmail } from '@/app/utils/client.js';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

/**
 * GET /api/clients/lookup?phone=xxx&email=xxx
 * Uses Client secondary indexes (listClientByPhone / listClientByEmail)
 * for O(1) lookup instead of full table scan.
 * Returns { found: boolean } indicating if a matching client exists.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get('phone');
  const email = searchParams.get('email');

  try {
    // Try phone lookup first using secondary index
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone) {
      const { data } = await (client.models.Client as any).listClientByPhone({ phone: normalizedPhone });
      if (data && data.length > 0) {
        return Response.json({ found: true });
      }
    }

    // Try email lookup using secondary index
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail) {
      const { data } = await (client.models.Client as any).listClientByEmail({ email: normalizedEmail });
      if (data && data.length > 0) {
        return Response.json({ found: true });
      }
    }

    return Response.json({ found: false });
  } catch (error) {
    // Silently return not found on errors - do not block booking flow
    console.error('Client lookup error:', error);
    return Response.json({ found: false });
  }
}
