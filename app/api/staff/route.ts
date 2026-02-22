import { CognitoIdentityProviderClient, AdminCreateUserCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: 'us-east-1' });

// Get User Pool ID from environment
const getUserPoolId = () => {
  return process.env.AMPLIFY_AUTH_USERPOOL_ID;
};

export async function POST(request: Request) {
  try {
    const { email, vendorId, role } = await request.json();

    if (!email || !role) {
      return Response.json({ error: 'Email and role required' }, { status: 400 });
    }

    if (role === 'staff' && !vendorId) {
      return Response.json({ error: 'VendorId required for staff role' }, { status: 400 });
    }

    const userPoolId = getUserPoolId();
    if (!userPoolId) {
      return Response.json({ error: 'User pool not configured' }, { status: 500 });
    }

    const userAttributes = [
      {
        Name: 'email',
        Value: email
      },
      {
        Name: 'email_verified',
        Value: 'true'
      },
      {
        Name: 'custom:role',
        Value: role
      }
    ];

    // Only add vendorId for staff users
    if (role === 'staff' && vendorId) {
      userAttributes.push({
        Name: 'custom:vendorId',
        Value: vendorId
      });
    }

    const command = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: ['EMAIL']
    });

    await client.send(command);

    return Response.json({ 
      success: true,
      message: 'User invited successfully. They will receive an email with login instructions.'
    });
  } catch (error: any) {
    console.error('Error inviting user:', error);
    return Response.json({ 
      error: 'Failed to invite user',
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const userPoolId = getUserPoolId();
    if (!userPoolId) {
      return Response.json({ error: 'User pool not configured' }, { status: 500 });
    }

    const command = new ListUsersCommand({
      UserPoolId: userPoolId
    });

    const response = await client.send(command);

    const users = response.Users?.map(user => ({
      username: user.Username,
      email: user.Attributes?.find(attr => attr.Name === 'email')?.Value,
      role: user.Attributes?.find(attr => attr.Name === 'custom:role')?.Value || 'staff',
      vendorId: user.Attributes?.find(attr => attr.Name === 'custom:vendorId')?.Value,
      status: user.UserStatus,
      created: user.UserCreateDate
    })) || [];

    return Response.json({ users });
  } catch (error: any) {
    console.error('Error listing users:', error);
    return Response.json({ 
      error: 'Failed to list users',
      details: error.message 
    }, { status: 500 });
  }
}
