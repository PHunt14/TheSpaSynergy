// Use IAM role or fetch from SSM Parameter Store
const region = process.env.NEXT_PUBLIC_REGION || process.env.REGION || process.env.AWS_REGION || 'us-east-1';

// For local development, use environment variables
const accessKeyId = process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

const config = { region };

// Only add credentials if explicitly provided (local dev)
if (accessKeyId && secretAccessKey) {
  config.credentials = {
    accessKeyId,
    secretAccessKey
  };
}
// Otherwise, AWS SDK will use IAM role from environment

export const awsConfig = config;
