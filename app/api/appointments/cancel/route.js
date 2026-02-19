import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { sendCancellationEmail } from '../../../utils/email';
import { awsConfig } from '../../../config/aws';

const client = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(client);

export async function POST(request) {
  try {
    const { appointmentId } = await request.json();

    if (!appointmentId) {
      return Response.json({ error: 'appointmentId required' }, { status: 400 });
    }

    // Get appointment details before cancelling
    const getResult = await docClient.send(new GetCommand({
      TableName: 'spa-appointments',
      Key: { appointmentId }
    }));

    const appointment = getResult.Item;
    if (!appointment) {
      return Response.json({ error: 'Appointment not found' }, { status: 404 });
    }

    // Update status to cancelled
    await docClient.send(new UpdateCommand({
      TableName: 'spa-appointments',
      Key: { appointmentId },
      UpdateExpression: 'SET #status = :cancelled',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':cancelled': 'cancelled'
      }
    }));

    // Send cancellation email
    if (process.env.SES_FROM_EMAIL) {
      const vendorResult = await docClient.send(new GetCommand({
        TableName: 'spa-vendors',
        Key: { vendorId: appointment.vendorId }
      }));

      const serviceResult = await docClient.send(new GetCommand({
        TableName: 'spa-services',
        Key: { serviceId: appointment.serviceId }
      }));

      if (vendorResult.Item && serviceResult.Item) {
        sendCancellationEmail(appointment, vendorResult.Item, serviceResult.Item);
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    return Response.json({ error: 'Failed to cancel appointment' }, { status: 500 });
  }
}
