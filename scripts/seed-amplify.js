import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

const vendors = [
  {
    vendorId: 'vendor-winsome',
    name: 'Winsome Woods',
    description: 'Massage and Wellness',
    email: 'contact@winsomewoods.com',
    phone: '301-992-3224',
    squareAccountId: 'PLACEHOLDER_SQUARE_ID_1',
    isActive: true,
    workingHours: {
      monday: { start: '12:00', end: '17:00' },
      tuesday: { start: '12:00', end: '17:00' },
      wednesday: { start: '12:00', end: '17:00' },
      thursday: { start: '12:00', end: '17:00' },
      friday: { start: '12:00', end: '17:00' },
      saturday: { start: '12:00', end: '17:00' },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  },
  {
    vendorId: 'vendor-chemically',
    name: 'Chemically Lavish',
    description: 'Hair Studio',
    email: 'contact@chemicallylavish.com',
    phone: '240-452-2839',
    squareAccountId: 'PLACEHOLDER_SQUARE_ID_2',
    isActive: false,
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
    phone: '240-329-6537',
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
  },
  {
    vendorId: 'vendor-radiant',
    name: 'Radiant Artistry',
    description: 'Hair Styling',
    email: 'contact@radiantartistry.com',
    phone: '240-452-2839',
    squareAccountId: 'PLACEHOLDER_SQUARE_ID_4',
    isActive: false,
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
  { serviceId: 'svc-massage-60', vendorId: 'vendor-winsome', category: 'Massage', name: 'Massage - 60 min', duration: 60, price: 65, isActive: true },
  { serviceId: 'svc-massage-90', vendorId: 'vendor-winsome', category: 'Massage', name: 'Massage - 90 min', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-reiki', vendorId: 'vendor-winsome', category: 'Wellness', name: 'Reiki', duration: 30, price: 75, isActive: true },
  { serviceId: 'svc-sound-healing-30', vendorId: 'vendor-winsome', category: 'Wellness', name: 'Sound Healing - 30 min', duration: 30, price: 35, isActive: true },
  { serviceId: 'svc-sound-healing-60', vendorId: 'vendor-winsome', category: 'Wellness', name: 'Sound Healing - 60 min', duration: 60, price: 50, isActive: true },
  { serviceId: 'svc-redlight-therapy', vendorId: 'vendor-winsome', category: 'Red Light', name: 'Red Light Therapy', duration: 30, price: 25, isActive: true },
  { serviceId: 'svc-tarot-30', vendorId: 'vendor-winsome', category: 'Tarot', name: 'Tarot Reading - 30 min', duration: 30, price: 20, isActive: true },
  { serviceId: 'svc-tarot-60', vendorId: 'vendor-winsome', category: 'Tarot', name: 'Tarot Reading - 60 min', duration: 60, price: 45, isActive: true },
  { serviceId: 'svc-salt-soak', vendorId: 'vendor-winsome', category: 'Wellness', name: 'Foot Salt Soak', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-salt-soak-detox', vendorId: 'vendor-winsome', category: 'Wellness', name: 'Ionic Foot Detox', duration: 30, price: 20, isActive: true },
  
  // Chemically Lavish
  { serviceId: 'svc-haircut', vendorId: 'vendor-chemically', category: 'Hair', name: 'Haircut & Style', duration: 45, price: 50, isActive: false },
  { serviceId: 'svc-color', vendorId: 'vendor-chemically', category: 'Hair Color', name: 'Full Color', duration: 120, price: 150, isActive: false },
  { serviceId: 'svc-highlights', vendorId: 'vendor-chemically', category: 'Hair Color', name: 'Highlights', duration: 90, price: 120, isActive: false },
  { serviceId: 'svc-blowout', vendorId: 'vendor-chemically', category: 'Hair', name: 'Blowout', duration: 30, price: 35, isActive: false },
  
  // Radiant Artistry
  { serviceId: 'svc-radiant-haircut', vendorId: 'vendor-radiant', category: 'Hair', name: 'Haircut & Style', duration: 45, price: 50, isActive: false },
  { serviceId: 'svc-radiant-color', vendorId: 'vendor-radiant', category: 'Hair Color', name: 'Full Color', duration: 120, price: 150, isActive: false },
  { serviceId: 'svc-radiant-highlights', vendorId: 'vendor-radiant', category: 'Hair Color', name: 'Highlights', duration: 90, price: 120, isActive: false },
  { serviceId: 'svc-radiant-blowout', vendorId: 'vendor-radiant', category: 'Hair', name: 'Blowout', duration: 30, price: 35, isActive: false },
  
  // The Kera Studio
  { serviceId: 'svc-kera-head-bath', vendorId: 'vendor-kera', category: 'Spa Room', name: 'Head Bath', duration: 60, price: 115, isActive: true },
  { serviceId: 'svc-kera-facial', vendorId: 'vendor-kera', category: 'Spa Room', name: 'Facial', duration: 60, price: 65, isActive: true },
  { serviceId: 'svc-mini-facial', vendorId: 'vendor-kera', category: 'Spa Room', name: 'Mini Facial', duration: 30, price: 30, isActive: true },
  { serviceId: 'svc-beard-facial', vendorId: 'vendor-kera', category: 'Spa Room', name: 'Beard Facial', duration: 60, price: 65, isActive: true },
  { serviceId: 'svc-couple-head-bath', vendorId: 'vendor-kera', category: 'Spa Room', name: 'Couples Head Bath', duration: 120, price: 230, isActive: true },
  { serviceId: 'svc-kera-trim', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Trim', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-kera-up-do', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Up-Do', duration: 60, price: 55, isActive: true },
  { serviceId: 'svc-kera-kids-cut', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Kids Cut', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-kera-shampoo-style', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Shampoo & Style', duration: 45, price: 35, isActive: true },
  { serviceId: 'svc-kera-highlights', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Highlights', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-kera-color-treatment', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Color Treatment', duration: 60, price: 95, isActive: true },
  { serviceId: 'svc-kera-womens-haircut', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Womens Haircut', duration: 30, price: 38, isActive: true },
  { serviceId: 'svc-kera-mens-haircut', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Mens Haircut', duration: 30, price: 25, isActive: true },
  { serviceId: 'svc-kera-partial-vivid-color', vendorId: 'vendor-kera', category: 'Hair Studio', name: 'Partial Vivid Color', duration: 60, price: 145, isActive: true },
  { serviceId: 'svc-kera-manicure', vendorId: 'vendor-kera', category: 'Nail Care', name: 'Manicure', duration: 30, price: 35, isActive: true },
  { serviceId: 'svc-kera-pedicure', vendorId: 'vendor-kera', category: 'Nail Care', name: 'Pedicure', duration: 45, price: 45, isActive: true },
  { serviceId: 'svc-kera-foot-soak', vendorId: 'vendor-kera', category: 'Nail Care', name: 'Foot Soak', duration: 30, price: 18, isActive: true },
  { serviceId: 'svc-kera-wedding', vendorId: 'vendor-kera', category: 'Wedding', name: 'Wedding Trial', duration: 60, price: 0, isActive: true },
  { serviceId: 'svc-kera-manicure-reg-polish', vendorId: 'vendor-kera', category: 'Selene Glow', name: 'Manicure & Regular Polish', duration: 30, price: 25, isActive: true },
  { serviceId: 'svc-kera-manicure-gel-polish', vendorId: 'vendor-kera', category: 'Selene Glow', name: 'Manicure & Gel Polish', duration: 30, price: 35, isActive: true },
  { serviceId: 'svc-kera-deluxe-manicure', vendorId: 'vendor-kera', category: 'Selene Glow', name: 'Deluxe Manicure', duration: 30, price: 45, isActive: true },
  { serviceId: 'svc-kera-polish', vendorId: 'vendor-kera', category: 'Selene Glow', name: 'Polish - Hands', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-kera-sauna-25', vendorId: 'vendor-kera', category: 'Sauna', resourceType: 'sauna', name: 'Sauna - 25 min', duration: 25, price: 10, isActive: true },
  { serviceId: 'svc-kera-sauna-45', vendorId: 'vendor-kera', category: 'Sauna', resourceType: 'sauna', name: 'Sauna - 45 min', duration: 45, price: 18, isActive: true }
];

async function seedData() {
  console.log('Seeding vendors...');
  
  for (const vendor of vendors) {
    const vendorData = {
      ...vendor,
      workingHours: JSON.stringify(vendor.workingHours)
    };
    const { data, errors } = await client.models.Vendor.update(vendorData);
    if (errors) {
      console.error(`✗ Error updating vendor ${vendor.name}:`, errors);
    } else {
      console.log(`✓ Updated vendor: ${vendor.name}`);
    }
  }

  console.log('\nSeeding services...');
  
  for (const service of services) {
    const { data, errors } = await client.models.Service.update(service);
    if (errors) {
      console.error(`✗ Error updating service ${service.name}:`, errors);
    } else {
      console.log(`✓ Updated service: ${service.name}`);
    }
  }

  console.log('\n✅ All data seeded successfully!');
}

seedData().catch(console.error);
