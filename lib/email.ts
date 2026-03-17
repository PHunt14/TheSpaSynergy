import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'ses' // 'ses' | 'console'
const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@thespasynergy.com'

async function sendViaSes(to: string, subject: string, htmlBody: string) {
  const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' })
  await sesClient.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: htmlBody } },
    },
  }))
}

function sendViaConsole(to: string, subject: string, htmlBody: string) {
  console.log('\n📧 EMAIL (CONSOLE MODE)')
  console.log(`From: ${FROM_EMAIL}`)
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

  switch (EMAIL_PROVIDER) {
    case 'console':
      sendViaConsole(targetEmail, subject, htmlBody)
      break
    case 'ses':
    default:
      await sendViaSes(targetEmail, subject, htmlBody)
      break
  }
}

function formatDateTime(dateTime: string): string {
  return new Date(dateTime).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  })
}

function emailWrapper(content: string): string {
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
}) {
  const { to, serviceName, vendorName, dateTime, duration, price } = params
  const subject = 'Booking Confirmation - The Spa Synergy'
  const html = emailWrapper(`
    <h2 style="color: #8B4789;">Booking Confirmed</h2>
    <p>Thank you for booking with The Spa Synergy!</p>
    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Vendor:</strong> ${vendorName}</p>
      <p><strong>Service:</strong> ${serviceName}</p>
      <p><strong>Date & Time:</strong> ${formatDateTime(dateTime)}</p>
      <p><strong>Duration:</strong> ${duration} minutes</p>
      <p><strong>Price:</strong> $${price}</p>
    </div>
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
  const subject = 'New Booking Alert - The Spa Synergy'
  const html = emailWrapper(`
    <h2 style="color: #8B4789;">New Booking!</h2>
    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p><strong>Service:</strong> ${serviceName}</p>
      <p><strong>Date & Time:</strong> ${formatDateTime(dateTime)}</p>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Phone:</strong> ${customerPhone}</p>
      <p><strong>Email:</strong> ${customerEmail}</p>
    </div>`)

  await sendEmail(to, subject, html)
}
