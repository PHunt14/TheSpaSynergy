export async function POST(request) {
  try {
    const { vendorId } = await request.json();

    if (!vendorId) {
      return Response.json({ error: 'Vendor ID required' }, { status: 400 });
    }

    const applicationId = process.env.SQUARE_APPLICATION_ID || process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (!applicationId) {
      console.error('Missing SQUARE_APPLICATION_ID');
      return Response.json({ error: 'Square not configured' }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

    const redirectUri = `${appUrl}/api/square/oauth`;
    
    const authUrl = `${baseUrl}/oauth2/authorize?` +
      `client_id=${applicationId}&` +
      `scope=MERCHANT_PROFILE_READ+PAYMENTS_WRITE+PAYMENTS_READ&` +
      `state=${vendorId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}`;

    console.log('Generated Square auth URL:', { baseUrl, redirectUri, applicationId: applicationId.substring(0, 20) });

    return Response.json({ authUrl });
  } catch (error) {
    console.error('Square connect error:', error);
    return Response.json({ error: 'Failed to generate auth URL: ' + error.message }, { status: 500 });
  }
}
