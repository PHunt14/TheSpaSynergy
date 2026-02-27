import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Vendor: a
    .model({
      vendorId: a.id().required(),
      name: a.string().required(),
      description: a.string(),
      email: a.email().required(),
      phone: a.string(),
      smsAlertPhone: a.string(),
      smsAlertsEnabled: a.boolean().default(false),
      squareAccountId: a.string(),
      isActive: a.boolean().default(true),
      workingHours: a.json(),
      bufferMinutes: a.integer().default(15),
    })
    .identifier(['vendorId'])
    .authorization((allow) => [allow.publicApiKey()]),

  Service: a
    .model({
      serviceId: a.id().required(),
      vendorId: a.string().required(),
      name: a.string().required(),
      description: a.string(),
      category: a.string(),
      resourceType: a.string().default('staff'),
      duration: a.integer().required(),
      price: a.float().required(),
      isActive: a.boolean().default(true),
    })
    .identifier(['serviceId'])
    .secondaryIndexes((index) => [index('vendorId')])
    .authorization((allow) => [allow.publicApiKey()]),

  Bundle: a
    .model({
      bundleId: a.id().required(),
      name: a.string().required(),
      description: a.string(),
      serviceIds: a.string().array().required(),
      price: a.float().required(),
      isActive: a.boolean().default(true),
    })
    .identifier(['bundleId'])
    .authorization((allow) => [allow.publicApiKey()]),

  Appointment: a
    .model({
      appointmentId: a.id().required(),
      vendorId: a.string().required(),
      serviceId: a.string().required(),
      dateTime: a.string().required(),
      customer: a.json().required(),
      status: a.string().default('pending'),
      paymentId: a.string(),
      createdAt: a.datetime(),
    })
    .identifier(['appointmentId'])
    .secondaryIndexes((index) => [
      index('vendorId').sortKeys(['dateTime'])
    ])
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
