import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { LambdaLogger } from '../../../lib/logger/lambda-logger.js';

const sesClient = new SESClient({ region: 'us-east-1' });

export const handler = async (event: any, context: any) => {
  const logger = new LambdaLogger('send-email', context.awsRequestId);

  try {
    const { to, subject, htmlBody, fromEmail } = JSON.parse(event.body || '{}');

    if (!to || !subject || !htmlBody) {
      const missingParams: string[] = [];
      if (!to) missingParams.push('to');
      if (!subject) missingParams.push('subject');
      if (!htmlBody) missingParams.push('htmlBody');
      logger.logValidationFailure(missingParams);

      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'to, subject, and htmlBody are required' }),
      };
    }

    const source = fromEmail || process.env.SES_FROM_EMAIL || 'noreply@thespasynergy.com';

    await sesClient.send(new SendEmailCommand({
      Source: source,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: htmlBody } },
      },
    }));

    logger.logSuccess('sent', to);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully' }),
    };
  } catch (error) {
    logger.logError(error, event);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' }),
    };
  }
};
