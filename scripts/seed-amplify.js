import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

// In dev/local, set DEV_SMS_PHONE in .env.local to route all vendor SMS to your test number
const devSmsPhone = process.env.DEV_SMS_PHONE || '';

const vendors = [
  {
    vendorId: 'vendor-winsome-woods',
    name: 'Winsome Woods',
    description: 'Natural remedies for stress relief',
    email: 'contact@winsomewoods.com',
    phone: '301-992-3224',
    smsAlertsEnabled: true,
    smsAlertPhone: devSmsPhone || '3019923224',
    isHouse: false,
    isActive: true,
    workingHours: {
      monday: { start: '9:00', end: '18:00' },
      tuesday: { start: '9:00', end: '18:00' },
      wednesday: { start: '9:00', end: '18:00' },
      thursday: { start: '9:00', end: '18:00' },
      friday: { start: '9:00', end: '18:00' },
      saturday: { start: '12:00', end: '18:00' },
      sunday: { start: '12:00', end: '18:00' }
    },
    bufferMinutes: 15
  },
  {
    vendorId: 'vendor-kera-studio',
    name: 'The Kera Studio',
    description: 'Providing our guests a place for reflection and peace',
    email: 'thekerastudio@gmail.com',
    phone: '240-329-6537',
    smsAlertsEnabled: true,
    smsAlertPhone: devSmsPhone || '2403296537',
    isHouse: true,
    isActive: true,
    workingHours: {
      monday: { start: null, end: null },
      tuesday: { start: '11:00', end: '18:00' },
      wednesday: { start: '11:00', end: '17:00' },
      thursday: { start: '11:00', end: '18:00' },
      friday: { start: '11:00', end: '17:00' },
      saturday: { start: '10:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  },
  {
    vendorId: 'vendor-selene-glow-studio',
    name: 'Selene Glow Studio',
    description: 'Where Radiance meets Ritual',
    email: 'contact@seleneglow.com',
    phone: '301-992-3224',
    smsAlertsEnabled: true,
    smsAlertPhone: devSmsPhone || '3019923224',
    isHouse: false,
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
];

const services = [
  // Winsome Woods (subletting space - pays house fee)
  { serviceId: 'svc-winsome-massage-30', vendorId: 'vendor-winsome-woods', category: 'Massage', name: 'Massage - 30 min', description: 'Targeted massage session', duration: 30, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-winsome-massage-60', vendorId: 'vendor-winsome-woods', category: 'Massage', name: 'Massage - 60 min', description: 'Relaxing full-body massage', duration: 60, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, isActive: true },
  { serviceId: 'svc-winsome-massage-90', vendorId: 'vendor-winsome-woods', category: 'Massage', name: 'Massage - 90 min', description: 'Extended full-body massage for deep relaxation', duration: 90, price: 125, houseFeeEnabled: true, houseFeeAmount: 30, isActive: true },
  { serviceId: 'svc-winsome-frisson-therapy', vendorId: 'vendor-winsome-woods', category: 'Wellness', name: 'Frisson Therapy - 30 min', description: 'Therapeutic frisson treatment', duration: 30, price: 40, houseFeeEnabled: true, houseFeeAmount: 10, isActive: true },
  { serviceId: 'svc-winsome-reiki', vendorId: 'vendor-winsome-woods', category: 'Wellness', name: 'Reiki', description: 'Energy healing session', duration: 30, price: 75, houseFeeEnabled: true, houseFeeAmount: 20, isActive: true },
  { serviceId: 'svc-winsome-sound-healing-30', vendorId: 'vendor-winsome-woods', category: 'Wellness', name: 'Sound Healing - 30 min', description: 'Therapeutic sound bath experience', duration: 30, price: 35, houseFeeEnabled: true, houseFeeAmount: 10, isActive: true },
  { serviceId: 'svc-winsome-sound-healing-60', vendorId: 'vendor-winsome-woods', category: 'Wellness', name: 'Sound Healing - 60 min', description: 'Extended sound bath for deep meditation', duration: 60, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, isActive: true },
  { serviceId: 'svc-winsome-redlight-therapy', vendorId: 'vendor-winsome-woods', category: 'Red Light', name: 'Red Light Therapy', description: 'Rejuvenating red light treatment', duration: 30, price: 25, houseFeeEnabled: true, houseFeeAmount: 8, isActive: true },
  { serviceId: 'svc-winsome-tarot-30', vendorId: 'vendor-winsome-woods', category: 'Tarot', name: 'Tarot Reading - 30 min', description: 'Insightful tarot card reading', duration: 30, price: 20, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  { serviceId: 'svc-winsome-tarot-60', vendorId: 'vendor-winsome-woods', category: 'Tarot', name: 'Tarot Reading - 60 min', description: 'In-depth tarot consultation', duration: 60, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-winsome-salt-soak', vendorId: 'vendor-winsome-woods', category: 'Wellness', name: 'Foot Salt Soak', description: 'Relaxing mineral salt foot bath', duration: 30, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  { serviceId: 'svc-winsome-salt-soak-detox', vendorId: 'vendor-winsome-woods', category: 'Wellness', name: 'Ionic Foot Detox', description: 'Detoxifying ionic foot bath', duration: 30, price: 20, houseFeeEnabled: true, houseFeeAmount: 6, isActive: true },
  
  // The Kera Studio (house - no house fees on their own services)
  { serviceId: 'svc-kera-head-bath-30',vendorId: 'vendor-kera-studio', category: 'Spa Room', name: '30-min Head Bath', description: 'Luxurious scalp treatment and massage', duration: 30, price: 75, houseFeeEnabled: false, isActive: true },
  { serviceId: 'svc-kera-head-bath',vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Head Bath', description: 'Luxurious scalp treatment and massage', duration: 60, price: 120, houseFeeEnabled: false, isActive: true },
  { serviceId: 'svc-kera-facial',vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Facial', description: 'Deep cleansing and rejuvenating facial', duration: 60, price: 65, isActive: true },
  { serviceId: 'svc-kera-mini-facial',vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Mini Facial', description: 'Quick refresh facial treatment', duration: 30, price: 30, isActive: true },
  { serviceId: 'svc-kera-beard-facial',vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Beard Facial', description: 'Specialized beard grooming and facial', duration: 60, price: 65, isActive: true },
  { serviceId: 'svc-kera-couple-head-bath',vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Couples Head Bath', description: 'Relaxing head spa experience for two', duration: 120, price: 230, isActive: true },
  { serviceId: 'svc-kera-trim',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Trim', description: 'Quick hair trim and touch-up', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-kera-up-do',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Up-Do', description: 'Elegant updo styling for special occasions', duration: 60, price: 55, isActive: true },
  { serviceId: 'svc-kera-kids-cut',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Kids Cut', description: 'Haircut for children 12 and under', duration: 30, price: 15, isActive: true },
  { serviceId: 'svc-kera-shampoo-style',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Shampoo & Style', description: 'Professional wash and styling', duration: 45, price: 35, isActive: true },
  { serviceId: 'svc-kera-highlights',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Highlights', description: 'Dimensional color highlights', duration: 90, price: 120, isActive: true },
  { serviceId: 'svc-kera-color-treatment',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Color Treatment', description: 'Full color application and treatment', duration: 60, price: 95, isActive: true },
  { serviceId: 'svc-kera-womens-haircut',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Womens Haircut', description: 'Precision cut and style', duration: 30, price: 38, isActive: true },
  { serviceId: 'svc-kera-mens-haircut',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Mens Haircut', description: 'Classic or modern mens cut', duration: 30, price: 25, isActive: true },
  { serviceId: 'svc-kera-partial-vivid-color',vendorId: 'vendor-kera-studio', category: 'Hair Studio', name: 'Partial Vivid Color', description: 'Bold fashion color application', duration: 60, price: 145, isActive: true },
  { serviceId: 'svc-kera-manicure',vendorId: 'vendor-kera-studio', category: 'Nail Care', name: 'Manicure', description: 'Complete nail care and polish', duration: 30, price: 35, isActive: true },
  { serviceId: 'svc-kera-pedicure',vendorId: 'vendor-kera-studio', category: 'Nail Care', name: 'Pedicure', description: 'Relaxing foot and nail treatment', duration: 45, price: 45, isActive: true },
  { serviceId: 'svc-kera-foot-soak',vendorId: 'vendor-kera-studio', category: 'Nail Care', name: 'Foot Soak', description: 'Soothing foot bath and massage', duration: 30, price: 18, isActive: true },
  { serviceId: 'svc-kera-wedding',vendorId: 'vendor-kera-studio', category: 'Wedding', name: 'Wedding Trial', description: 'Complimentary bridal hair and makeup trial', duration: 60, price: 0, isActive: true },
  { serviceId: 'svc-kera-sauna-25',vendorId: 'vendor-kera-studio', category: 'Sauna', resourceType: 'sauna', name: 'Sauna - 25 min', description: 'Infrared sauna session for detox and relaxation', duration: 25, price: 10, isActive: true },
  { serviceId: 'svc-kera-sauna-45',vendorId: 'vendor-kera-studio', category: 'Sauna', resourceType: 'sauna', name: 'Sauna - 45 min', description: 'Extended infrared sauna session', duration: 45, price: 18, isActive: true },
  { serviceId: 'svc-kera-wax-brows',vendorId: 'vendor-kera-studio', category: 'Waxing', name: 'Brow Wax', description: 'Eyebrow shaping and waxing', duration: 15, price: 15, isActive: true },
  { serviceId: 'svc-kera-wax-lip-chin',vendorId: 'vendor-kera-studio', category: 'Waxing', name: 'Lip/Chin Wax', description: 'Lip and chin hair removal', duration: 15, price: 15, isActive: true },

  // Selene Glow Studio (subletting space - pays house fee)
  // Nail Rituals
  { serviceId: 'svc-selene-classic-manicure',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Classic Manicure', description: 'Classic manicure', duration: 30, price: 25, houseFeeEnabled: true, houseFeeAmount: 8, isActive: true },
  { serviceId: 'svc-selene-gel-manicure',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Gel Manicure', description: 'Long-lasting gel polish manicure', duration: 30, price: 30, houseFeeEnabled: true, houseFeeAmount: 10, isActive: true },
  { serviceId: 'svc-selene-deluxe-manicure',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Deluxe Manicure', description: 'Premium manicure with hand treatment', duration: 30, price: 40, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-selene-classic-pedicure',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Classic Pedicure', description: 'Classic pedicure', duration: 45, price: 40, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-selene-gel-pedicure',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Gel Pedicure', description: 'Long-lasting gel polish pedicure', duration: 45, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, isActive: true },
  { serviceId: 'svc-selene-deluxe-pedicure',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Deluxe Pedicure', description: 'Premium pedicure with foot treatment', duration: 60, price: 75, houseFeeEnabled: true, houseFeeAmount: 20, isActive: true },
  { serviceId: 'svc-selene-polish-hand',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Polish Charge - Hand', description: 'Polish change for hands', duration: 15, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  { serviceId: 'svc-selene-polish-feet',vendorId: 'vendor-selene-glow-studio', category: 'Nail Rituals', name: 'Polish Charge - Feet', description: 'Polish change for feet', duration: 15, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  
  // Hair Rituals
  { serviceId: 'svc-selene-womens-haircut',vendorId: 'vendor-selene-glow-studio', category: 'Hair Rituals', name: 'Women\'s Haircut', description: 'Includes wash, cut, styling', duration: 60, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-selene-mens-haircut',vendorId: 'vendor-selene-glow-studio', category: 'Hair Rituals', name: 'Men\'s Haircut', description: 'Includes wash, cut, styling', duration: 45, price: 25, houseFeeEnabled: true, houseFeeAmount: 8, isActive: true },
  { serviceId: 'svc-selene-shampoo-conditioning',vendorId: 'vendor-selene-glow-studio', category: 'Hair Rituals', name: 'Shampoo & Conditioning', description: 'Professional wash and conditioning', duration: 30, price: 25, houseFeeEnabled: true, houseFeeAmount: 8, isActive: true },
  { serviceId: 'svc-selene-blowout',vendorId: 'vendor-selene-glow-studio', category: 'Hair Rituals', name: 'Blowout', description: 'Professional blowout styling', duration: 45, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  
  // Hair Ritual Add-ons
  { serviceId: 'svc-selene-hot-oil-treatment',vendorId: 'vendor-selene-glow-studio', category: 'Hair Ritual Add-ons', name: 'Hot Oil Treatment', description: 'Nourishing hot oil treatment', duration: 20, price: 25, houseFeeEnabled: true, houseFeeAmount: 8, isActive: true },
  { serviceId: 'svc-selene-deep-conditioning',vendorId: 'vendor-selene-glow-studio', category: 'Hair Ritual Add-ons', name: 'Deep Conditioning/Repair Mask', description: 'Intensive conditioning treatment', duration: 20, price: 20, houseFeeEnabled: true, houseFeeAmount: 6, isActive: true },
  { serviceId: 'svc-selene-flat-iron',vendorId: 'vendor-selene-glow-studio', category: 'Hair Ritual Add-ons', name: 'Flat Iron/Silk Press Finish', description: 'Smooth flat iron styling', duration: 30, price: 20, houseFeeEnabled: true, houseFeeAmount: 6, isActive: true },
  { serviceId: 'svc-selene-curling-iron',vendorId: 'vendor-selene-glow-studio', category: 'Hair Ritual Add-ons', name: 'Curling Iron/Wave Styling', description: 'Curling and wave styling', duration: 20, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  
  // Facial Rituals
  { serviceId: 'svc-selene-express-glow-facial',vendorId: 'vendor-selene-glow-studio', category: 'Facial Rituals', name: 'Express Glow Facial', description: 'Quick refreshing facial', duration: 30, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-selene-signature-glow-facial',vendorId: 'vendor-selene-glow-studio', category: 'Facial Rituals', name: 'Signature Glow Facial', description: 'Signature facial treatment', duration: 60, price: 85, houseFeeEnabled: true, houseFeeAmount: 25, isActive: true },
  { serviceId: 'svc-selene-korean-glass-skin-facial',vendorId: 'vendor-selene-glow-studio', category: 'Facial Rituals', name: 'Korean Glass Skin Facial', description: 'Korean glass skin facial treatment', duration: 75, price: 110, houseFeeEnabled: true, houseFeeAmount: 30, isActive: true },
  { serviceId: 'svc-selene-black-glow-facial',vendorId: 'vendor-selene-glow-studio', category: 'Facial Rituals', name: 'Black Glow Facial', description: 'Specialized glow facial', duration: 60, price: 65, houseFeeEnabled: true, houseFeeAmount: 20, isActive: true },
  
  // Facial Ritual Add-ons
  { serviceId: 'svc-selene-deluxe-ritual-addon',vendorId: 'vendor-selene-glow-studio', category: 'Facial Ritual Add-ons', name: 'Deluxe Ritual Facial Add-on', description: 'Enhanced facial ritual', duration: 20, price: 40, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-selene-eye-treatment',vendorId: 'vendor-selene-glow-studio', category: 'Facial Ritual Add-ons', name: 'Eye Treatment', description: 'Rejuvenating eye treatment', duration: 15, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  { serviceId: 'svc-selene-lip-treatment',vendorId: 'vendor-selene-glow-studio', category: 'Facial Ritual Add-ons', name: 'Lip Treatment', description: 'Nourishing lip treatment', duration: 10, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  
  // Waxing Rituals
  { serviceId: 'svc-selene-eyebrow-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Eyebrow Wax', description: 'Eyebrow shaping and waxing', duration: 15, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  { serviceId: 'svc-selene-lip-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Lip Wax', description: 'Upper lip hair removal', duration: 10, price: 10, houseFeeEnabled: true, houseFeeAmount: 3, isActive: true },
  { serviceId: 'svc-selene-chin-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Chin Wax', description: 'Chin hair removal', duration: 15, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, isActive: true },
  { serviceId: 'svc-selene-underarms-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Underarms', description: 'Underarm hair removal', duration: 20, price: 28, houseFeeEnabled: true, houseFeeAmount: 8, isActive: true },
  { serviceId: 'svc-selene-half-arms-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Half Arms', description: 'Half arm hair removal', duration: 25, price: 35, houseFeeEnabled: true, houseFeeAmount: 10, isActive: true },
  { serviceId: 'svc-selene-full-arms-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Full Arms', description: 'Full arm hair removal', duration: 35, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, isActive: true },
  { serviceId: 'svc-selene-half-legs-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Half Legs', description: 'Half leg hair removal', duration: 30, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, isActive: true },
  { serviceId: 'svc-selene-full-legs-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Full Legs', description: 'Full leg hair removal', duration: 45, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, isActive: true },
  { serviceId: 'svc-selene-back-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Back', description: 'Full back hair removal', duration: 40, price: 60, houseFeeEnabled: true, houseFeeAmount: 18, isActive: true },
  { serviceId: 'svc-selene-chest-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Chest', description: 'Chest hair removal', duration: 40, price: 60, houseFeeEnabled: true, houseFeeAmount: 18, isActive: true },
  { serviceId: 'svc-selene-stomach-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Stomach/Abdomen', description: 'Stomach and abdomen hair removal', duration: 25, price: 35, houseFeeEnabled: true, houseFeeAmount: 10, isActive: true },
  { serviceId: 'svc-selene-brazilian-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Brazilian', description: 'Complete bikini area hair removal', duration: 45, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, isActive: true },
  { serviceId: 'svc-selene-bikini-wax',vendorId: 'vendor-selene-glow-studio', category: 'Waxing Rituals', name: 'Bikini', description: 'Bikini line hair removal', duration: 30, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, isActive: true },
  
  // Signature Rituals
  { serviceId: 'svc-selene-she-king-ritual',vendorId: 'vendor-selene-glow-studio', category: 'Signature Rituals', name: 'The She-King Herbal Ritual', description: 'Luxurious herbal ritual experience', duration: 90, price: 125, houseFeeEnabled: true, houseFeeAmount: 35, isActive: true },
  { serviceId: 'svc-selene-lunar-luxe-ritual',vendorId: 'vendor-selene-glow-studio', category: 'Signature Rituals', name: 'Lunar Luxe Mani-Pedi Ritual', description: 'Complete mani-pedi ritual', duration: 90, price: 110, houseFeeEnabled: true, houseFeeAmount: 30, isActive: true },
  { serviceId: 'svc-selene-glow-polish-ritual',vendorId: 'vendor-selene-glow-studio', category: 'Signature Rituals', name: 'Glow & Polish Ritual', description: 'Signature glow and polish experience', duration: 75, price: 95, houseFeeEnabled: true, houseFeeAmount: 28, isActive: true },
  { serviceId: 'svc-selene-glass-skin-ritual',vendorId: 'vendor-selene-glow-studio', category: 'Signature Rituals', name: 'Glass Skin Ritual Package', description: 'Korean glass skin facial and Japanese head spa', duration: 135, price: 195, houseFeeEnabled: true, houseFeeAmount: 55, isActive: true },
];

const bundles = [
  {
    bundleId: 'bundle-reset-package',
    name: 'Reset Package',
    description: '60-minute massage and 60-minute head spa',
    serviceIds: ['svc-winsome-massage-60', 'svc-kera-head-bath'],
    price: 180.00,
    discountPercent: 0,
    isActive: true
  }
];

async function seedData() {
  console.log('Seeding vendors...');
  
  for (const vendor of vendors) {
    const vendorData = {
      ...vendor,
      workingHours: JSON.stringify(vendor.workingHours)
    };
    try {
      const { data, errors } = await client.models.Vendor.update(vendorData);
      if (errors) {
        const { data: created } = await client.models.Vendor.create(vendorData);
        console.log(`✓ Created vendor: ${vendor.name}`);
      } else {
        console.log(`✓ Updated vendor: ${vendor.name}`);
      }
    } catch (error) {
      const { data: created } = await client.models.Vendor.create(vendorData);
      console.log(`✓ Created vendor: ${vendor.name}`);
    }
  }

  console.log('\nSeeding services...');
  
  for (const service of services) {
    try {
      const { data, errors } = await client.models.Service.update(service);
      if (errors) {
        const { data: created } = await client.models.Service.create(service);
        console.log(`✓ Created service: ${service.name}`);
      } else {
        console.log(`✓ Updated service: ${service.name}`);
      }
    } catch (error) {
      const { data: created } = await client.models.Service.create(service);
      console.log(`✓ Created service: ${service.name}`);
    }
  }

  console.log('\nSeeding bundles...');
  
  for (const bundle of bundles) {
    try {
      const { data, errors } = await client.models.Bundle.update(bundle);
      if (errors) {
        const { data: created } = await client.models.Bundle.create(bundle);
        console.log(`✓ Created bundle: ${bundle.name}`);
      } else {
        console.log(`✓ Updated bundle: ${bundle.name}`);
      }
    } catch (error) {
      const { data: created } = await client.models.Bundle.create(bundle);
      console.log(`✓ Created bundle: ${bundle.name}`);
    }
  }

  console.log('\n✅ All data seeded successfully!');
}

seedData().catch(console.error);
