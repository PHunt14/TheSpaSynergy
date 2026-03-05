import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { cookies } from 'next/headers'
import { fetchAuthSession } from 'aws-amplify/auth/server'
import { createServerRunner } from '@aws-amplify/adapter-nextjs'

Amplify.configure(config, { ssr: true })
const { runWithAmplifyServerContext } = createServerRunner({ config })
const client = generateClient<Schema>()

// Get current user from session
const getCurrentUserFromSession = async () => {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        
        return {
          role: idToken.payload['custom:role'] as string || 'staff',
          vendorId: idToken.payload['custom:vendorId'] as string
        };
      }
    });
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive');

    const filter = includeInactive === 'true' 
      ? {} 
      : { isActive: { eq: true } };

    const { data: vendors, errors } = await client.models.Vendor.list({
      filter: filter as any
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vendorId, name, email, description, phone, bufferMinutes, isActive, workingHours } = body;

    if (!vendorId || !name || !email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, errors } = await client.models.Vendor.create({
      vendorId,
      name,
      email,
      description,
      phone,
      bufferMinutes: bufferMinutes || 15,
      isActive: isActive !== undefined ? isActive : true,
      workingHours: workingHours ? JSON.stringify(workingHours) as any : null
    });

    if (errors) {
      console.error('Error creating vendor:', errors);
      return Response.json({ error: 'Failed to create vendor' }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error creating vendor:', error);
    return Response.json({ error: 'Failed to create vendor' }, { status: 500 });
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

    const { data, errors } = await client.models.Vendor.update(body as any);

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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get('vendorId');

    if (!vendorId) {
      return Response.json({ error: 'vendorId required' }, { status: 400 });
    }

    const { data, errors } = await client.models.Vendor.delete({ vendorId });

    if (errors) {
      console.error('Error deleting vendor:', errors);
      return Response.json({ error: 'Failed to delete vendor' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    return Response.json({ error: 'Failed to delete vendor' }, { status: 500 });
  }
}
