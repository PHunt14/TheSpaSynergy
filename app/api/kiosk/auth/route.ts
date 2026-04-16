import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';

const client = generateServerClientUsingCookies<Schema>({ config, cookies });

const COOKIE_NAME = 'kiosk_session';

// POST — validate PIN, generate a session token, store it in SiteSettings
export async function POST(request: Request) {
  try {
    const { pin } = await request.json();
    if (!pin) return Response.json({ error: 'PIN required' }, { status: 400 });

    const { data: setting } = await client.models.SiteSettings.get({ settingKey: 'kioskPin' });
    if (!setting?.settingValue) {
      return Response.json({ error: 'Kiosk PIN not configured. Ask an admin to set one in Dashboard → Settings.' }, { status: 403 });
    }

    if (pin !== setting.settingValue) {
      return Response.json({ error: 'Invalid PIN' }, { status: 401 });
    }

    // Generate a random session token and store it
    const token = randomUUID();
    const { data: existing } = await client.models.SiteSettings.get({ settingKey: 'kioskSessionToken' });
    if (existing) {
      await client.models.SiteSettings.update({ settingKey: 'kioskSessionToken', settingValue: token } as any);
    } else {
      await client.models.SiteSettings.create({ settingKey: 'kioskSessionToken', settingValue: token } as any);
    }

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/kiosk',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Kiosk auth error:', error);
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

// DELETE — clear session cookie (sign out)
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', { path: '/kiosk', maxAge: 0 });
  return Response.json({ success: true });
}

// GET — check if session is valid
export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return Response.json({ authenticated: false });

    const { data: setting } = await client.models.SiteSettings.get({ settingKey: 'kioskSessionToken' });
    return Response.json({ authenticated: token === setting?.settingValue });
  } catch {
    return Response.json({ authenticated: false });
  }
}
