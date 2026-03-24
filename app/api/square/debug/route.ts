import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const appId = process.env.SQUARE_APPLICATION_ID
  const publicAppId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID
  const appSecret = process.env.SQUARE_APPLICATION_SECRET
  const accessToken = process.env.SQUARE_ACCESS_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  return Response.json({
    SQUARE_APPLICATION_ID: appId ? `set (${appId.substring(0, 8)}...)` : 'NOT SET',
    NEXT_PUBLIC_SQUARE_APPLICATION_ID: publicAppId ? `set (${publicAppId.substring(0, 8)}...)` : 'NOT SET',
    SQUARE_APPLICATION_SECRET: appSecret ? `set (${appSecret.length} chars)` : 'NOT SET',
    SQUARE_ACCESS_TOKEN: accessToken ? `set (${accessToken.substring(0, 8)}...)` : 'NOT SET',
    NEXT_PUBLIC_APP_URL: appUrl || 'NOT SET',
  })
}
