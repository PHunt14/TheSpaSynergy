import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { CfnApp } from 'aws-cdk-lib/aws-pinpoint';
import { Stack } from 'aws-cdk-lib';
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

// --- Pinpoint Analytics ---
const analyticsStack = backend.createStack('analytics-stack');
const pinpointApp = new CfnApp(analyticsStack, 'Pinpoint', {
  name: 'theSpaSynergy',
});

backend.addOutput({
  analytics: {
    amazon_pinpoint: {
      app_id: pinpointApp.ref,
      aws_region: Stack.of(analyticsStack).region,
    },
  },
});

// Allow unauthenticated users (public visitors) to submit analytics events
backend.auth.resources.unauthenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: ['mobiletargeting:PutEvents', 'mobiletargeting:UpdateEndpoint'],
    resources: ['*'],
  })
);
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: ['mobiletargeting:PutEvents', 'mobiletargeting:UpdateEndpoint'],
    resources: ['*'],
  })
);

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

// Add public function URL for email sending and output it to amplify_outputs.json
const emailFnUrl = backend.sendEmail.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

backend.addOutput({
  custom: {
    sendEmailFunctionUrl: emailFnUrl.url,
  },
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
