import { CognitoIdentityProviderClient, AdminCreateUserCommand, ListUsersCommand, AdminDeleteUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import config from '@/amplify_outputs.json';

const client = new CognitoIdentityProviderClient({ region: config.auth.aws_region });

// Get User Pool ID from amplify config
const getUserPoolId = () => {
  return config.auth.user_pool_id;
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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return Response.json({ error: 'Username required' }, { status: 400 });
    }

    const userPoolId = getUserPoolId();
    if (!userPoolId) {
      return Response.json({ error: 'User pool not configured' }, { status: 500 });
    }

    const command = new AdminDeleteUserCommand({
      UserPoolId: userPoolId,
      Username: username
    });

    await client.send(command);

    return Response.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return Response.json({ 
      error: 'Failed to delete user',
      details: error.message 
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { username, role, vendorId } = await request.json();

    if (!username || !role) {
      return Response.json({ error: 'Username and role required' }, { status: 400 });
    }

    const userPoolId = getUserPoolId();
    if (!userPoolId) {
      return Response.json({ error: 'User pool not configured' }, { status: 500 });
    }

    const attributes = [
      {
        Name: 'custom:role',
        Value: role
      }
    ];

    if (vendorId) {
      attributes.push({
        Name: 'custom:vendorId',
        Value: vendorId
      });
    }

    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: attributes
    });

    await client.send(command);

    return Response.json({ success: true });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return Response.json({ 
      error: 'Failed to update user',
      details: error.message 
    }, { status: 500 });
  }
}
