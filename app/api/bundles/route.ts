import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { withErrorLogging } from '@/lib/logger/middleware';

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

export const GET = withErrorLogging(async function GET() {
  try {
    const { data: bundles } = await client.models.Bundle.list()
    return Response.json({ bundles })
  } catch (error) {
    console.error('Bundle fetch error:', error)
    return Response.json({ error: 'Failed to fetch bundles' }, { status: 500 })
  }
})

export const POST = withErrorLogging(async function POST(request: Request) {
  try {
    const body = await request.json()
    const bundleId = `bundle-${Date.now()}`
    const { data: bundle } = await client.models.Bundle.create({
      bundleId: bundleId as any,
      name: body.name,
      description: body.description,
      serviceIds: body.serviceIds,
      vendorIds: body.vendorIds || [],
      price: body.price,
      discountPercent: body.discountPercent ?? 0,
      isActive: body.isActive ?? true,
      ...(body.minPeople !== undefined && { minPeople: body.minPeople }),
      ...(body.maxPeople !== undefined && { maxPeople: body.maxPeople }),
      ...(body.allowedDays !== undefined && { allowedDays: body.allowedDays }),
      ...(body.addOns !== undefined && { addOns: body.addOns }),
      ...(body.contactOnly !== undefined && { contactOnly: body.contactOnly }),
    })
    return Response.json({ bundle })
  } catch (error) {
    return Response.json({ error: 'Failed to create bundle' }, { status: 500 })
  }
})

const BUNDLE_FIELDS = ['name', 'description', 'serviceIds', 'vendorIds', 'price', 'discountPercent',
  'isActive', 'minPeople', 'maxPeople', 'allowedDays', 'addOns', 'contactOnly', 'status', 'appointmentIds', 'dateTime']

export const PATCH = withErrorLogging(async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const updateData: any = { bundleId: body.bundleId as any }
    for (const field of BUNDLE_FIELDS) {
      if (body[field] !== undefined) updateData[field] = body[field]
    }
    if (body.vendorConfirmations !== undefined) updateData.vendorConfirmations = JSON.stringify(body.vendorConfirmations)
    if (body.customer !== undefined) updateData.customer = JSON.stringify(body.customer)
    
    const { data: bundle } = await client.models.Bundle.update(updateData)
    return Response.json({ bundle })
  } catch (error) {
    console.error('Bundle update error:', error)
    return Response.json({ error: 'Failed to update bundle' }, { status: 500 })
  }
})

export const DELETE = withErrorLogging(async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const bundleId = searchParams.get('bundleId')
    await client.models.Bundle.delete({ bundleId: bundleId as any })
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: 'Failed to delete bundle' }, { status: 500 })
  }
})
