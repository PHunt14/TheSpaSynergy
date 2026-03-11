import { Client, Environment } from 'square';
import { generateClient } from 'aws-amplify/data';
import config from '../../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';

Amplify.configure(config, { ssr: true });

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // vendorId
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    console.error('Square OAuth error:', error);
    return Response.redirect(`${appUrl}/dashboard/settings?error=${error}`);
  }

  if (!code || !state) {
    console.error('Missing code or state:', { code: !!code, state: !!state });
    return Response.json({ error: 'Missing authorization code or vendor ID' }, { status: 400 });
  }

  try {
    const applicationId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
    const applicationSecret = process.env.SQUARE_APPLICATION_SECRET;

    if (!applicationId || !applicationSecret) {
      console.error('Missing Square credentials');
      return Response.redirect(`${appUrl}/dashboard/settings?error=missing_credentials`);
    }

    const client = new Client({
      environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
    });

    console.log('Exchanging code for token...');

    // Exchange authorization code for access token
    const { result } = await client.oAuthApi.obtainToken({
      clientId: applicationId,
      clientSecret: applicationSecret,
      code,
      grantType: 'authorization_code'
    });

    const { accessToken, refreshToken, expiresAt, merchantId } = result;

    console.log('Token obtained, fetching locations...');

    // Get merchant's location using the new access token
    const merchantClient = new Client({
      accessToken: accessToken,
      environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
    });

    const { result: locationsResult } = await merchantClient.locationsApi.listLocations();
    const primaryLocation = locationsResult.locations?.[0];

    if (!primaryLocation) {
      console.error('No locations found for merchant');
      return Response.redirect(`${appUrl}/dashboard/settings?error=no_locations`);
    }

    console.log('Updating vendor with Square credentials...');

    // Update vendor with Square credentials
    const dataClient = generateClient();
    await dataClient.models.Vendor.update({
      vendorId: state,
      squareAccessToken: accessToken,
      squareRefreshToken: refreshToken,
      squareLocationId: primaryLocation.id,
      squareMerchantId: merchantId,
      squareTokenExpiresAt: expiresAt,
      squareConnectedAt: new Date().toISOString()
    });

    console.log('Vendor updated successfully');

    return Response.redirect(`${appUrl}/dashboard/settings?success=square_connected`);
  } catch (error) {
    console.error('Square OAuth error:', error);
    return Response.redirect(`${appUrl}/dashboard/settings?error=oauth_failed&details=${encodeURIComponent(error.message)}`);
  }
}
