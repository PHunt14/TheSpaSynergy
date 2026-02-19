// Amplify doesn't allow AWS_ prefix, so we use fallbacks
const accessKeyId = process.env.ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
const region = process.env.REGION || process.env.AWS_REGION || 'us-east-1';

console.log('AWS Config loaded:', {
  region,
  hasAccessKey: !!accessKeyId,
  accessKeyPrefix: accessKeyId.substring(0, 8),
  hasSecretKey: !!secretAccessKey
});

export const awsConfig = {
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
};
