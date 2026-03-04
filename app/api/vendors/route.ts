import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { cookies } from 'next/headers'
import { fetchAuthSession } from 'aws-amplify/auth/server'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

// Get current user from session
const getCurrentUserFromSession = async () => {
  try {
    const session = await fetchAuthSession({ cookies });
    const idToken = session.tokens?.idToken;
    if (!idToken) return null;
    
    return {
      role: idToken.payload['custom:role'] as string || 'staff',
      vendorId: idToken.payload['custom:vendorId'] as string
    };
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

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

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { vendorId } = body;

    if (!vendorId) {
      return Response.json({ error: 'vendorId required' }, { status: 400 });
    }

    const currentUser = await getCurrentUserFromSession();
    // Only enforce vendor restriction for staff
    if (currentUser?.role === 'staff' && vendorId !== currentUser.vendorId) {
      return Response.json({ error: 'Unauthorized: Staff can only update their own vendor' }, { status: 403 });
    }

    const { data, errors } = await client.models.Vendor.update(body);

    if (errors) {
      console.error('Error updating vendor:', errors);
      return Response.json({ error: 'Failed to update vendor' }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error updating vendor:', error);
    return Response.json({ error: 'Failed to update vendor' }, { status: 500 });
  }
}
