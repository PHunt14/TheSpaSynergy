import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../data/resource.js';

const sesClient = new SESClient({ region: 'us-east-1' });
const dataClient = generateClient<Schema>();

export const handler = async (event: any) => {
  const { to, appointmentDetails } = JSON.parse(event.body || '{}');

  try {
    const [vendorRes, serviceRes] = await Promise.all([
      dataClient.models.Vendor.get({ vendorId: appointmentDetails.vendorId }),
      dataClient.models.Service.get({ serviceId: appointmentDetails.serviceId })
    ]);

    const vendor = vendorRes.data;
    const service = serviceRes.data;

    const formattedDate = new Date(appointmentDetails.dateTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York'
    });

    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #8B4789;">Appointment Confirmed</h2>
        <p>Thank you for booking with The Spa Synergy!</p>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Vendor:</strong> ${vendor?.name || 'N/A'}</p>
          <p><strong>Service:</strong> ${service?.name || 'N/A'}</p>
          <p><strong>Date & Time:</strong> ${formattedDate}</p>
          <p><strong>Duration:</strong> ${service?.duration || 0} minutes</p>
          <p><strong>Price:</strong> $${service?.price || 0}</p>
        </div>

        <p>If you need to cancel or reschedule, please contact us at least 24 hours in advance.</p>
        <p>We look forward to seeing you!</p>
        
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          The Spa Synergy<br>
          Fort Ritchie, MD
        </p>
      </div>
    `;

    await sesClient.send(new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL || 'patrick@fortinbras.net',
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: 'Appointment Confirmation - The Spa Synergy' },
        Body: { Html: { Data: emailBody } }
      }
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
