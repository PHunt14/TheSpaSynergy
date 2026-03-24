// Run this script to make a user an owner
// Usage: node scripts/make-owner.js YOUR_EMAIL@example.com

import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import config from '../amplify_outputs.json' assert { type: 'json' };

const client = new CognitoIdentityProviderClient({ region: config.auth.aws_region });
const userPoolId = config.auth.user_pool_id;

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/make-owner.js YOUR_EMAIL@example.com');
  process.exit(1);
}

async function makeOwner() {
  try {
    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: [
        {
          Name: 'custom:role',
          Value: 'owner'
        }
      ]
    });

    await client.send(command);
    console.log(`✅ Successfully set ${email} as owner`);
    console.log('Please log out and log back in for changes to take effect.');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

makeOwner();
