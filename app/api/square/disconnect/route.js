import { Client, Environment } from 'square';
import { generateClient } from 'aws-amplify/data';
import config from '../../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';

Amplify.configure(config, { ssr: true });

export async function POST(request) {
  try {
    const { vendorId } = await request.json();

    if (!vendorId) {
      return Response.json({ error: 'Vendor ID required' }, { status: 400 });
    }

    const dataClient = generateClient();
    const { data: vendor } = await dataClient.models.Vendor.get({ vendorId });

    if (!vendor || !vendor.squareAccessToken) {
      return Response.json({ error: 'Vendor not connected to Square' }, { status: 400 });
    }

    // Revoke Square access token
    try {
      const client = new Client({
        accessToken: process.env.SQUARE_ACCESS_TOKEN,
        environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' 
          ? Environment.Production 
          : Environment.Sandbox
      });

      await client.oAuthApi.revokeToken({
        clientId: process.env.SQUARE_APPLICATION_ID,
        accessToken: vendor.squareAccessToken
      });
    } catch (error) {
      console.error('Error revoking Square token:', error);
    }

    // Clear vendor Square credentials
    await dataClient.models.Vendor.update({
      vendorId,
      squareAccessToken: null,
      squareRefreshToken: null,
      squareLocationId: null,
      squareMerchantId: null,
      squareTokenExpiresAt: null,
      squareConnectedAt: null
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Square disconnect error:', error);
    return Response.json({ error: 'Failed to disconnect Square' }, { status: 500 });
  }
}
