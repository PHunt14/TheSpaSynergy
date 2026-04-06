import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { Amplify } from 'aws-amplify';
import config from '@/amplify_outputs.json';
import { cookies } from 'next/headers';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });
const { runWithAmplifyServerContext } = createServerRunner({ config });
const client = generateClient<Schema>();

const getCurrentUser = async () => {
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
  } catch { return null; }
};

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get('vendorId');

    const { data: globalSetting } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });

    let vendorBlackout = null;
    if (vendorId) {
      const { data: vendor } = await client.models.Vendor.get({ vendorId });
      vendorBlackout = vendor?.bookingDisabledUntil || null;
    }

    return Response.json({
      globalDisabledUntil: globalSetting?.settingValue || null,
      vendorDisabledUntil: vendorBlackout,
    });
  } catch (error) {
    console.error('Error fetching blackout settings:', error);
    return Response.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { vendorId, disabledUntil, scope } = body;

    // Global blackout: admin only
    if (scope === 'global') {
      if (user.role !== 'admin') {
        return Response.json({ error: 'Only admins can set global blackout' }, { status: 403 });
      }
      if (disabledUntil) {
        // Upsert: try update first, create if not found
        const { data: existing } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
        if (existing) {
          await client.models.SiteSettings.update({ settingKey: 'globalBookingDisabledUntil', settingValue: disabledUntil } as any);
        } else {
          await client.models.SiteSettings.create({ settingKey: 'globalBookingDisabledUntil', settingValue: disabledUntil });
        }
      } else {
        // Clear: set to null
        const { data: existing } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
        if (existing) {
          await client.models.SiteSettings.update({ settingKey: 'globalBookingDisabledUntil', settingValue: null } as any);
        }
      }
      return Response.json({ success: true });
    }

    // Vendor blackout
    if (!vendorId) return Response.json({ error: 'vendorId required' }, { status: 400 });
    if (user.role === 'vendor' && vendorId !== user.vendorId) {
      return Response.json({ error: 'Can only manage your own blackout' }, { status: 403 });
    }

    await client.models.Vendor.update({ vendorId, bookingDisabledUntil: disabledUntil || null } as any);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error setting blackout:', error);
    return Response.json({ error: 'Failed to update blackout' }, { status: 500 });
  }
}
