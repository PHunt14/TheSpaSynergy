import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event: any) => {
  const { to, subject, body, appointmentDetails } = JSON.parse(event.body || '{}');

  const params = {
    Source: process.env.SES_FROM_EMAIL || 'noreply@thespasynergy.com',
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject || 'Appointment Confirmation',
      },
      Body: {
        Html: {
          Data: body || `
            <h2>Appointment Confirmed</h2>
            <p>Thank you for booking with The Spa Synergy!</p>
            <p><strong>Date & Time:</strong> ${appointmentDetails?.dateTime}</p>
            <p><strong>Service:</strong> ${appointmentDetails?.serviceName}</p>
            <p><strong>Vendor:</strong> ${appointmentDetails?.vendorName}</p>
            <p>We look forward to seeing you!</p>
          `,
        },
      },
    },
  };

  try {
    await sesClient.send(new SendEmailCommand(params));
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
