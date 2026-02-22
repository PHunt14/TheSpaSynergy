import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { awsConfig } from '../../config/aws';
import { TABLE_NAMES } from '../../config/tables';

const client = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(client);

export async function GET() {
  try {
    console.log('=== Vendors API Debug ===');
    console.log('Environment vars:', {
      ACCESS_KEY_ID: process.env.ACCESS_KEY_ID?.substring(0, 10),
      SECRET_ACCESS_KEY: process.env.SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID?.substring(0, 10),
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET',
      REGION: process.env.REGION,
      AWS_REGION: process.env.AWS_REGION,
      NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV
    });
    console.log('Config region:', awsConfig.region);
    console.log('Has credentials:', !!awsConfig.credentials);
    console.log('Full access key:', awsConfig.credentials?.accessKeyId);
    console.log('Secret key length:', awsConfig.credentials?.secretAccessKey?.length);
    console.log('Secret key first 10:', awsConfig.credentials?.secretAccessKey?.substring(0, 10));
    console.log('Table name:', TABLE_NAMES.VENDORS);
    
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