import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { awsConfig } from '../config/aws';

const sesClient = new SESClient(awsConfig);

export async function sendAppointmentConfirmation(appointment, vendor, service) {
  const params = {
    Source: process.env.SES_FROM_EMAIL || 'noreply@yourdomain.com',
    Destination: {
      ToAddresses: [appointment.customer.email]
    },
    Message: {
      Subject: {
        Data: `Appointment Confirmation - ${vendor.name}`
      },
      Body: {
        Html: {
          Data: `
            <h2>Appointment Confirmed!</h2>
            <p>Hi ${appointment.customer.name},</p>
            <p>Your appointment has been confirmed with the following details:</p>
            <ul>
              <li><strong>Vendor:</strong> ${vendor.name}</li>
              <li><strong>Service:</strong> ${service.name}</li>
              <li><strong>Duration:</strong> ${service.duration} minutes</li>
              <li><strong>Date & Time:</strong> ${appointment.dateTime}</li>
              <li><strong>Price:</strong> $${service.price}</li>
            </ul>
            <p>If you need to cancel or reschedule, please contact us.</p>
            <p>Thank you!</p>
          `
        },
        Text: {
          Data: `
Appointment Confirmed!

Hi ${appointment.customer.name},

Your appointment has been confirmed:
- Vendor: ${vendor.name}
- Service: ${service.name}
- Duration: ${service.duration} minutes
- Date & Time: ${appointment.dateTime}
- Price: $${service.price}

Thank you!
          `
        }
      }
    }
  };

  try {
    await sesClient.send(new SendEmailCommand(params));
    console.log('Confirmation email sent to:', appointment.customer.email);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

export async function sendCancellationEmail(appointment, vendor, service) {
  const params = {
    Source: process.env.SES_FROM_EMAIL || 'noreply@yourdomain.com',
    Destination: {
      ToAddresses: [appointment.customer.email]
    },
    Message: {
      Subject: {
        Data: `Appointment Cancelled - ${vendor.name}`
      },
      Body: {
        Html: {
          Data: `
            <h2>Appointment Cancelled</h2>
            <p>Hi ${appointment.customer.name},</p>
            <p>Your appointment has been cancelled:</p>
            <ul>
              <li><strong>Vendor:</strong> ${vendor.name}</li>
              <li><strong>Service:</strong> ${service.name}</li>
              <li><strong>Date & Time:</strong> ${appointment.dateTime}</li>
            </ul>
            <p>If you'd like to rebook, please visit our website.</p>
          `
        }
      }
    }
  };

  try {
    await sesClient.send(new SendEmailCommand(params));
    console.log('Cancellation email sent to:', appointment.customer.email);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}
