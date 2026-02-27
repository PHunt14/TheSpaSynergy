import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { sendSms } from './functions/send-sms/resource.js';

const backend = defineBackend({
  auth,
  data,
  sendSms,
});

// Grant SNS publish permissions to the Lambda function
backend.sendSms.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['sns:Publish'],
    resources: ['*'],
  })
);
