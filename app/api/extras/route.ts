import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { getCurrentUser } from '@/lib/auth'
import { randomUUID } from 'node:crypto'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

// Guard: Extra model may not be in amplify_outputs.json until next deploy
const isExtraModelAvailable = () => !!(client.models as any).Extra
/**
 * GET /api/extras?bundleId={id}
 * GET /api/extras?includeInactive=true  (management mode - returns all extras)
 *
 * Returns active extras assigned to the specified bundle.
 * Falls back to Bundle `addOns` JSON if no catalog entries exist for that bundle.
 * When includeInactive=true is passed (staff management), returns all extras regardless of status.
 */
export async function GET(request: Request) {
  try {
    if (!isExtraModelAvailable()) {
      return Response.json(
        { error: 'Extra model not yet deployed. Run ampx sandbox or deploy to provision the model.', extras: [], source: 'catalog' },
        { status: 200 }
      )
    }

    const { searchParams } = new URL(request.url)
    const bundleId = searchParams.get('bundleId')
    const includeInactive = searchParams.get('includeInactive') === 'true'

    // Management mode: return all extras (including inactive) for staff dashboard
    if (includeInactive) {
      const { data: allExtras, errors } = await client.models.Extra.list()

      if (errors) {
        console.error('Error fetching extras:', errors)
        return Response.json(
          { error: 'Failed to fetch extras' },
          { status: 500 }
        )
      }

      return Response.json({ extras: allExtras || [], source: 'catalog' })
    }

    if (!bundleId) {
      return Response.json(
        { error: 'bundleId query parameter is required' },
        { status: 400 }
      )
    }

    // Fetch all extras from catalog
    const { data: allExtras, errors } = await client.models.Extra.list()

    if (errors) {
      console.error('Error fetching extras:', errors)
      return Response.json(
        { error: 'Failed to fetch extras' },
        { status: 500 }
      )
    }

    // Filter to active extras assigned to this bundle
    const bundleExtras = (allExtras || []).filter(
      (extra: any) =>
        extra.isActive === true &&
        Array.isArray(extra.assignedBundleIds) &&
        extra.assignedBundleIds.includes(bundleId)
    )

    // If no catalog entries exist for this bundle, fall back to Bundle addOns JSON
    if (bundleExtras.length === 0) {
      const { data: bundle } = await client.models.Bundle.get({ bundleId: bundleId as any })

      if (bundle?.addOns) {
        const addOns = typeof bundle.addOns === 'string'
          ? JSON.parse(bundle.addOns)
          : bundle.addOns

        return Response.json({ extras: addOns, source: 'legacy' })
      }

      return Response.json({ extras: [], source: 'catalog' })
    }

    return Response.json({ extras: bundleExtras, source: 'catalog' })
  } catch (error) {
    console.error('Error in GET /api/extras:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/extras
 *
 * Creates a new Extra record. Staff-only (Cognito auth).
 * Validates name (1-100 chars), price (0.01-99999.99).
 * Defaults isActive to true.
 */
export async function POST(request: Request) {
  try {
    if (!isExtraModelAvailable()) {
      return Response.json({ error: 'Extra model not yet deployed. Run ampx sandbox or deploy.' }, { status: 503 })
    }

    // Staff-only auth check
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, price, perPerson, groupOnly, assignedBundleIds } = body

    // Validate name: required, 1-100 characters
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return Response.json(
        { error: 'Name is required (1-100 characters)', field: 'name' },
        { status: 400 }
      )
    }
    if (name.trim().length > 100) {
      return Response.json(
        { error: 'Name must be 100 characters or fewer', field: 'name' },
        { status: 400 }
      )
    }

    // Validate price: required, 0.01-99999.99
    if (price === undefined || price === null || typeof price !== 'number') {
      return Response.json(
        { error: 'Price is required (0.01-99999.99)', field: 'price' },
        { status: 400 }
      )
    }
    if (price < 0.01 || price > 99999.99) {
      return Response.json(
        { error: 'Price must be between 0.01 and 99999.99', field: 'price' },
        { status: 400 }
      )
    }

    const extraId = randomUUID()

    const { data: extra, errors } = await client.models.Extra.create({
      extraId,
      name: name.trim(),
      description: description || undefined,
      price,
      perPerson: perPerson ?? false,
      groupOnly: groupOnly ?? false,
      isActive: true,
      assignedBundleIds: assignedBundleIds || [],
    } as any)

    if (errors) {
      console.error('Error creating extra:', errors)
      return Response.json(
        { error: 'Failed to create extra' },
        { status: 500 }
      )
    }

    return Response.json({ extra })
  } catch (error) {
    console.error('Error in POST /api/extras:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/extras
 *
 * Updates an existing Extra record. Staff-only auth.
 * Supports partial updates to all editable fields.
 */
export async function PATCH(request: Request) {
  try {
    if (!isExtraModelAvailable()) {
      return Response.json({ error: 'Extra model not yet deployed. Run ampx sandbox or deploy.' }, { status: 503 })
    }

    // Staff-only auth check
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { extraId, name, description, price, perPerson, groupOnly, isActive, assignedBundleIds } = body

    if (!extraId) {
      return Response.json(
        { error: 'extraId is required' },
        { status: 400 }
      )
    }

    // Verify the extra exists
    const { data: existing } = await client.models.Extra.get({ extraId: extraId as any })
    if (!existing) {
      return Response.json(
        { error: 'Extra not found' },
        { status: 404 }
      )
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return Response.json(
          { error: 'Name must be 1-100 characters', field: 'name' },
          { status: 400 }
        )
      }
      if (name.trim().length > 100) {
        return Response.json(
          { error: 'Name must be 100 characters or fewer', field: 'name' },
          { status: 400 }
        )
      }
    }

    // Validate price if provided
    if (price !== undefined) {
      if (typeof price !== 'number' || price < 0.01 || price > 99999.99) {
        return Response.json(
          { error: 'Price must be between 0.01 and 99999.99', field: 'price' },
          { status: 400 }
        )
      }
    }

    // Build update fields
    const updateFields: any = { extraId: extraId as any }
    if (name !== undefined) updateFields.name = name.trim()
    if (description !== undefined) updateFields.description = description
    if (price !== undefined) updateFields.price = price
    if (perPerson !== undefined) updateFields.perPerson = perPerson
    if (groupOnly !== undefined) updateFields.groupOnly = groupOnly
    if (isActive !== undefined) updateFields.isActive = isActive
    if (assignedBundleIds !== undefined) updateFields.assignedBundleIds = assignedBundleIds

    const { data: extra, errors } = await client.models.Extra.update(updateFields)

    if (errors) {
      console.error('Error updating extra:', errors)
      return Response.json(
        { error: 'Failed to update extra' },
        { status: 500 }
      )
    }

    return Response.json({ extra })
  } catch (error) {
    console.error('Error in PATCH /api/extras:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/extras
 *
 * Soft-delete by setting `isActive: false`. Staff-only auth.
 * Does not remove the record from the database.
 */
export async function DELETE(request: Request) {
  try {
    if (!isExtraModelAvailable()) {
      return Response.json({ error: 'Extra model not yet deployed. Run ampx sandbox or deploy.' }, { status: 503 })
    }

    // Staff-only auth check
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const extraId = searchParams.get('extraId')

    if (!extraId) {
      return Response.json(
        { error: 'extraId is required' },
        { status: 400 }
      )
    }

    // Verify the extra exists
    const { data: existing } = await client.models.Extra.get({ extraId: extraId as any })
    if (!existing) {
      return Response.json(
        { error: 'Extra not found' },
        { status: 404 }
      )
    }

    // Soft-delete: set isActive to false
    const { data: extra, errors } = await client.models.Extra.update({
      extraId,
      isActive: false,
    } as any)

    if (errors) {
      console.error('Error deactivating extra:', errors)
      return Response.json(
        { error: 'Failed to deactivate extra' },
        { status: 500 }
      )
    }

    return Response.json({ extra, success: true })
  } catch (error) {
    console.error('Error in DELETE /api/extras:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
