import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const region = 'us-east-1';
let credentialsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCredentialsFromSecretsManager() {
  // Return cached credentials if still valid
  if (credentialsCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return credentialsCache;
  }

  const client = new SecretsManagerClient({ region });
  
  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: 'spa-synergy/aws-credentials'
      })
    );

    const secret = JSON.parse(response.SecretString);
    credentialsCache = {
      accessKeyId: secret.ACCESS_KEY_ID,
      secretAccessKey: secret.SECRET_ACCESS_KEY
    };
    cacheTimestamp = Date.now();

    return credentialsCache;
  } catch (error) {
    console.error('Failed to fetch credentials from Secrets Manager:', error);
    throw error;
  }
}

// For local development
const localAccessKeyId = process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const localSecretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

export async function getAwsConfig() {
  // Use local credentials in development
  if (localAccessKeyId && localSecretAccessKey) {
    return {
      region,
      credentials: {
        accessKeyId: localAccessKeyId,
        secretAccessKey: localSecretAccessKey
      }
    };
  }

  // Fetch from Secrets Manager in production
  const credentials = await getCredentialsFromSecretsManager();
  return {
    region,
    credentials
  };
}
