import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event: any) => {
  try {
    const { phoneNumber, message } = JSON.parse(event.body || '{}');

    if (!phoneNumber || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Phone number and message are required' })
      };
    }

    // Format phone number to E.164 format (+1XXXXXXXXXX)
    const formattedPhone = phoneNumber.startsWith('+') 
      ? phoneNumber 
      : `+1${phoneNumber.replace(/\D/g, '')}`;

    const command = new PublishCommand({
      PhoneNumber: formattedPhone,
      Message: message,
    });

    await snsClient.send(command);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({ success: true, message: 'SMS sent successfully' })
    };
  } catch (error) {
    console.error('Error sending SMS:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({ error: 'Failed to send SMS', details: error })
    };
  }
};
