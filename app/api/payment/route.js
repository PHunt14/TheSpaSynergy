import { Client, Environment } from 'square';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { randomUUID } from 'crypto';

let cachedToken = null;

async function getSquareToken() {
  if (cachedToken) return cachedToken;

  // Use local env var in development
  if (process.env.SQUARE_ACCESS_TOKEN) {
    return process.env.SQUARE_ACCESS_TOKEN;
  }

  // Fetch from Secrets Manager in production
  const client = new SecretsManagerClient({ region: 'us-east-1' });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: 'spa-synergy/square-token' })
  );
  const secret = JSON.parse(response.SecretString);
  cachedToken = secret.SQUARE_ACCESS_TOKEN;
  return cachedToken;
}

export async function POST(request) {
  try {
    const squareToken = await getSquareToken();
    
    // Initialize client inside handler
    const client = new Client({
      accessToken: squareToken,
      environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
    });

    console.log('Square config:', {
      hasToken: !!squareToken,
      tokenPrefix: squareToken?.substring(0, 10),
      environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT,
      locationId: process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    });

    const { sourceId, amount, vendorId } = await request.json();

    if (!sourceId || !amount) {
      return Response.json({ error: 'Missing payment details' }, { status: 400 });
    }

    const { result } = await client.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: randomUUID(),
      amountMoney: {
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'USD'
      },
      locationId: process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    });

    return Response.json({
      success: true,
      paymentId: result.payment.id,
      status: result.payment.status
    });
  } catch (error) {
    console.error('Payment error:', error);
    return Response.json({ 
      error: 'Payment failed',
      details: error.message 
    }, { status: 500 });
  }
}
