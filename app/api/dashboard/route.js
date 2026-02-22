import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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
    // Get all appointments for this vendor
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAMES.APPOINTMENTS,
      IndexName: 'VendorDateIndex',
      KeyConditionExpression: 'vendorId = :vendorId',
      ExpressionAttributeValues: {
        ':vendorId': vendorId
      },
      ScanIndexForward: false // Most recent first
    }));

    // Enrich appointments with service details
    const appointments = await Promise.all(
      (result.Items || []).map(async (appointment) => {
        const serviceResult = await docClient.send(new GetCommand({
          TableName: TABLE_NAMES.SERVICES,
          Key: { serviceId: appointment.serviceId }
        }));

        return {
          ...appointment,
          service: serviceResult.Item
        };
      })
    );

    return Response.json({ appointments });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}
