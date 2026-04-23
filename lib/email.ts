import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import config from '@/amplify_outputs.json'

const LAMBDA_URL = (config as any).custom?.sendEmailFunctionUrl as string | undefined

async function sendViaSes(to: string, subject: string, htmlBody: string) {
  const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@thespasynergy.com'

  if (LAMBDA_URL) {
    console.log(`📧 SES (via Lambda): sending to ${to}`)
    const res = await fetch(LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, htmlBody, fromEmail }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Lambda email failed (${res.status}): ${body}`)
    }
    return
  }

  // Fallback: direct SES (works locally with AWS credentials)
  const region = process.env.AWS_REGION || 'us-east-1'
  console.log(`📧 SES (direct): sending from ${fromEmail} to ${to} (region: ${region})`)
  const sesClient = new SESClient({ region })
  await sesClient.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: htmlBody } },
    },
  }))
}

function sendViaConsole(to: string, subject: string, htmlBody: string) {
  const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@thespasynergy.com'
  console.log('\n📧 EMAIL (CONSOLE MODE)')
  console.log(`From: ${fromEmail}`)
  console.log(`To: ${to}`)
  console.log(`Subject: ${subject}`)
  console.log(`Body: ${htmlBody.replace(/<[^>]*>/g, '')}\n`)
}

export async function sendEmail(to: string, subject: string, htmlBody: string) {
  const testOverride = process.env.EMAIL_TEST_ADDRESS
  const targetEmail = testOverride || to

  if (testOverride) {
    htmlBody = `<p style="background:#fff3cd;padding:8px;border-radius:4px;"><strong>[TEST — Original recipient: ${to}]</strong></p>${htmlBody}`
  }

  const provider = process.env.EMAIL_PROVIDER || 'ses'
  console.log(`📧 Email provider: ${provider}`)

  switch (provider) {
    case 'console':
      sendViaConsole(targetEmail, subject, htmlBody)
      break
    case 'ses':
    default:
      await sendViaSes(targetEmail, subject, htmlBody)
      break
  }
}

export function formatDateTime(dateTime: string): string {
  return new Date(dateTime).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  })
}

export function emailWrapper(content: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${content}
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        The Spa Synergy<br>Fort Ritchie, MD
      </p>
    </div>`
}

export async function sendCustomerBookingEmail(params: {
  to: string
  serviceName: string
  vendorName: string
  dateTime: string
  duration: number
  price: number
  withName?: string
}) {
  const { to, serviceName, vendorName, dateTime, duration, price, withName } = params
  const subject = 'Booking Submitted - The Spa Synergy'
  const withLine = withName ? `<p><strong>With:</strong> ${withName}</p>` : ''
  const html = emailWrapper(`
    <h2 style="color: #8B4789;">Booking Submitted!</h2>
    <p>Thank you for booking with The Spa Synergy!</p>
    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Service:</strong> ${serviceName}</p>
      ${withLine}
      <p><strong>Date &amp; Time:</strong> ${formatDateTime(dateTime)}</p>
      <p><strong>Duration:</strong> ${duration} minutes</p>
      <p><strong>Price:</strong> $${price}</p>
    </div>
    <p>You will receive a confirmation once your appointment is confirmed by the vendor.</p>
    <p>If you need to cancel or reschedule, please contact us at least 24 hours in advance.</p>
    <p>We look forward to seeing you!</p>`)

  await sendEmail(to, subject, html)
}

export async function sendVendorBookingEmail(params: {
  to: string
  customerName: string
  customerPhone: string
  customerEmail: string
  serviceName: string
  dateTime: string
}) {
  const { to, customerName, customerPhone, customerEmail, serviceName, dateTime } = params
  const subject = 'New Booking - The Spa Synergy'
  const html = emailWrapper(`
    <h2 style="color: #8B4789;">New Booking!</h2>
    <p>A new appointment has been submitted and needs your attention.</p>
    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Service:</strong> ${serviceName}</p>
      <p><strong>Date &amp; Time:</strong> ${formatDateTime(dateTime)}</p>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Phone:</strong> ${customerPhone}</p>
      <p><strong>Email:</strong> ${customerEmail}</p>
    </div>
    <p>Please log in to the dashboard to confirm or manage this appointment.</p>`)

  await sendEmail(to, subject, html)
}
