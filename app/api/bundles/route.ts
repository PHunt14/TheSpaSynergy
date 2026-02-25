import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

export async function GET() {
  try {
    const { data: bundles } = await client.models.Bundle.list()
    return Response.json({ bundles })
  } catch (error) {
    console.error('Bundle fetch error:', error)
    return Response.json({ error: 'Failed to fetch bundles' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { data: bundle } = await client.models.Bundle.create({
      bundleId: `bundle-${Date.now()}`,
      name: body.name,
      description: body.description,
      serviceIds: body.serviceIds,
      price: body.price,
      isActive: body.isActive ?? true,
    })
    return Response.json({ bundle })
  } catch (error) {
    return Response.json({ error: 'Failed to create bundle' }, { status: 500 })
  }
}
