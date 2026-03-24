import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({ region: 'us-east-1' });

export const handler = async (event: any) => {
  try {
    const { to, subject, htmlBody, fromEmail } = JSON.parse(event.body || '{}');

    if (!to || !subject || !htmlBody) {
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

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully' }),
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' }),
    };
  }
};
