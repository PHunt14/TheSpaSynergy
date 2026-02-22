/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
  },
}

export default nextConfig
