import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const vendors = [
  {
    vendorId: 'vendor-winsome',
    name: 'Winsome Woods',
    description: 'Massage and Wellness',
    email: 'contact@winsomewoods.com',
    squareAccountId: 'PLACEHOLDER_SQUARE_ID_1',
    isActive: true,
    workingHours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '09:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  },
  {
    vendorId: 'vendor-chemically',
    name: 'Chemically Lavish',
    description: 'Hair Studio',
    email: 'contact@chemicallylavish.com',
    squareAccountId: 'PLACEHOLDER_SQUARE_ID_2',
    isActive: true,
    workingHours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '09:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  },
  {
    vendorId: 'vendor-kera',
    name: 'The Kera Studio',
    description: 'Hair and Nails',
    email: 'contact@kerastudio.com',
    squareAccountId: 'PLACEHOLDER_SQUARE_ID_3',
    isActive: true,
    workingHours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '17:00' },
      wednesday: { start: '09:00', end: '17:00' },
      thursday: { start: '09:00', end: '17:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '09:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  }
];

const services = [
  // Winsome Woods - Massage and Wellness
  { serviceId: 'svc-massage-60', vendorId: 'vendor-winsome', name: 'Swedish Massage', duration: 60, price: 80, isActive: true },
  { serviceId: 'svc-massage-90', vendorId: 'vendor-winsome', name: 'Deep Tissue Massage', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-facial', vendorId: 'vendor-winsome', name: 'Relaxation Facial', duration: 60, price: 75, isActive: true },
  { serviceId: 'svc-aromatherapy', vendorId: 'vendor-winsome', name: 'Aromatherapy Session', duration: 45, price: 65, isActive: true },
  
  // Chemically Lavish - Hair Studio
  { serviceId: 'svc-haircut', vendorId: 'vendor-chemically', name: 'Haircut & Style', duration: 45, price: 50, isActive: true },
  { serviceId: 'svc-color', vendorId: 'vendor-chemically', name: 'Full Color', duration: 120, price: 150, isActive: true },
  { serviceId: 'svc-highlights', vendorId: 'vendor-chemically', name: 'Highlights', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-blowout', vendorId: 'vendor-chemically', name: 'Blowout', duration: 30, price: 35, isActive: true },
  
  // The Kera Studio - Hair and Nails
  { serviceId: 'svc-kera-haircut', vendorId: 'vendor-kera', name: 'Haircut & Style', duration: 45, price: 55, isActive: true },
  { serviceId: 'svc-manicure', vendorId: 'vendor-kera', name: 'Manicure', duration: 30, price: 30, isActive: true },
  { serviceId: 'svc-pedicure', vendorId: 'vendor-kera', name: 'Pedicure', duration: 45, price: 45, isActive: true },
  { serviceId: 'svc-gel-nails', vendorId: 'vendor-kera', name: 'Gel Nails', duration: 60, price: 60, isActive: true },
  { serviceId: 'svc-keratin', vendorId: 'vendor-kera', name: 'Keratin Treatment', duration: 120, price: 200, isActive: true }
];

async function seedData() {
  console.log('Seeding vendors...');
  
  for (const vendor of vendors) {
    await docClient.send(new PutCommand({
      TableName: 'spa-vendors',
      Item: vendor
    }));
    console.log(`✓ Added vendor: ${vendor.name}`);
  }

  console.log('\nSeeding services...');
  
  for (const service of services) {
    await docClient.send(new PutCommand({
      TableName: 'spa-services',
      Item: service
    }));
    console.log(`✓ Added service: ${service.name} (${service.vendorId})`);
  }

  console.log('\n✅ All data seeded successfully!');
}

seedData().catch(console.error);
