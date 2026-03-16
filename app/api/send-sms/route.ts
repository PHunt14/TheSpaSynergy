import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' })

function formatPhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`
}

export async function sendSms(phoneNumber: string, message: string) {
  await snsClient.send(new PublishCommand({
    PhoneNumber: formatPhone(phoneNumber),
    Message: message,
  }))
}

export async function POST(request: Request) {
  try {
    const { appointmentId, vendorId } = await request.json()

    // Get vendor info
    const { data: vendor } = await client.models.Vendor.get({ vendorId })
    
    if (!vendor || !vendor.smsAlertsEnabled || !vendor.smsAlertPhone) {
      return Response.json({ 
        success: false, 
        message: 'SMS alerts not enabled for this vendor' 
      })
    }

    // Get appointment details
    const { data: appointment } = await client.models.Appointment.get({ appointmentId })
    
    if (!appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 })
    }

    // Get service details
    const { data: service } = await client.models.Service.get({ 
      serviceId: appointment.serviceId 
    })

    const customer = typeof appointment.customer === 'string' 
      ? JSON.parse(appointment.customer) 
      : appointment.customer

    const dateTime = appointment.dateTime
    const formattedDateTime = dateTime ? new Date(dateTime).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) : 'Not specified'

    const message = `New Booking Alert!\n\nService: ${service?.name || 'N/A'}\nCustomer: ${customer.name}\nPhone: ${customer.phone}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy`

    await sendSms(vendor.smsAlertPhone, message)

    return Response.json({ success: true, message: 'SMS sent successfully' })
  } catch (error) {
    console.error('Error sending SMS:', error)
    return Response.json({ 
      error: 'Failed to send SMS', 
      details: error 
    }, { status: 500 })
  }
}
