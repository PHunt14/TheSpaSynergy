/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    EMAIL_TEST_ADDRESS: process.env.EMAIL_TEST_ADDRESS,
    SES_FROM_EMAIL: process.env.SES_FROM_EMAIL,
    SMS_PROVIDER: process.env.SMS_PROVIDER,
    SMS_TEST_PHONE: process.env.SMS_TEST_PHONE,
    SNS_ORIGINATION_NUMBER: process.env.SNS_ORIGINATION_NUMBER,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'the-spa-synergy-public.s3.amazonaws.com',
      },
    ],
  },
}

export default nextConfig
