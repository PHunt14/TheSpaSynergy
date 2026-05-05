import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';
import { normalizePhone, normalizeEmail } from '@/app/utils/client.js';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const search = searchParams.get('search');

  try {
    if (clientId) {
      const { data } = await client.models.Client.get({ clientId });
      return Response.json({ client: data });
    }

    const { data: clients } = await client.models.Client.list();
    if (!search) return Response.json({ clients: clients || [] });

    const term = search.toLowerCase();
    const filtered = (clients || []).filter(c =>
      c.name?.toLowerCase().includes(term) ||
      c.phone?.includes(term) ||
      c.email?.toLowerCase().includes(term)
    );
    return Response.json({ clients: filtered });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return Response.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, email } = body;

    if (!name) return Response.json({ error: 'Name required' }, { status: 400 });

    // Find existing client by phone or email
    const existing = await findExistingClient(phone, email);
    if (existing) {
      // Update name if it's more complete
      if (name.length > (existing.name?.length || 0)) {
        await client.models.Client.update({ clientId: existing.clientId, name } as any);
      }
      return Response.json({ client: existing, created: false });
    }

    const clientId = `client-${randomUUID().slice(0, 8)}`;
    const { data, errors } = await client.models.Client.create({
      clientId,
      name,
      phone: normalizePhone(phone) || phone || null,
      email: normalizeEmail(email) || null,
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating client:', errors);
      return Response.json({ error: 'Failed to create client' }, { status: 500 });
    }

    return Response.json({ client: data, created: true });
  } catch (error) {
    console.error('Error creating client:', error);
    return Response.json({ error: 'Failed to create client' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { clientId, name, phone, email } = body;
    if (!clientId) return Response.json({ error: 'clientId required' }, { status: 400 });

    const updateData: any = { clientId };
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = normalizePhone(phone) || phone;
    if (email !== undefined) updateData.email = normalizeEmail(email);

    const { data, errors } = await client.models.Client.update(updateData);
    if (errors) return Response.json({ error: 'Failed to update client' }, { status: 500 });
    return Response.json({ client: data });
  } catch (error) {
    return Response.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');
    if (!clientId) return Response.json({ error: 'clientId required' }, { status: 400 });

    // Delete all notes for this client
    const { data: notes } = await client.models.ClientNote.list({
      filter: { clientId: { eq: clientId } },
    });
    if (notes) {
      await Promise.all(notes.map(n => client.models.ClientNote.delete({ noteId: n.noteId } as any)));
    }

    const { errors } = await client.models.Client.delete({ clientId } as any);
    if (errors) return Response.json({ error: 'Failed to delete client' }, { status: 500 });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}

async function findExistingClient(phone?: string, email?: string) {
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    const { data } = await client.models.Client.list({
      filter: { phone: { eq: normalizedPhone } },
    });
    if (data && data.length > 0) return data[0];
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    const { data } = await client.models.Client.list({
      filter: { email: { eq: normalizedEmail } },
    });
    if (data && data.length > 0) return data[0];
  }

  return null;
}
