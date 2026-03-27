import { CognitoIdentityProviderClient, AdminCreateUserCommand, ListUsersCommand, AdminDeleteUserCommand, AdminUpdateUserAttributesCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { sendEmail } from '@/lib/email';
import config from '@/amplify_outputs.json';
import { cookies } from 'next/headers';
import { fetchAuthSession } from 'aws-amplify/auth/server';
import { Amplify } from 'aws-amplify';
import { createServerRunner } from '@aws-amplify/adapter-nextjs';

Amplify.configure(config, { ssr: true });

const { runWithAmplifyServerContext } = createServerRunner({ config });

const getClientWithCredentials = async () => {
  const session = await runWithAmplifyServerContext({
    nextServerContext: { cookies },
    operation: async (contextSpec) => {
      return await fetchAuthSession(contextSpec);
    }
  });
  
  return new CognitoIdentityProviderClient({ 
    region: config.auth.aws_region,
    credentials: session.credentials
  });
};

// Get User Pool ID from amplify config
const getUserPoolId = () => {
  return config.auth.user_pool_id;
};

// Get current user from session
const getCurrentUserFromSession = async () => {
  try {
    return await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: async (contextSpec) => {
        const session = await fetchAuthSession(contextSpec);
        const idToken = session.tokens?.idToken;
        if (!idToken) return null;
        
        return {
          role: idToken.payload['custom:role'] as string || 'staff',
          vendorId: idToken.payload['custom:vendorId'] as string
        };
      }
    });
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUserFromSession();
    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, firstName, lastName, vendorId, role } = await request.json();

    if (!email || !role) {
      return Response.json({ error: 'Email and role required' }, { status: 400 });
    }

    if (role === 'vendor' && !vendorId) {
      return Response.json({ error: 'VendorId required for vendor role' }, { status: 400 });
    }

    // Vendor/owner can only invite staff to their own vendor, and cannot create admins
    if (currentUser.role === 'vendor' || currentUser.role === 'owner') {
      if (role === 'admin') {
        return Response.json({ error: 'Unauthorized: Cannot create admin users' }, { status: 403 });
      }
      if (vendorId && vendorId !== currentUser.vendorId) {
        return Response.json({ error: 'Unauthorized: Can only invite staff to your own vendor' }, { status: 403 });
      }
    }

    const userPoolId = getUserPoolId();
    if (!userPoolId) {
      return Response.json({ error: 'User pool not configured' }, { status: 500 });
    }

    const client = await getClientWithCredentials();

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

    if (firstName) {
      userAttributes.push({
        Name: 'given_name',
        Value: firstName
      });
    }

    if (lastName) {
      userAttributes.push({
        Name: 'family_name',
        Value: lastName
      });
    }

    // Add vendorId for vendor and owner users
    if ((role === 'vendor' || role === 'owner') && vendorId) {
      userAttributes.push({
        Name: 'custom:vendorId',
        Value: vendorId
      });
    }

    // Generate a temporary password
    const tempPassword = `Tmp${Math.random().toString(36).slice(2, 8)}!${Math.floor(Math.random() * 90 + 10)}`;

    const command = new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: userAttributes,
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS',
    });

    await client.send(command);

    // Send branded invite email via SES
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://thespasynergy.com';
    const nameGreeting = firstName ? ` ${firstName}` : '';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #8B4789;">Welcome to The Spa Synergy!</h2>
        <p>Hi${nameGreeting},</p>
        <p>You've been invited to the vendor dashboard. Here are your login credentials:</p>
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p>You'll be asked to set a new password on your first login.</p>
        <p><a href="${appUrl}/dashboard" style="display: inline-block; background: #8B4789; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Log In to Dashboard</a></p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">
          The Spa Synergy<br>Fort Ritchie, MD
        </p>
      </div>`;

    await sendEmail(email, 'Your Spa Synergy Dashboard Invitation', html);

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

    const currentUser = await getCurrentUserFromSession();
    if (!currentUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await getClientWithCredentials();

    const command = new ListUsersCommand({
      UserPoolId: userPoolId
    });

    const response = await client.send(command);

    let users = response.Users?.map(user => ({
      username: user.Username,
      email: user.Attributes?.find(attr => attr.Name === 'email')?.Value,
      firstName: user.Attributes?.find(attr => attr.Name === 'given_name')?.Value,
      lastName: user.Attributes?.find(attr => attr.Name === 'family_name')?.Value,
      role: user.Attributes?.find(attr => attr.Name === 'custom:role')?.Value || 'staff',
      vendorId: user.Attributes?.find(attr => attr.Name === 'custom:vendorId')?.Value,
      status: user.UserStatus,
      created: user.UserCreateDate
    })) || [];

    // Vendor/owner can only see users assigned to their own vendor
    if (currentUser.role === 'vendor' || currentUser.role === 'owner') {
      users = users.filter(u => u.vendorId === currentUser.vendorId);
    }

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

    const currentUser = await getCurrentUserFromSession();
    // Vendor cannot delete any users
    if (currentUser?.role === 'vendor') {
      return Response.json({ error: 'Unauthorized: Vendor cannot delete users' }, { status: 403 });
    }

    const client = await getClientWithCredentials();

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
    const { username, role, vendorId, firstName, lastName } = await request.json();

    if (!username || !role) {
      return Response.json({ error: 'Username and role required' }, { status: 400 });
    }

    const userPoolId = getUserPoolId();
    if (!userPoolId) {
      return Response.json({ error: 'User pool not configured' }, { status: 500 });
    }

    const client = await getClientWithCredentials();

    const currentUser = await getCurrentUserFromSession();
    // Vendor can only edit their own account
    if (currentUser?.role === 'vendor') {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: username
      });
      const targetUser = await client.send(getUserCommand);
      const targetEmail = targetUser.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
      
      // Get current user's email from session
      const emailResult = await runWithAmplifyServerContext({
        nextServerContext: { cookies },
        operation: async (contextSpec) => {
          const session = await fetchAuthSession(contextSpec);
          return session.tokens?.idToken?.payload['email'] as string;
        }
      });
      const currentEmail = emailResult;
      
      if (targetEmail !== currentEmail) {
        return Response.json({ error: 'Unauthorized: Vendor can only edit their own account' }, { status: 403 });
      }
      // Vendor cannot change their own role or vendor
      const targetRole = targetUser.UserAttributes?.find(attr => attr.Name === 'custom:role')?.Value || 'staff';
      const targetVendorId = targetUser.UserAttributes?.find(attr => attr.Name === 'custom:vendorId')?.Value;
      if (role !== targetRole || vendorId !== targetVendorId) {
        return Response.json({ error: 'Unauthorized: Vendor cannot change role or vendor' }, { status: 403 });
      }
    }

    const attributes = [
      {
        Name: 'custom:role',
        Value: role
      }
    ];

    if (firstName !== undefined) {
      attributes.push({
        Name: 'given_name',
        Value: firstName
      });
    }

    if (lastName !== undefined) {
      attributes.push({
        Name: 'family_name',
        Value: lastName
      });
    }

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
