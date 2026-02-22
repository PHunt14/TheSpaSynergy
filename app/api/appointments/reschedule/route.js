import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getAwsConfig } from '../../../config/aws';
import { TABLE_NAMES } from '../../../config/tables';

export async function POST(request) {
  try {
    const awsConfig = await getAwsConfig();
    const client = new DynamoDBClient(awsConfig);
    const docClient = DynamoDBDocumentClient.from(client);
    
    const { appointmentId, newDateTime } = await request.json();

    if (!appointmentId || !newDateTime) {
      return Response.json({ error: 'appointmentId and newDateTime required' }, { status: 400 });
    }

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAMES.APPOINTMENTS,
      Key: { appointmentId },
      UpdateExpression: 'SET dateTime = :newDateTime',
      ExpressionAttributeValues: {
        ':newDateTime': newDateTime
      }
    }));

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return Response.json({ error: 'Failed to reschedule appointment' }, { status: 500 });
  }
}
