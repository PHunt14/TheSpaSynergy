import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { sendAppointmentConfirmation } from '../../utils/email';
import { awsConfig } from '../../config/aws';

const client = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(client);

export async function POST(request) {
  try {
    const body = await request.json();
    const { vendorId, serviceId, dateTime, customer, status, paymentId } = body;

    if (!vendorId || !serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const appointmentId = randomUUID();

    const appointment = {
      appointmentId,
      vendorId,
      serviceId,
      dateTime,
      customer,
      status: status || 'pending',
      paymentId,
      createdAt: new Date().toISOString()
    };

    const command = new PutCommand({
      TableName: 'spa-appointments',
      Item: appointment
    });

    await docClient.send(command);

    // Send confirmation email (async, don't wait)
    if (process.env.SES_FROM_EMAIL) {
      // Fetch vendor and service details for email
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const vendorResult = await docClient.send(new GetCommand({
        TableName: 'spa-vendors',
        Key: { vendorId }
      }));
      
      const serviceResult = await docClient.send(new GetCommand({
        TableName: 'spa-services',
        Key: { serviceId }
      }));

      if (vendorResult.Item && serviceResult.Item) {
        sendAppointmentConfirmation(appointment, vendorResult.Item, serviceResult.Item);
      }
    }

    return Response.json({ 
      success: true, 
      appointmentId 
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
