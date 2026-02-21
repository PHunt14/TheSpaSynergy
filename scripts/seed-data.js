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
  // Winsome Woods
  { serviceId: 'svc-massage-60', vendorId: 'vendor-winsome', name: 'Swedish Massage', duration: 60, price: 80, isActive: true },
  { serviceId: 'svc-massage-90', vendorId: 'vendor-winsome', name: 'Deep Tissue Massage', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-facial', vendorId: 'vendor-winsome', name: 'Relaxation Facial', duration: 60, price: 75, isActive: true },
  { serviceId: 'svc-aromatherapy', vendorId: 'vendor-winsome', name: 'Aromatherapy Session', duration: 45, price: 65, isActive: true },
  
  // Chemically Lavish
  { serviceId: 'svc-haircut', vendorId: 'vendor-chemically', name: 'Haircut & Style', duration: 45, price: 50, isActive: true },
  { serviceId: 'svc-color', vendorId: 'vendor-chemically', name: 'Full Color', duration: 120, price: 150, isActive: true },
  { serviceId: 'svc-highlights', vendorId: 'vendor-chemically', name: 'Highlights', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-blowout', vendorId: 'vendor-chemically', name: 'Blowout', duration: 30, price: 35, isActive: true },
  
  // The Kera Studio
  // https://www.vagaro.com/thekerastudio/services
  // Need length of services for these as well!
  // Spa Room
  { serviceId: 'svc-kera-head-bath', vendorId: 'vendor-kera', name: 'Head Bath', duration: 60, price: 115, isActive: true },
  { serviceId: 'svc-facial', vendorId: 'vendor-kera', name: 'Facial', duration: 60, price: 65, isActive: true },
  { serviceId: 'svc-mini-facial', vendorId: 'vendor-kera', name: 'Mini Facial', duration: 30, price: 30, isActive: true },
  { serviceId: 'svc-beard-facial', vendorId: 'vendor-kera', name: 'Beard Facial', duration: 60, price: 65, isActive: true },
  { serviceId: 'svc-couple-head-bath', vendorId: 'vendor-kera', name: 'Couples Head Bath', duration: 120, price: 230, isActive: true },

  // Hair Studio
  { serviceId: 'svc-kera-trim', vendorId: 'vendor-kera', name: 'Trim', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-kera-up-do', vendorId: 'vendor-kera', name: 'Up-Do', duration: 60, price: 55, isActive: true },
  { serviceId: 'svc-kera-kids-cut', vendorId: 'vendor-kera', name: 'Kids Cut', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-kera-shampoo-style', vendorId: 'vendor-kera', name: 'Shampoo & Style', duration: 45, price: 35, isActive: true },
  { serviceId: 'svc-kera-highlights', vendorId: 'vendor-kera', name: 'Highlights', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-kera-color-treatment', vendorId: 'vendor-kera', name: 'Color Treatment', duration: 60, price: 95, isActive: true },
  { serviceId: 'svc-kera-womens-haircut', vendorId: 'vendor-kera', name: 'Womens Haircut', duration: 30, price: 38, isActive: true },
  { serviceId: 'svc-kera-mens-haircut', vendorId: 'vendor-kera', name: 'Mens Haircut', duration: 30, price: 25, isActive: true },
  { serviceId: 'svc-kera-partial-vivid-color', vendorId: 'vendor-kera', name: 'Partial Vivid Color', duration: 60, price: 145, isActive: true },

  // Nail Care
  { serviceId: 'svc-kera-manicure', vendorId: 'vendor-kera', name: 'Manicure', duration: 30, price: 35, isActive: true },
  { serviceId: 'svc-kera-pedicure', vendorId: 'vendor-kera', name: 'Pedicure', duration: 45, price: 45, isActive: true },
  { serviceId: 'svc-kera-foot-soak', vendorId: 'vendor-kera', name: 'Foot Soak', duration: 30, price: 18, isActive: true },

  // Wedding
  { serviceId: 'svc-kera-wedding', vendorId: 'vendor-kera', name: 'Wedding Trial', duration: 60, price: 0, isActive: true },
  // Selene Glow Services
  { serviceId: 'svc-kera-manicure-reg-polish', vendorId: 'vendor-kera', name: 'Manicure & Regular Polish', duration: 30, price: 25, isActive: true },
  { serviceId: 'svc-kera-manicure-gel-polish', vendorId: 'vendor-kera', name: 'Manicure & Gel Polish', duration: 30, price: 35, isActive: true },
  { serviceId: 'svc-kera-deluxe-manicure', vendorId: 'vendor-kera', name: 'Deluxe Manicure', duration: 30, price: 45, isActive: true },
  { serviceId: 'svc-kera-polish', vendorId: 'vendor-kera', name: 'Polish - Hands', duration: 30, price: 15, isActive: true },
  // Sauna
  { serviceId: 'svc-kera-sauna-25', vendorId: 'vendor-kera', name: 'Sauna - 25 min', duration: 25, price: 10, isActive: true },
  { serviceId: 'svc-kera-sauna-45', vendorId: 'vendor-kera', name: 'Sauna - 45 min', duration: 45, price: 18, isActive: true }

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
