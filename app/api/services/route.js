import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { awsConfig } from '../../config/aws';
import { TABLE_NAMES } from '../../config/tables';

const client = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(client);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');

  if (!vendorId) {
    return Response.json({ error: 'vendorId required' }, { status: 400 });
  }

  try {
    const command = new QueryCommand({
      TableName: TABLE_NAMES.SERVICES,
      IndexName: 'VendorIndex',
      KeyConditionExpression: 'vendorId = :vendorId',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':vendorId': vendorId,
        ':active': true
      }
    });

    const result = await docClient.send(command);
    return Response.json({ services: result.Items });
  } catch (error) {
    console.error('Error fetching services:', error);
    return Response.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { serviceId, vendorId, name, duration, price, isActive } = body;

    if (!serviceId || !vendorId || !name || !duration || price === undefined) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const command = new PutCommand({
      TableName: TABLE_NAMES.SERVICES,
      Item: {
        serviceId,
        vendorId,
        name,
        duration,
        price,
        isActive: isActive !== undefined ? isActive : true,
        createdAt: new Date().toISOString()
      }
    });

    await docClient.send(command);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error creating service:', error);
    return Response.json({ error: 'Failed to create service' }, { status: 500 });
  }
}