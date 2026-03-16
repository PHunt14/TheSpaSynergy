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
    })
    return Response.json({ bundle })
  } catch (error) {
    return Response.json({ error: 'Failed to create bundle' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const updateData: any = {
      bundleId: body.bundleId as any,
    }
    if (body.name !== undefined) updateData.name = body.name
    if (body.description !== undefined) updateData.description = body.description
    if (body.serviceIds !== undefined) updateData.serviceIds = body.serviceIds
    if (body.vendorIds !== undefined) updateData.vendorIds = body.vendorIds
    if (body.price !== undefined) updateData.price = body.price
    if (body.discountPercent !== undefined) updateData.discountPercent = body.discountPercent
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.status !== undefined) updateData.status = body.status
    if (body.vendorConfirmations !== undefined) updateData.vendorConfirmations = JSON.stringify(body.vendorConfirmations)
    if (body.appointmentIds !== undefined) updateData.appointmentIds = body.appointmentIds
    if (body.customer !== undefined) updateData.customer = JSON.stringify(body.customer)
    if (body.dateTime !== undefined) updateData.dateTime = body.dateTime
    
    const { data: bundle } = await client.models.Bundle.update(updateData)
    return Response.json({ bundle })
  } catch (error) {
    console.error('Bundle update error:', error)
    return Response.json({ error: 'Failed to update bundle' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const bundleId = searchParams.get('bundleId')
    await client.models.Bundle.delete({ bundleId: bundleId as any })
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: 'Failed to delete bundle' }, { status: 500 })
  }
}
