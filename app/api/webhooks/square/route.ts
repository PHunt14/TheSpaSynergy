import { NextRequest } from 'next/server'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { verifyWebhookSignature, processPaymentEvent } from '@/lib/square/core.js'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-square-hmacsha256-signature')
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/square`
    const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || ''

    if (!verifyWebhookSignature(body, signature, webhookUrl, sigKey)) {
      return Response.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(body)

    if (event.type === 'payment.updated' || event.type === 'payment.completed') {
      const paymentId = event.data?.object?.payment?.id
      if (!paymentId) return Response.json({ ok: true })

      const { data: appointments } = await client.models.Appointment.list({
        filter: { paymentId: { eq: paymentId } }
      })

      if (!appointments || appointments.length === 0) {
        return Response.json({ ok: true })
      }

      const update = processPaymentEvent(event, appointments[0])
      if (update) {
        await client.models.Appointment.update(update as any)
      }
    }

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
