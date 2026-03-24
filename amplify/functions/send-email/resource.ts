import { defineFunction } from '@aws-amplify/backend';

export const sendEmail = defineFunction({
  name: 'send-email',
  entry: './handler.ts',
  environment: {
    SES_FROM_EMAIL: 'patrick@fortinbras.net',
  },
});
