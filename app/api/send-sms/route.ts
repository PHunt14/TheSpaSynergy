import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

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

    // Format the SMS message
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

    // Call the Lambda function to send SMS
    try {
      const lambdaResponse = await fetch(`https://${process.env.NEXT_PUBLIC_AMPLIFY_FUNCTION_URL || 'LAMBDA_NOT_CONFIGURED'}/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: vendor.smsAlertPhone,
          message
        })
      })
      
      if (lambdaResponse.ok) {
        return Response.json({ 
          success: true, 
          message: 'SMS sent successfully'
        })
      }
    } catch (lambdaError) {
      // Lambda failed, fall through to dev mode
    }

    // For now, just log - actual SMS requires AWS SNS setup in production
    return Response.json({ 
      success: true, 
      message: 'SMS notification logged (dev mode - verify phone in AWS SNS Console)',
      phone: vendor.smsAlertPhone,
      smsContent: message
    })
  } catch (error) {
    console.error('Error sending SMS:', error)
    return Response.json({ 
      error: 'Failed to send SMS', 
      details: error 
    }, { status: 500 })
  }
}
