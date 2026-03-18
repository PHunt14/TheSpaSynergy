import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'sns' // 'sns' | 'twilio' | 'console'

function formatPhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`
}

async function sendViaSns(phoneNumber: string, message: string) {
  const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' })
  await snsClient.send(new PublishCommand({
    PhoneNumber: formatPhone(phoneNumber),
    Message: message,
    // Required for US SMS — your registered toll-free or 10DLC number
    ...(process.env.SNS_ORIGINATION_NUMBER && {
      MessageAttributes: {
        'AWS.SNS.SMS.OriginationNumber': {
          DataType: 'String',
          StringValue: process.env.SNS_ORIGINATION_NUMBER,
        },
      },
    }),
  }))
}

async function sendViaTwilio(phoneNumber: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials not configured')
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: formatPhone(phoneNumber),
        From: fromNumber,
        Body: message,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Twilio error: ${error}`)
  }
}

function sendViaConsole(phoneNumber: string, message: string) {
  console.log('\n📱 SMS (CONSOLE MODE)')
  console.log(`To: ${formatPhone(phoneNumber)}`)
  console.log(`Message:\n${message}\n`)
}

export async function sendSms(phoneNumber: string, message: string) {
  const testOverride = process.env.SMS_TEST_PHONE
  const targetPhone = testOverride || phoneNumber

  if (testOverride) {
    message = `[TEST → ${formatPhone(phoneNumber)}]\n${message}`
  }

  switch (SMS_PROVIDER) {
    case 'twilio':
      await sendViaTwilio(targetPhone, message)
      break
    case 'console':
      sendViaConsole(targetPhone, message)
      break
    case 'sns':
    default:
      await sendViaSns(targetPhone, message)
      break
  }
}
