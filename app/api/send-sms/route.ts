import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Amplify } from 'aws-amplify'
import config from '@/amplify_outputs.json'

Amplify.configure(config, { ssr: true })
const client = generateClient<Schema>()

export async function POST(request: Request) {
  try {
    const { appointmentId, vendorId } = await request.json()

    console.log('SMS Alert triggered for appointment:', appointmentId, 'vendor:', vendorId)

    // Get vendor info
    const { data: vendor } = await client.models.Vendor.get({ vendorId })
    
    console.log('Vendor SMS settings:', {
      enabled: vendor?.smsAlertsEnabled,
      phone: vendor?.smsAlertPhone
    })

    if (!vendor || !vendor.smsAlertsEnabled || !vendor.smsAlertPhone) {
      console.log('SMS not enabled for vendor')
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
    const message = `New Booking Alert!\n\nService: ${service?.name || 'N/A'}\nCustomer: ${customer.name}\nPhone: ${customer.phone}\nDate/Time: ${new Date(appointment.dateTime).toLocaleString()}\n\nThe Spa Synergy`

    console.log('SMS Message prepared:', message)
    console.log('Sending to phone:', vendor.smsAlertPhone)

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
        console.log('SMS sent successfully via Lambda')
        return Response.json({ 
          success: true, 
          message: 'SMS sent successfully'
        })
      }
    } catch (lambdaError) {
      console.error('Lambda SMS failed, using dev mode:', lambdaError)
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
