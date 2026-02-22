// Amplify doesn't allow AWS_ prefix, so we use fallbacks
const accessKeyId = process.env.NEXT_PUBLIC_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
const region = process.env.NEXT_PUBLIC_REGION || process.env.REGION || process.env.AWS_REGION || 'us-east-1';

export const awsConfig = {
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
};
