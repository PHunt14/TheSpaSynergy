import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

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
    // Session fetch can fail, return null to allow admin/superadmin through
    return null;
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const includeInactive = searchParams.get('includeInactive');

  try {
    if (vendorId) {
      const filter = includeInactive === 'true' 
        ? { vendorId: { eq: vendorId } }
        : { vendorId: { eq: vendorId }, isActive: { eq: true } };

      const { data: services, errors } = await client.models.Service.list({
        filter: filter as any
      });

      if (errors) {
        console.error('Error fetching services:', errors);
        return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
      }

      return Response.json({ services });
    } else {
      const { data: services, errors } = await client.models.Service.list();

      if (errors) {
        console.error('Error fetching services:', errors);
        return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
      }

      return Response.json({ services });
    }
  } catch (error) {
    console.error('Error fetching services:', error);
    return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serviceId, vendorId, name, duration, price, isActive, category, resourceType, houseFeeEnabled, houseFeeAmount, houseFeePercent } = body;

    if (!serviceId || !vendorId || !name || !duration || price === undefined) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const currentUser = await getCurrentUserFromSession();
    // Only enforce vendor restriction for staff
    if (currentUser?.role === 'staff' && vendorId !== currentUser.vendorId) {
      return Response.json({ error: 'Unauthorized: Staff can only create services for their own vendor' }, { status: 403 });
    }

    const { data, errors } = await client.models.Service.create({
      serviceId,
      vendorId,
      name,
      duration,
      price,
      category,
      resourceType,
      houseFeeEnabled: houseFeeEnabled || false,
      houseFeeAmount: houseFeeAmount || 0,
      houseFeePercent: houseFeePercent || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    if (errors) {
      console.error('Error creating service:', errors);
      return Response.json({ error: 'Failed to create service' }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error creating service:', error);
    return Response.json({ error: 'Failed to create service' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId');

    if (!serviceId) {
      return Response.json({ error: 'serviceId required' }, { status: 400 });
    }

    const currentUser = await getCurrentUserFromSession();
    // Only enforce vendor restriction for staff
    if (currentUser?.role === 'staff') {
      const { data: service } = await client.models.Service.get({ serviceId });
      if (service && service.vendorId !== currentUser.vendorId) {
        return Response.json({ error: 'Unauthorized: Staff can only delete services from their own vendor' }, { status: 403 });
      }
    }

    const { data, errors } = await client.models.Service.delete({ serviceId });

    if (errors) {
      console.error('Error deleting service:', errors);
      return Response.json({ error: 'Failed to delete service' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    return Response.json({ error: 'Failed to delete service' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { serviceId } = body;

    if (!serviceId) {
      return Response.json({ error: 'serviceId required' }, { status: 400 });
    }

    // Check staff restrictions
    try {
      const currentUser = await getCurrentUserFromSession();
      if (currentUser?.role === 'staff') {
        const { data: service } = await client.models.Service.get({ serviceId });
        if (service && service.vendorId !== currentUser.vendorId) {
          return Response.json({ error: 'Unauthorized: Staff can only update services from their own vendor' }, { status: 403 });
        }
      }
    } catch (authError) {
      // If auth check fails, allow the request (admin/superadmin)
      console.log('Auth check skipped:', authError);
    }

    const { data, errors } = await client.models.Service.update(body);

    if (errors) {
      console.error('Error updating service:', errors);
      return Response.json({ error: 'Failed to update service' }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    console.error('Error updating service:', error);
    return Response.json({ error: 'Failed to update service' }, { status: 500 });
  }
}
