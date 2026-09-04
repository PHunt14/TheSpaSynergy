import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { refreshSquareTokens } from '../functions/refresh-square-tokens/resource';

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
      spaRoomHours: a.json(),
      bufferMinutes: a.integer().default(15),
      socialFacebook: a.string(),
      socialInstagram: a.string(),
      socialTiktok: a.string(),
      socialWebsite: a.string(),
      googlePlaceId: a.string(),
      bookingDisabledUntil: a.string(),
    })
    .identifier(['vendorId'])
    .authorization((allow) => [allow.publicApiKey()]),

  ServiceCategory: a
    .model({
      categoryId: a.id().required(),
      name: a.string().required(),
      createdAt: a.string(),
    })
    .identifier(['categoryId'])
    .authorization((allow) => [allow.publicApiKey()]),

  Service: a
    .model({
      serviceId: a.id().required(),
      // Optional: services are global/staff-driven entities. Many records are
      // vendor-less (write handlers strip vendorId, and payment routes to the
      // assigned staff, not the service's vendor). A required vendorId caused
      // listServices to fail with "Cannot return null for non-nullable type"
      // whenever a record had a null vendorId. Kept for the GSI below; records
      // without a vendorId simply do not appear in the listServiceByVendorId index.
      vendorId: a.string(),
      name: a.string().required(),
      description: a.string(),
      categories: a.string().array(),
      resourceType: a.string().default('staff'),
      duration: a.integer().required(),
      price: a.float().required(),
      bufferMinutes: a.integer(),
      houseFeeEnabled: a.boolean().default(false),
      houseFeeAmount: a.float().default(0),
      houseFeePercent: a.float().default(0),
      isActive: a.boolean().default(true),
      requiresConsultation: a.boolean().default(false),
      cardPaymentDisabled: a.boolean().default(false),
      allowedStaff: a.string().array(),
      parentServiceIds: a.string().array(),
      providersRequired: a.integer().default(1),
      maxQuantityPerBooking: a.integer().default(1),
      minPeople: a.integer(),
      maxPeople: a.integer(),
      paymentSplitRules: a.json(),
    })
    .identifier(['serviceId'])
    .secondaryIndexes((index) => [
      index('vendorId')  // GSI for listServicesByVendor queries (Requirement 12.2)
    ])
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
      serviceOrder: a.string().array(),
      schedule: a.json(),
      multiDay: a.boolean().default(false),
      refundRecord: a.json(),
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
      groupId: a.string(),
      dateTime: a.string().required(),
      customer: a.json().required(),
      status: a.string().default('pending'),
      paymentId: a.string(),
      paymentAmount: a.float(),
      paymentStatus: a.string(),
      paymentRaw: a.json(),
      clientId: a.string(),
      createdBy: a.string(),
      createdAt: a.datetime(),
    })
    .identifier(['appointmentId'])
    .secondaryIndexes((index) => [
      index('vendorId').sortKeys(['dateTime']),
      index('groupId')
    ])
    .authorization((allow) => [allow.publicApiKey()]),

  // Atomic double-booking guard.
  // The primary key (slotKey) is a single quantized slot "cell" for one staff
  // member: `${staffId}#${date}#${cellIndex}` where cellIndex is a fixed-grid
  // (5-minute) bucket. DynamoDB's auto-generated create is a PutItem with an
  // implicit attribute_not_exists(slotKey) condition, so two concurrent creates
  // of the SAME cell can never both succeed — exactly one wins. A booking
  // reserves every cell its [start, start+duration+buffer) interval touches;
  // if any cell is already taken, the slot overlaps and the booking is rejected
  // atomically (no post-hoc race window). Reservations are released (deleted)
  // when the owning appointment is cancelled/rescheduled/reassigned.
  SlotReservation: a
    .model({
      slotKey: a.id().required(),
      appointmentId: a.string().required(),
      staffId: a.string().required(),
      vendorId: a.string(),
      date: a.string().required(),
      cellIndex: a.integer().required(),
      groupId: a.string(),
      createdAt: a.datetime(),
    })
    .identifier(['slotKey'])
    .secondaryIndexes((index) => [index('appointmentId')])
    .authorization((allow) => [allow.publicApiKey()]),

  SiteSettings: a
    .model({
      settingKey: a.id().required(),
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
      bookingDisabledUntil: a.string(),
      squareAccessToken: a.string(),
      squareRefreshToken: a.string(),
      squareLocationId: a.string(),
      squareMerchantId: a.string(),
      squareOAuthStatus: a.string().default('disconnected'),
      squareTokenExpiresAt: a.string(),
      squareConnectedAt: a.string(),
      squareCatalogMappings: a.json(),
    })
    .identifier(['visibleId'])
    .secondaryIndexes((index) => [index('vendorId')])
    .authorization((allow) => [allow.publicApiKey()]),

  Client: a
    .model({
      clientId: a.id().required(),
      name: a.string().required(),
      phone: a.string(),
      email: a.string(),
      createdAt: a.datetime(),
    })
    .identifier(['clientId'])
    .secondaryIndexes((index) => [index('phone'), index('email')])
    .authorization((allow) => [allow.publicApiKey()]),

  ClientNote: a
    .model({
      noteId: a.id().required(),
      clientId: a.string().required(),
      authorId: a.string().required(),
      authorName: a.string().required(),
      content: a.string().required(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
    })
    .identifier(['noteId'])
    .secondaryIndexes((index) => [index('clientId').sortKeys(['createdAt'])])
    .authorization((allow) => [allow.publicApiKey()]),

  SplitPaymentSession: a
    .model({
      sessionId: a.id().required(),
      bundleId: a.string(),
      groupId: a.string(),
      appointmentId: a.string(),
      totalAmountCents: a.integer().required(),
      splitType: a.enum(['equal', 'custom']),
      payerCount: a.integer().required(),
      status: a.enum(['pending', 'partial', 'completed', 'expired', 'refunded', 'partially_refunded']),
      payers: a.json().required(),
      createdAt: a.string().required(),
      expiresAt: a.string().required(),
    })
    .identifier(['sessionId'])
    .secondaryIndexes((index) => [
      index('bundleId')
    ])
    .authorization((allow) => [allow.publicApiKey()]),
})
  // Grant the scheduled token-refresh function IAM access to the GraphQL API so
  // it can list and update StaffSchedule records. Function access is configured
  // at the schema level (it cannot be set per-model).
  .authorization((allow) => [allow.resource(refreshSquareTokens)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
