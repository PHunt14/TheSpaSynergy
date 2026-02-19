import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { awsConfig } from '../../config/aws';

const client = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(client);

export async function GET() {
  try {
    console.log('Vendors API called');
    console.log('Config region:', awsConfig.region);
    console.log('Has credentials:', !!awsConfig.credentials);
    console.log('Access key starts with:', awsConfig.credentials?.accessKeyId?.substring(0, 10));
    console.log('Secret key length:', awsConfig.credentials?.secretAccessKey?.length);
    
    const command = new ScanCommand({
      TableName: 'spa-vendors',
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