import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getAwsConfig } from '../../config/aws';
import { TABLE_NAMES } from '../../config/tables';

export async function GET() {
  try {
    const awsConfig = await getAwsConfig();
    const client = new DynamoDBClient(awsConfig);
    const docClient = DynamoDBDocumentClient.from(client);
    const command = new ScanCommand({
      TableName: TABLE_NAMES.VENDORS,
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':active': true
      }
    });

    const result = await docClient.send(command);
    console.log('Vendors result:', result.Items?.length, 'items')
    return Response.json({ vendors: result.Items });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    return Response.json({ 
      error: 'Failed to fetch vendors',
      details: error.message,
      errorName: error.name
    }, { status: 500 });
  }
}