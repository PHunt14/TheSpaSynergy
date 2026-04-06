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
      squareApplicationId: a.string(),
      squareAccountId: a.string(),
      squareAccessToken: a.string(),
      squareRefreshToken: a.string(),
      squareLocationId: a.string(),
      squareMerchantId: a.string(),
      squareOAuthStatus: a.string().default('disconnected'),
      squareTokenExpiresAt: a.string(),
      squareConnectedAt: a.string(),
      isHouse: a.boolean().default(false),
      isActive: a.boolean().default(true),
      workingHours: a.json(),
      saunaHours: a.json(),
      bufferMinutes: a.integer().default(15),
      socialFacebook: a.string(),
      socialInstagram: a.string(),
      socialTiktok: a.string(),
      socialWebsite: a.string(),
      bookingDisabledUntil: a.string(),
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
      houseFeeEnabled: a.boolean().default(false),
      houseFeeAmount: a.float().default(0),
      houseFeePercent: a.float().default(0),
      isActive: a.boolean().default(true),
      requiresConsultation: a.boolean().default(false),
      cardPaymentDisabled: a.boolean().default(false),
      allowedStaff: a.string().array(),
      parentServiceIds: a.string().array(),
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
      vendorIds: a.string().array().required(),
      price: a.float().required(),
      discountPercent: a.float().default(0),
      isActive: a.boolean().default(true),
      status: a.string(),
      vendorConfirmations: a.json(),
      appointmentIds: a.string().array(),
      customer: a.json(),
      dateTime: a.string(),
      minPeople: a.integer(),
      maxPeople: a.integer(),
      allowedDays: a.string().array(),
      addOns: a.json(),
      contactOnly: a.boolean().default(false),
    })
    .identifier(['bundleId'])
    .authorization((allow) => [allow.publicApiKey()]),

  BundleSettings: a
    .model({
      settingsId: a.id().required(),
      discount1Service: a.float().default(0),
      discount2Services: a.float().default(0),
      discount3Services: a.float().default(0),
      discount4PlusServices: a.float().default(0),
    })
    .identifier(['settingsId'])
    .authorization((allow) => [allow.publicApiKey()]),

  Appointment: a
    .model({
      appointmentId: a.id().required(),
      vendorId: a.string().required(),
      serviceId: a.string().required(),
      staffId: a.string(),
      bundleId: a.string(),
      dateTime: a.string().required(),
      customer: a.json().required(),
      status: a.string().default('pending'),
      paymentId: a.string(),
      paymentAmount: a.float(),
      paymentStatus: a.string(),
      paymentRaw: a.json(),
      createdAt: a.datetime(),
    })
    .identifier(['appointmentId'])
    .secondaryIndexes((index) => [
      index('vendorId').sortKeys(['dateTime'])
    ])
    .authorization((allow) => [allow.publicApiKey()]),

  SiteSettings: a
    .model({
      settingKey: a.string().required(),
      settingValue: a.string(),
    })
    .identifier(['settingKey'])
    .authorization((allow) => [allow.publicApiKey()]),

  StaffSchedule: a
    .model({
      visibleId: a.id().required(),
      staffEmail: a.string().required(),
      staffName: a.string(),
      vendorId: a.string().required(),
      schedule: a.json(),
      autoAssignRules: a.json(),
      smsAlertsEnabled: a.boolean().default(false),
      smsAlertPhone: a.string(),
      emailAlertsEnabled: a.boolean().default(false),
      isActive: a.boolean().default(true),
      squareAccessToken: a.string(),
      squareRefreshToken: a.string(),
      squareLocationId: a.string(),
      squareMerchantId: a.string(),
      squareOAuthStatus: a.string().default('disconnected'),
      squareTokenExpiresAt: a.string(),
      squareConnectedAt: a.string(),
    })
    .identifier(['visibleId'])
    .secondaryIndexes((index) => [index('vendorId')])
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
