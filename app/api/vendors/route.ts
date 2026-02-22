import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET() {
  try {
    const { data: vendors, errors } = await client.models.Vendor.list({
      filter: { isActive: { eq: true } } as any
    });

    if (errors) {
      console.error('Error fetching vendors:', errors);
      return Response.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }

    return Response.json({ vendors });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    return Response.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
}
