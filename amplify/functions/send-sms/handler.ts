import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { LambdaLogger } from '../../../lib/logger/lambda-logger.js';

const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event: any, context: any) => {
  const logger = new LambdaLogger('send-sms', context.awsRequestId);

  try {
    const { phoneNumber, message } = JSON.parse(event.body || '{}');

    if (!phoneNumber || !message) {
      const missingParams: string[] = [];
      if (!phoneNumber) missingParams.push('phoneNumber');
      if (!message) missingParams.push('message');
      logger.logValidationFailure(missingParams);

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
      ...(process.env.SNS_ORIGINATION_NUMBER && {
        MessageAttributes: {
          'AWS.MM.SMS.OriginationNumber': {
            DataType: 'String',
            StringValue: process.env.SNS_ORIGINATION_NUMBER,
          },
        },
      }),
    });

    await snsClient.send(command);

    logger.logSuccess('sent', formattedPhone);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({ success: true, message: 'SMS sent successfully' })
    };
  } catch (error) {
    logger.logError(error, event);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({ error: 'Failed to send SMS' })
    };
  }
};
