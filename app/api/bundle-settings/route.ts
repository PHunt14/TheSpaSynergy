import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

const SETTINGS_ID = 'default'

export async function GET() {
  try {
    const { data: settings } = await client.models.BundleSettings.get({ settingsId: SETTINGS_ID as any })
    return Response.json({ settings: settings || {
      discount1Service: 0,
      discount2Services: 0,
      discount3Services: 0,
      discount4PlusServices: 0
    }})
  } catch (error) {
    return Response.json({ settings: {
      discount1Service: 0,
      discount2Services: 0,
      discount3Services: 0,
      discount4PlusServices: 0
    }})
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('Saving bundle settings:', body)
    
    try {
      const { data: settings, errors } = await client.models.BundleSettings.update({
        settingsId: SETTINGS_ID as any,
        discount1Service: body.discount1Service ?? 0,
        discount2Services: body.discount2Services ?? 0,
        discount3Services: body.discount3Services ?? 0,
        discount4PlusServices: body.discount4PlusServices ?? 0,
      })
      if (errors) {
        console.error('Update errors:', errors)
        throw new Error('Update failed')
      }
      console.log('Settings updated:', settings)
      return Response.json({ settings })
    } catch (updateError) {
      console.log('Update failed, trying create:', updateError)
      const { data: newSettings, errors } = await client.models.BundleSettings.create({
        settingsId: SETTINGS_ID as any,
        discount1Service: body.discount1Service ?? 0,
        discount2Services: body.discount2Services ?? 0,
        discount3Services: body.discount3Services ?? 0,
        discount4PlusServices: body.discount4PlusServices ?? 0,
      })
      if (errors) {
        console.error('Create errors:', errors)
        throw new Error('Create failed')
      }
      console.log('Settings created:', newSettings)
      return Response.json({ settings: newSettings })
    }
  } catch (error) {
    console.error('Bundle settings save error:', error)
    return Response.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
