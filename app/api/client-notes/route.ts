import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });
const { runWithAmplifyServerContext } = createServerRunner({ config });

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

async function getCurrentUser() {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        return {
          email: idToken.payload['email'] as string,
          name: (idToken.payload['given_name'] as string || '') + ' ' + (idToken.payload['family_name'] as string || ''),
          vendorId: idToken.payload['custom:vendorId'] as string,
        };
      }
    });
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) return Response.json({ error: 'clientId required' }, { status: 400 });

  try {
    const { data: notes } = await client.models.ClientNote.list({
      filter: { clientId: { eq: clientId } },
    });
    return Response.json({ notes: notes || [] });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return Response.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { clientId, content } = await request.json();
    if (!clientId || !content) return Response.json({ error: 'clientId and content required' }, { status: 400 });

    const noteId = `note-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const { data, errors } = await client.models.ClientNote.create({
      noteId,
      clientId,
      authorId: user.email,
      authorName: user.name.trim() || user.email,
      content,
      createdAt: now,
      updatedAt: now,
    } as any);

    if (errors) return Response.json({ error: 'Failed to create note' }, { status: 500 });
    return Response.json({ note: data });
  } catch (error) {
    console.error('Error creating note:', error);
    return Response.json({ error: 'Failed to create note' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { noteId, content } = await request.json();
    if (!noteId || !content) return Response.json({ error: 'noteId and content required' }, { status: 400 });

    const { data: existing } = await client.models.ClientNote.get({ noteId });
    if (!existing) return Response.json({ error: 'Note not found' }, { status: 404 });
    if (existing.authorId !== user.email) {
      return Response.json({ error: 'Can only edit your own notes' }, { status: 403 });
    }

    const { data, errors } = await client.models.ClientNote.update({
      noteId,
      content,
      updatedAt: new Date().toISOString(),
    } as any);

    if (errors) return Response.json({ error: 'Failed to update note' }, { status: 500 });
    return Response.json({ note: data });
  } catch (error) {
    console.error('Error updating note:', error);
    return Response.json({ error: 'Failed to update note' }, { status: 500 });
  }
}
