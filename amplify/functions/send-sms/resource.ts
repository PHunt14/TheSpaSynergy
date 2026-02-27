import { defineFunction } from '@aws-amplify/backend';

export const sendSms = defineFunction({
  name: 'send-sms',
  entry: './handler.ts'
});
