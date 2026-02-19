// Environment-aware table names
const ENV = process.env.NEXT_PUBLIC_ENV || 'dev';

export const TABLE_NAMES = {
  VENDORS: `spa-vendors-${ENV}`,
  SERVICES: `spa-services-${ENV}`,
  APPOINTMENTS: `spa-appointments-${ENV}`
};

export const AWS_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  environment: ENV
};
