import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { sendSms } from './functions/send-sms/resource.js';
import { sendEmail } from './functions/send-email/resource.js';

const backend = defineBackend({
  auth,
  data,
  sendSms,
  sendEmail,
});

// Grant SNS publish permissions to the Lambda function
backend.sendSms.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['sns:Publish'],
    resources: ['*'],
  })
);

// Grant SES send email permissions to the Lambda function
backend.sendEmail.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);

// Add public function URL for email sending
backend.sendEmail.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

// Grant Cognito admin permissions to authenticated users
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminCreateUser',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminUpdateUserAttributes',
      'cognito-idp:AdminGetUser',
      'cognito-idp:ListUsers',
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);

// Also grant to unauthenticated role (for edge cases during auth flow)
backend.auth.resources.unauthenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: [
      'cognito-idp:AdminCreateUser',
      'cognito-idp:AdminDeleteUser',
      'cognito-idp:AdminUpdateUserAttributes',
      'cognito-idp:AdminGetUser',
      'cognito-idp:ListUsers',
    ],
    resources: [backend.auth.resources.userPool.userPoolArn],
  })
);

// Grant SES permissions for sending appointment emails
backend.auth.resources.unauthenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: [],
    resources: [],
  })
);
