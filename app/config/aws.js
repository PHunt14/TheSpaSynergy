// Amplify doesn't allow AWS_ prefix, so we use fallbacks
const accessKeyId = process.env.NEXT_PUBLIC_ACCESS_KEY_ID || process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY || process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
const region = process.env.NEXT_PUBLIC_REGION || process.env.REGION || process.env.AWS_REGION || 'us-east-1';

console.log('=== AWS Config Module Loading ===');
console.log('Raw env check:', {
  NEXT_PUBLIC_ACCESS_KEY_ID: process.env.NEXT_PUBLIC_ACCESS_KEY_ID?.substring(0, 10),
  ACCESS_KEY_ID: process.env.ACCESS_KEY_ID?.substring(0, 10),
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID?.substring(0, 10),
  NEXT_PUBLIC_SECRET_ACCESS_KEY: process.env.NEXT_PUBLIC_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
  SECRET_ACCESS_KEY: process.env.SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET'
});

console.log('AWS Config loaded:', {
  region,
  hasAccessKey: !!accessKeyId,
  accessKeyPrefix: accessKeyId.substring(0, 8),
  hasSecretKey: !!secretAccessKey,
  secretKeyLength: secretAccessKey.length
});

export const awsConfig = {
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
};
