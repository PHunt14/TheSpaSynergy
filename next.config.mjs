/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
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
