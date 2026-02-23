import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');

  if (!vendorId) {
    return Response.json({ error: 'vendorId required' }, { status: 400 });
  }

  try {
    const { data: services, errors } = await client.models.Service.list({
      filter: { 
        vendorId: { eq: vendorId },
        isActive: { eq: true }
      } as any
    });

    if (errors) {
      console.error('Error fetching services:', errors);
      return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
    }

    return Response.json({ services });
  } catch (error) {
    console.error('Error fetching services:', error);
    return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { serviceId, vendorId, name, duration, price, isActive, category, resourceType } = body;

    if (!serviceId || !vendorId || !name || !duration || price === undefined) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, errors } = await client.models.Service.create({
      serviceId,
      vendorId,
      name,
      duration,
      price,
      category,
      resourceType,
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
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'id required' }, { status: 400 });
    }

    const { data, errors } = await client.models.Service.delete({ id });

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
    const { id, isActive } = body;

    if (!id || isActive === undefined) {
      return Response.json({ error: 'id and isActive required' }, { status: 400 });
    }

    const { data, errors } = await client.models.Service.update({ id, isActive });

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
