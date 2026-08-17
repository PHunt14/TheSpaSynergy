/**
 * Full Dev Seed Script — Reference Data + Test Appointments
 *
 * Seeds a dev/sandbox environment with production-like reference data
 * PLUS realistic test appointments, clients, blocked time, extras, and
 * site settings. Designed for testing the prevent-double-booking feature.
 *
 * Usage: node scripts/seed-dev-full.js
 * Requires: amplify_outputs.json to point at your dev/sandbox backend
 *
 * Optional env vars:
 *   DEV_SMS_PHONE — override all vendor SMS to your test number
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

const devSmsPhone = process.env.DEV_SMS_PHONE || '';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Get a date string N days from today (YYYY-MM-DD) */
function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

/** Get today's date as YYYY-MM-DD */
function today() {
  return new Date().toISOString().split('T')[0];
}

/** Generate a simple UUID-like ID */
function genId(prefix = '') {
  const rand = Math.random().toString(36).substring(2, 10);
  const ts = Date.now().toString(36).substring(-4);
  return prefix ? `${prefix}-${rand}${ts}` : `${rand}${ts}`;
}

async function upsert(model, data, label) {
  try {
    const { errors } = await model.update(data);
    if (errors) {
      await model.create(data);
      console.log(`  ✓ Created: ${label}`);
    } else {
      console.log(`  ✓ Updated: ${label}`);
    }
  } catch {
    await model.create(data);
    console.log(`  ✓ Created: ${label}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════

const providers = [
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
      monday: { start: '06:30', end: '17:00' },
      tuesday: { start: '06:30', end: '18:00' },
      wednesday: { start: null, end: null },
      thursday: { start: '06:30', end: '18:00' },
      friday: { start: '06:30', end: '17:00' },
      saturday: { start: '10:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    saunaHours: {
      monday: { start: '06:30', end: '18:00' },
      tuesday: { start: '06:30', end: '18:00' },
      wednesday: { start: '06:30', end: '18:00' },
      thursday: { start: '06:30', end: '18:00' },
      friday: { start: '06:30', end: '18:00' },
      saturday: { start: '10:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    spaRoomHours: {
      monday: { start: '09:00', end: '17:00' },
      tuesday: { start: '09:00', end: '18:00' },
      wednesday: { start: null, end: null },
      thursday: { start: '09:00', end: '18:00' },
      friday: { start: '09:00', end: '17:00' },
      saturday: { start: '10:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  },
  {
    vendorId: 'vendor-winsome-woods',
    name: 'Winsome Woods',
    description: 'Natural remedies for stress relief',
    email: 'winsomegnomes@gmail.com',
    phone: '301-992-3224',
    smsAlertsEnabled: true,
    smsAlertPhone: devSmsPhone || '3019923224',
    isHouse: false,
    isActive: true,
    workingHours: {
      monday: { start: '10:30', end: '16:00' },
      tuesday: { start: '10:30', end: '16:00' },
      wednesday: { start: '10:30', end: '16:00' },
      thursday: { start: '10:30', end: '16:00' },
      friday: { start: '10:30', end: '16:00' },
      saturday: { start: '10:30', end: '16:00' },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  },
  {
    vendorId: 'vendor-selene-glow-studio',
    name: 'Selene Glow Studio',
    description: 'Where Radiance meets Ritual',
    email: 'contact@seleneglow.com',
    phone: '240-919-6294',
    smsAlertsEnabled: true,
    smsAlertPhone: devSmsPhone || '2409196294',
    isHouse: false,
    isActive: true,
    workingHours: {
      monday: { start: null, end: null },
      tuesday: { start: '10:00', end: '17:00' },
      wednesday: { start: null, end: null },
      thursday: { start: null, end: null },
      friday: { start: '12:00', end: '18:00' },
      saturday: { start: null, end: null },
      sunday: { start: null, end: null }
    },
    bufferMinutes: 15
  },
];

// ═══════════════════════════════════════════════════════════════
// SERVICE CATEGORIES
// ═══════════════════════════════════════════════════════════════

const categories = [
  { categoryId: 'cat-hair', name: 'Hair Studio' },
  { categoryId: 'cat-spa-room', name: 'Spa Room' },
  { categoryId: 'cat-massage', name: 'Massage' },
  { categoryId: 'cat-wellness', name: 'Wellness' },
  { categoryId: 'cat-sauna', name: 'Sauna' },
  { categoryId: 'cat-nails', name: 'Nail Care' },
  { categoryId: 'cat-waxing', name: 'Waxing' },
  { categoryId: 'cat-facials', name: 'Facials' },
  { categoryId: 'cat-wedding', name: 'Wedding' },
  { categoryId: 'cat-signature', name: 'Signature Rituals' },
  { categoryId: 'cat-red-light', name: 'Red Light' },
  { categoryId: 'cat-tarot', name: 'Tarot' },
];

// ═══════════════════════════════════════════════════════════════
// STAFF SCHEDULES
// ═══════════════════════════════════════════════════════════════

const staff = [
  {
    visibleId: 'resource-sauna',
    staffEmail: 'sauna@thespasynergy.com',
    staffName: 'Sauna',
    vendorId: 'vendor-kera-studio',
    schedule: {
      monday: { start: '06:30', end: '18:00' },
      tuesday: { start: '06:30', end: '18:00' },
      wednesday: { start: '06:30', end: '18:00' },
      thursday: { start: '06:30', end: '18:00' },
      friday: { start: '06:30', end: '18:00' },
      saturday: { start: '10:00', end: '14:00' },
      sunday: { start: null, end: null }
    },
    isActive: true,
    squareOAuthStatus: 'disconnected',
  },
  {
    visibleId: 'staff-kera-stacey',
    staffEmail: 'thekerastudio@gmail.com',
    staffName: 'Stacey',
    vendorId: 'vendor-kera-studio',
    schedule: {
      monday: { start: null, end: null },
      tuesday: { start: '11:00', end: '18:00' },
      wednesday: { start: null, end: null },
      thursday: { start: '11:00', end: '18:00' },
      friday: { start: null, end: null },
      saturday: { start: '10:00', end: '14:00', recurrence: 'every-other' },
      sunday: { start: null, end: null }
    },
    isActive: true,
    squareOAuthStatus: 'connected',
  },
  {
    visibleId: 'staff-kera-trinity',
    staffEmail: 'trinity@kerastudio.com',
    staffName: 'Trinity',
    vendorId: 'vendor-kera-studio',
    schedule: {
      monday: { start: '12:00', end: '17:00' },
      tuesday: { start: null, end: null },
      wednesday: { start: null, end: null },
      thursday: { start: null, end: null },
      friday: { start: '12:00', end: '17:00' },
      saturday: { start: null, end: null },
      sunday: { start: null, end: null }
    },
    autoAssignRules: [
      { days: ['monday', 'friday'], action: 'auto-assign', vendorId: 'vendor-kera-studio' }
    ],
    isActive: true,
    squareOAuthStatus: 'disconnected',
  },
  {
    visibleId: 'staff-selene-jylian',
    staffEmail: 'jylian@seleneglow.com',
    staffName: 'Jylian',
    vendorId: 'vendor-selene-glow-studio',
    schedule: {
      monday: { start: null, end: null },
      tuesday: { start: '10:00', end: '17:00' },
      wednesday: { start: null, end: null },
      thursday: { start: null, end: null },
      friday: { start: '12:00', end: '18:00' },
      saturday: { start: null, end: null, recurrence: '2nd-of-month', recurrenceStart: '10:00', recurrenceEnd: '14:00' },
      sunday: { start: null, end: null }
    },
    isActive: true,
    squareOAuthStatus: 'connected',
  },
  {
    visibleId: 'staff-winsome-makaila',
    staffEmail: 'makaila@winsomewoods.com',
    staffName: 'Makaila',
    vendorId: 'vendor-winsome-woods',
    schedule: {
      monday: { start: '10:30', end: '16:00' },
      tuesday: { start: '10:30', end: '16:00' },
      wednesday: { start: '10:30', end: '16:00' },
      thursday: { start: '10:30', end: '16:00' },
      friday: { start: '10:30', end: '16:00' },
      saturday: { start: '10:30', end: '16:00' },
      sunday: { start: null, end: null }
    },
    isActive: true,
    squareOAuthStatus: 'connected',
  },
];

// ═══════════════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════════════

const services = [
  // Massage
  { serviceId: 'svc-massage-30', name: 'Massage - 30 min', description: 'Targeted massage session', categories: ['Massage'], duration: 30, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-massage-60', name: 'Massage - 60 min', description: 'Relaxing full-body massage', categories: ['Massage'], duration: 60, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-massage-90', name: 'Massage - 90 min', description: 'Extended full-body massage for deep relaxation', categories: ['Massage'], duration: 90, price: 125, houseFeeEnabled: true, houseFeeAmount: 30, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  // Wellness
  { serviceId: 'svc-frisson-therapy', name: 'Frisson Therapy - 30 min', categories: ['Wellness'], duration: 30, price: 40, houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-reiki', name: 'Reiki', categories: ['Wellness'], duration: 30, price: 75, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-sound-healing-30', name: 'Sound Healing - 30 min', categories: ['Wellness'], duration: 30, price: 35, houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-sound-healing-60', name: 'Sound Healing - 60 min', categories: ['Wellness'], duration: 60, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-salt-soak', name: 'Himalayan Salt Foot Soak', categories: ['Wellness'], duration: 30, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-ionic-detox', name: 'Ionic Foot Detox', categories: ['Wellness'], duration: 30, price: 20, houseFeeEnabled: true, houseFeeAmount: 6, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-red-light', name: 'Red Light Therapy', categories: ['Red Light', 'Wellness'], duration: 30, price: 25, houseFeeEnabled: true, houseFeeAmount: 8, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-tarot-30', name: 'Tarot Reading - 30 min', categories: ['Tarot'], duration: 30, price: 20, houseFeeEnabled: true, houseFeeAmount: 5, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-tarot-60', name: 'Tarot Reading - 60 min', categories: ['Tarot'], duration: 60, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  // Spa Room
  { serviceId: 'svc-head-bath-30', name: '30-min Head Bath', categories: ['Spa Room'], resourceType: 'room', duration: 30, price: 75, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: null, isActive: true },
  { serviceId: 'svc-head-bath-60', name: 'Head Bath', categories: ['Spa Room'], resourceType: 'room', duration: 60, price: 120, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: null, isActive: true },
  { serviceId: 'svc-facial-full', name: 'Facial', categories: ['Spa Room', 'Facials'], resourceType: 'room', duration: 60, price: 65, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-mini-facial', name: 'Mini Facial', categories: ['Spa Room', 'Facials'], resourceType: 'room', duration: 30, price: 30, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-beard-facial', name: 'Beard Facial', categories: ['Spa Room'], resourceType: 'room', duration: 60, price: 65, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  { serviceId: 'svc-couples-head-bath', name: 'Couples Head Bath', categories: ['Spa Room'], resourceType: 'room', duration: 120, price: 230, houseFeeEnabled: false, requiresConsultation: true, providersRequired: 2, allowedStaff: null, isActive: true },
  // Head Bath Add-ons
  { serviceId: 'svc-addon-mini-facial', name: 'Mini Facial (Add-on)', categories: ['Spa Room'], resourceType: 'room', duration: 15, price: 35, houseFeeEnabled: false, allowedStaff: null, isActive: true, parentServiceIds: ['svc-head-bath-60', 'svc-head-bath-30'] },
  { serviceId: 'svc-addon-steam', name: 'Steam Conditioning (Add-on)', categories: ['Spa Room'], resourceType: 'room', duration: 10, price: 18, houseFeeEnabled: false, allowedStaff: null, isActive: true, parentServiceIds: ['svc-head-bath-60', 'svc-head-bath-30'] },
  { serviceId: 'svc-addon-heat-style', name: 'Heat Style (Add-on)', categories: ['Spa Room'], resourceType: 'room', duration: 15, price: 15, houseFeeEnabled: false, allowedStaff: null, isActive: true, parentServiceIds: ['svc-head-bath-60', 'svc-head-bath-30'] },
  // Hair Studio
  { serviceId: 'svc-trim', name: 'Trim', categories: ['Hair Studio'], duration: 30, price: 15, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-up-do', name: 'Up-Do', categories: ['Hair Studio', 'Wedding'], duration: 60, price: 55, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-kids-cut', name: 'Kids Cut', categories: ['Hair Studio'], duration: 30, price: 15, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-shampoo-style', name: 'Shampoo & Style', categories: ['Hair Studio'], duration: 45, price: 35, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-highlights', name: 'Highlights', categories: ['Hair Studio'], duration: 90, price: 120, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  { serviceId: 'svc-color-treatment', name: 'Color Treatment', categories: ['Hair Studio'], duration: 60, price: 95, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  { serviceId: 'svc-womens-haircut', name: "Women's Haircut", categories: ['Hair Studio'], duration: 30, price: 38, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-mens-haircut', name: "Men's Haircut", categories: ['Hair Studio'], duration: 30, price: 25, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-vivid-color', name: 'Partial Vivid Color', categories: ['Hair Studio'], duration: 60, price: 145, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  // Nail Care
  { serviceId: 'svc-manicure', name: 'Classic Manicure', categories: ['Nail Care'], duration: 30, price: 25, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-gel-manicure', name: 'Gel Manicure', categories: ['Nail Care'], duration: 30, price: 30, houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-deluxe-manicure', name: 'Deluxe Manicure', categories: ['Nail Care'], duration: 30, price: 40, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-classic-pedicure', name: 'Classic Pedicure', categories: ['Nail Care'], duration: 45, price: 40, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-gel-pedicure', name: 'Gel Pedicure', categories: ['Nail Care'], duration: 45, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-deluxe-pedicure', name: 'Deluxe Pedicure', categories: ['Nail Care'], duration: 60, price: 75, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-foot-soak', name: 'Foot Soak', categories: ['Nail Care'], duration: 30, price: 18, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  // Waxing
  { serviceId: 'svc-brow-wax', name: 'Brow Wax', categories: ['Waxing'], duration: 15, price: 15, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-lip-wax', name: 'Lip Wax', categories: ['Waxing'], duration: 10, price: 10, houseFeeEnabled: true, houseFeeAmount: 3, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-chin-wax', name: 'Chin Wax', categories: ['Waxing'], duration: 15, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-brazilian', name: 'Brazilian', categories: ['Waxing'], duration: 45, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-bikini', name: 'Bikini', categories: ['Waxing'], duration: 30, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-full-legs', name: 'Full Legs', categories: ['Waxing'], duration: 45, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-underarms', name: 'Underarms', categories: ['Waxing'], duration: 20, price: 28, houseFeeEnabled: true, houseFeeAmount: 8, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  // Facials
  { serviceId: 'svc-express-glow-facial', name: 'Express Glow Facial', categories: ['Facials'], duration: 30, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-signature-glow-facial', name: 'Signature Glow Facial', categories: ['Facials'], duration: 60, price: 85, houseFeeEnabled: true, houseFeeAmount: 25, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-glass-skin-facial', name: 'Korean Glass Skin Facial', categories: ['Facials'], duration: 75, price: 110, houseFeeEnabled: true, houseFeeAmount: 30, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-black-glow-facial', name: 'Black Glow Facial', categories: ['Facials'], duration: 60, price: 65, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  // Signature Rituals
  { serviceId: 'svc-she-king-ritual', name: 'The She-King Herbal Ritual', categories: ['Signature Rituals'], duration: 90, price: 125, houseFeeEnabled: true, houseFeeAmount: 35, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-lunar-luxe', name: 'Lunar Luxe Mani-Pedi Ritual', categories: ['Signature Rituals', 'Nail Care'], duration: 90, price: 110, houseFeeEnabled: true, houseFeeAmount: 30, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-glow-polish', name: 'Glow & Polish Ritual', categories: ['Signature Rituals', 'Nail Care'], duration: 75, price: 95, houseFeeEnabled: true, houseFeeAmount: 28, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-glass-skin-ritual', name: 'Glass Skin Ritual Package', categories: ['Signature Rituals', 'Spa Room'], duration: 135, price: 195, houseFeeEnabled: true, houseFeeAmount: 55, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  // Sauna
  { serviceId: 'svc-sauna-25', name: 'Sauna - 25 min', categories: ['Sauna'], resourceType: 'sauna', duration: 25, price: 10, houseFeeEnabled: false, allowedStaff: ['resource-sauna'], isActive: true },
  { serviceId: 'svc-sauna-45', name: 'Sauna - 45 min', categories: ['Sauna'], resourceType: 'sauna', duration: 45, price: 18, houseFeeEnabled: false, allowedStaff: ['resource-sauna'], isActive: true },
  // Wedding
  { serviceId: 'svc-wedding-trial', name: 'Wedding Trial', categories: ['Wedding', 'Hair Studio'], duration: 60, price: 0, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
];

// ═══════════════════════════════════════════════════════════════
// BUNDLES
// ═══════════════════════════════════════════════════════════════

const bundles = [
  {
    bundleId: 'bundle-reset-package',
    name: 'Reset Package',
    description: '60-minute massage and 60-minute head spa — the ultimate reset',
    serviceIds: ['svc-massage-60', 'svc-head-bath-60'],
    vendorIds: ['vendor-winsome-woods', 'vendor-kera-studio'],
    price: 180.00,
    discountPercent: 5,
    isActive: true
  },
  {
    bundleId: 'bundle-glow-up',
    name: 'Glow Up Package',
    description: 'Glass skin facial + head bath + manicure',
    serviceIds: ['svc-glass-skin-facial', 'svc-head-bath-60', 'svc-manicure'],
    vendorIds: ['vendor-selene-glow-studio', 'vendor-kera-studio'],
    price: 240.00,
    discountPercent: 10,
    isActive: true
  },
];

// ═══════════════════════════════════════════════════════════════
// BUNDLE SETTINGS
// ═══════════════════════════════════════════════════════════════

const bundleSettings = {
  settingsId: 'default',
  discount1Service: 0,
  discount2Services: 5,
  discount3Services: 10,
  discount4PlusServices: 15,
};

// ═══════════════════════════════════════════════════════════════
// EXTRAS (bundle add-ons)
// ═══════════════════════════════════════════════════════════════

const extras = [
  {
    extraId: 'extra-champagne',
    name: 'Champagne Toast',
    description: 'A glass of champagne for your visit',
    price: 15.00,
    perPerson: true,
    groupOnly: false,
    isActive: true,
    assignedBundleIds: ['bundle-reset-package', 'bundle-glow-up'],
  },
  {
    extraId: 'extra-aromatherapy',
    name: 'Aromatherapy Upgrade',
    description: 'Essential oil aromatherapy enhancement',
    price: 10.00,
    perPerson: false,
    groupOnly: false,
    isActive: true,
    assignedBundleIds: ['bundle-reset-package'],
  },
  {
    extraId: 'extra-rose-petals',
    name: 'Rose Petal Bath Add-On',
    description: 'Luxurious rose petal addition to head bath',
    price: 20.00,
    perPerson: false,
    groupOnly: true,
    isActive: true,
    assignedBundleIds: ['bundle-glow-up'],
  },
];

// ═══════════════════════════════════════════════════════════════
// SITE SETTINGS
// ═══════════════════════════════════════════════════════════════

const siteSettings = [
  { settingKey: 'business_name', settingValue: 'The Spa Synergy' },
  { settingKey: 'business_phone', settingValue: '240-329-6537' },
  { settingKey: 'business_email', settingValue: 'thekerastudio@gmail.com' },
  { settingKey: 'booking_enabled', settingValue: 'true' },
  { settingKey: 'booking_advance_days', settingValue: '60' },
  { settingKey: 'cancellation_policy_hours', settingValue: '24' },
  { settingKey: 'timezone', settingValue: 'America/New_York' },
];

// ═══════════════════════════════════════════════════════════════
// TEST CLIENTS
// ═══════════════════════════════════════════════════════════════

const clients = [
  { clientId: 'client-jane-doe', name: 'Jane Doe', phone: '2405551001', email: 'jane.doe@example.com' },
  { clientId: 'client-maria-garcia', name: 'Maria Garcia', phone: '3015551002', email: 'maria.garcia@example.com' },
  { clientId: 'client-alex-johnson', name: 'Alex Johnson', phone: '2025551003', email: 'alex.j@example.com' },
  { clientId: 'client-sarah-williams', name: 'Sarah Williams', phone: '4435551004', email: 'sarah.w@example.com' },
  { clientId: 'client-david-brown', name: 'David Brown', phone: '2405551005', email: 'david.b@example.com' },
  { clientId: 'client-emily-chen', name: 'Emily Chen', phone: '3015551006', email: 'emily.chen@example.com' },
  { clientId: 'client-michael-taylor', name: 'Michael Taylor', phone: '2025551007', email: 'michael.t@example.com' },
  { clientId: 'client-ashley-martinez', name: 'Ashley Martinez', phone: '4435551008', email: 'ashley.m@example.com' },
];

// ═══════════════════════════════════════════════════════════════
// TEST APPOINTMENTS
// These create realistic booking scenarios for testing double-booking
// prevention. Uses dates relative to today so they're always "upcoming."
// ═══════════════════════════════════════════════════════════════

function buildAppointments() {
  const day1 = futureDate(1); // tomorrow
  const day2 = futureDate(2);
  const day3 = futureDate(3);
  const day4 = futureDate(4);
  const day5 = futureDate(5);
  const todayStr = today();

  return [
    // ──────────────────────────────────────────
    // DAY 1 (tomorrow) — Makaila: busy morning, gap in afternoon
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-001',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-massage-60',
      staffId: 'staff-winsome-makaila',
      dateTime: `${day1}T10:30`,
      customer: JSON.stringify({ name: 'Jane Doe', phone: '2405551001', email: 'jane.doe@example.com' }),
      status: 'confirmed',
      clientId: 'client-jane-doe',
    },
    {
      appointmentId: 'apt-test-002',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-reiki',
      staffId: 'staff-winsome-makaila',
      dateTime: `${day1}T11:45`, // starts after 60min + 15min buffer from 10:30
      customer: JSON.stringify({ name: 'Maria Garcia', phone: '3015551002', email: 'maria.garcia@example.com' }),
      status: 'confirmed',
      clientId: 'client-maria-garcia',
    },
    {
      appointmentId: 'apt-test-003',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-sound-healing-60',
      staffId: 'staff-winsome-makaila',
      dateTime: `${day1}T13:00`,
      customer: JSON.stringify({ name: 'Alex Johnson', phone: '2025551003', email: 'alex.j@example.com' }),
      status: 'confirmed',
      clientId: 'client-alex-johnson',
    },
    // Gap from 14:15 (13:00 + 60 + 15 buffer) to 16:00 — bookable!
    // Cancelled appointment (should NOT block)
    {
      appointmentId: 'apt-test-004',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-massage-30',
      staffId: 'staff-winsome-makaila',
      dateTime: `${day1}T14:30`,
      customer: JSON.stringify({ name: 'Sarah Williams', phone: '4435551004', email: 'sarah.w@example.com' }),
      status: 'cancelled',
      clientId: 'client-sarah-williams',
    },

    // ──────────────────────────────────────────
    // DAY 1 (tomorrow) — Stacey: has a haircut + blocked time
    // (Stacey works Tue/Thu — this tests against her schedule)
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-005',
      vendorId: 'vendor-kera-studio',
      serviceId: 'svc-womens-haircut',
      staffId: 'staff-kera-stacey',
      dateTime: `${day1}T11:00`,
      customer: JSON.stringify({ name: 'Emily Chen', phone: '3015551006', email: 'emily.chen@example.com' }),
      status: 'confirmed',
      clientId: 'client-emily-chen',
    },
    // Blocked time: Stacey lunch break — tests that customers can't book over blocks
    {
      appointmentId: 'apt-test-006',
      vendorId: 'vendor-kera-studio',
      serviceId: 'blocked',
      staffId: 'staff-kera-stacey',
      dateTime: `${day1}T12:00`,
      customer: JSON.stringify({ name: 'Lunch Break', duration: 60 }),
      status: 'confirmed',
      createdBy: 'staff-kera-stacey',
    },
    // Stacey available again at 13:15 (12:00 + 60 + 15 buffer)
    {
      appointmentId: 'apt-test-007',
      vendorId: 'vendor-kera-studio',
      serviceId: 'svc-highlights',
      staffId: 'staff-kera-stacey',
      dateTime: `${day1}T13:15`,
      customer: JSON.stringify({ name: 'Ashley Martinez', phone: '4435551008', email: 'ashley.m@example.com' }),
      status: 'confirmed',
      clientId: 'client-ashley-martinez',
    },

    // ──────────────────────────────────────────
    // DAY 2 — Jylian: facials and nails
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-008',
      vendorId: 'vendor-selene-glow-studio',
      serviceId: 'svc-glass-skin-facial',
      staffId: 'staff-selene-jylian',
      dateTime: `${day2}T10:00`,
      customer: JSON.stringify({ name: 'Jane Doe', phone: '2405551001', email: 'jane.doe@example.com' }),
      status: 'confirmed',
      clientId: 'client-jane-doe',
    },
    // 75min facial + 15min buffer = done at 11:30
    {
      appointmentId: 'apt-test-009',
      vendorId: 'vendor-selene-glow-studio',
      serviceId: 'svc-gel-manicure',
      staffId: 'staff-selene-jylian',
      dateTime: `${day2}T11:30`,
      customer: JSON.stringify({ name: 'David Brown', phone: '2405551005', email: 'david.b@example.com' }),
      status: 'confirmed',
      clientId: 'client-david-brown',
    },
    // Pending appointment (still counts for conflicts!)
    {
      appointmentId: 'apt-test-010',
      vendorId: 'vendor-selene-glow-studio',
      serviceId: 'svc-brazilian',
      staffId: 'staff-selene-jylian',
      dateTime: `${day2}T13:00`,
      customer: JSON.stringify({ name: 'Sarah Williams', phone: '4435551004', email: 'sarah.w@example.com' }),
      status: 'pending',
      clientId: 'client-sarah-williams',
    },

    // ──────────────────────────────────────────
    // DAY 3 — Makaila: back-to-back (edge case for buffer)
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-011',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-massage-90',
      staffId: 'staff-winsome-makaila',
      dateTime: `${day3}T10:30`,
      customer: JSON.stringify({ name: 'Michael Taylor', phone: '2025551007', email: 'michael.t@example.com' }),
      status: 'confirmed',
      clientId: 'client-michael-taylor',
    },
    // 90min + 15min buffer = ends at 12:15. Next appointment right at buffer boundary:
    {
      appointmentId: 'apt-test-012',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-tarot-30',
      staffId: 'staff-winsome-makaila',
      dateTime: `${day3}T12:15`, // exactly at buffer boundary — no conflict
      customer: JSON.stringify({ name: 'Emily Chen', phone: '3015551006', email: 'emily.chen@example.com' }),
      status: 'confirmed',
      clientId: 'client-emily-chen',
    },
    // Blocked time in afternoon
    {
      appointmentId: 'apt-test-013',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'blocked',
      staffId: 'staff-winsome-makaila',
      dateTime: `${day3}T14:00`,
      customer: JSON.stringify({ name: 'Personal Appointment', duration: 120 }),
      status: 'confirmed',
      createdBy: 'staff-winsome-makaila',
    },

    // ──────────────────────────────────────────
    // DAY 4 — Sauna resource bookings
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-014',
      vendorId: 'vendor-kera-studio',
      serviceId: 'svc-sauna-45',
      staffId: 'resource-sauna',
      dateTime: `${day4}T08:00`,
      customer: JSON.stringify({ name: 'Maria Garcia', phone: '3015551002', email: 'maria.garcia@example.com' }),
      status: 'confirmed',
      clientId: 'client-maria-garcia',
    },
    {
      appointmentId: 'apt-test-015',
      vendorId: 'vendor-kera-studio',
      serviceId: 'svc-sauna-25',
      staffId: 'resource-sauna',
      dateTime: `${day4}T09:00`, // 08:00 + 45 + 15 = 09:00 exactly at boundary
      customer: JSON.stringify({ name: 'Alex Johnson', phone: '2025551003', email: 'alex.j@example.com' }),
      status: 'confirmed',
      clientId: 'client-alex-johnson',
    },

    // ──────────────────────────────────────────
    // DAY 4 — Bundle booking (Reset Package: massage + head bath)
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-016',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-massage-60',
      staffId: 'staff-winsome-makaila',
      groupId: 'group-bundle-001',
      bundleId: 'bundle-reset-package',
      dateTime: `${day4}T10:30`,
      customer: JSON.stringify({ name: 'Ashley Martinez', phone: '4435551008', email: 'ashley.m@example.com' }),
      status: 'confirmed',
      clientId: 'client-ashley-martinez',
    },
    {
      appointmentId: 'apt-test-017',
      vendorId: 'vendor-kera-studio',
      serviceId: 'svc-head-bath-60',
      staffId: 'staff-kera-stacey',
      groupId: 'group-bundle-001',
      bundleId: 'bundle-reset-package',
      dateTime: `${day4}T11:45`, // after massage (60) + buffer (15) = 11:45
      customer: JSON.stringify({ name: 'Ashley Martinez', phone: '4435551008', email: 'ashley.m@example.com' }),
      status: 'confirmed',
      clientId: 'client-ashley-martinez',
    },

    // ──────────────────────────────────────────
    // DAY 5 — Trinity: open day with one booking (lots of availability)
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-018',
      vendorId: 'vendor-kera-studio',
      serviceId: 'svc-mens-haircut',
      staffId: 'staff-kera-trinity',
      dateTime: `${day5}T13:00`,
      customer: JSON.stringify({ name: 'David Brown', phone: '2405551005', email: 'david.b@example.com' }),
      status: 'confirmed',
      clientId: 'client-david-brown',
    },

    // ──────────────────────────────────────────
    // TODAY — Past appointment (for history) + manual entry
    // ──────────────────────────────────────────
    {
      appointmentId: 'apt-test-019',
      vendorId: 'vendor-winsome-woods',
      serviceId: 'svc-massage-60',
      staffId: 'staff-winsome-makaila',
      dateTime: `${todayStr}T10:30`,
      customer: JSON.stringify({ name: 'Jane Doe', phone: '2405551001', email: 'jane.doe@example.com' }),
      status: 'confirmed',
      clientId: 'client-jane-doe',
    },
    // Manual entry by staff (createdBy set)
    {
      appointmentId: 'apt-test-020',
      vendorId: 'vendor-kera-studio',
      serviceId: 'manual',
      staffId: 'staff-kera-stacey',
      dateTime: `${day2}T15:00`,
      customer: JSON.stringify({ name: 'Walk-in Client', phone: '0000000000', duration: 45 }),
      status: 'confirmed',
      createdBy: 'staff-kera-stacey',
    },
  ];
}

// ═══════════════════════════════════════════════════════════════
// CLIENT NOTES (for testing client detail pages)
// ═══════════════════════════════════════════════════════════════

const clientNotes = [
  {
    noteId: 'note-001',
    clientId: 'client-jane-doe',
    authorId: 'staff-winsome-makaila',
    authorName: 'Makaila',
    content: 'Prefers deep tissue on shoulders. Sensitive to lavender oil.',
  },
  {
    noteId: 'note-002',
    clientId: 'client-jane-doe',
    authorId: 'staff-kera-stacey',
    authorName: 'Stacey',
    content: 'Also interested in head bath — schedule for next visit.',
  },
  {
    noteId: 'note-003',
    clientId: 'client-maria-garcia',
    authorId: 'staff-winsome-makaila',
    authorName: 'Makaila',
    content: 'Regular weekly sauna client. Prefers morning slots.',
  },
  {
    noteId: 'note-004',
    clientId: 'client-ashley-martinez',
    authorId: 'staff-selene-jylian',
    authorName: 'Jylian',
    content: 'Sensitive skin — use hypoallergenic products only.',
  },
];

// ═══════════════════════════════════════════════════════════════
// SEED EXECUTION
// ═══════════════════════════════════════════════════════════════

async function seedAll() {
  console.log('🌱 Full dev seed — reference data + test appointments\n');
  console.log(`   Today: ${today()}`);
  console.log(`   Appointments span: ${today()} through ${futureDate(5)}\n`);

  // 1. Providers
  console.log('── Providers ──');
  for (const p of providers) {
    const data = {
      ...p,
      workingHours: JSON.stringify(p.workingHours),
      ...(p.saunaHours ? { saunaHours: JSON.stringify(p.saunaHours) } : {}),
      ...(p.spaRoomHours ? { spaRoomHours: JSON.stringify(p.spaRoomHours) } : {}),
    };
    await upsert(client.models.Vendor, data, p.name);
  }

  // 2. Service Categories
  console.log('\n── Service Categories ──');
  for (const cat of categories) {
    const data = { ...cat, createdAt: new Date().toISOString() };
    await upsert(client.models.ServiceCategory, data, cat.name);
  }

  // 3. Staff Schedules
  console.log('\n── Staff Schedules ──');
  for (const s of staff) {
    const data = {
      ...s,
      schedule: JSON.stringify(s.schedule),
      autoAssignRules: s.autoAssignRules ? JSON.stringify(s.autoAssignRules) : null,
    };
    await upsert(client.models.StaffSchedule, data, s.staffName);
  }

  // 4. Services
  console.log('\n── Services ──');
  for (const svc of services) {
    await upsert(client.models.Service, svc, svc.name);
  }

  // 5. Bundles
  console.log('\n── Bundles ──');
  for (const b of bundles) {
    await upsert(client.models.Bundle, b, b.name);
  }

  // 6. Bundle Settings
  console.log('\n── Bundle Settings ──');
  await upsert(client.models.BundleSettings, bundleSettings, 'default');

  // 7. Extras (may not be deployed to sandbox yet)
  console.log('\n── Extras ──');
  if (client.models.Extra) {
    for (const e of extras) {
      await upsert(client.models.Extra, e, e.name);
    }
  } else {
    console.log('  ⚠ Extra model not deployed to this sandbox — skipping');
  }

  // 8. Site Settings
  console.log('\n── Site Settings ──');
  for (const s of siteSettings) {
    await upsert(client.models.SiteSettings, s, s.settingKey);
  }

  // 9. Clients
  console.log('\n── Clients ──');
  for (const c of clients) {
    const data = { ...c, createdAt: new Date().toISOString() };
    await upsert(client.models.Client, data, c.name);
  }

  // 10. Appointments
  console.log('\n── Appointments ──');
  const appointments = buildAppointments();
  for (const apt of appointments) {
    const data = { ...apt, createdAt: new Date().toISOString() };
    await upsert(client.models.Appointment, data, `${apt.appointmentId} (${apt.staffId} @ ${apt.dateTime})`);
  }

  // 11. Client Notes
  console.log('\n── Client Notes ──');
  for (const n of clientNotes) {
    const data = { ...n, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await upsert(client.models.ClientNote, data, `${n.noteId} for ${n.clientId}`);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Full dev seed complete!');
  console.log('═'.repeat(60));
  console.log(`   ${providers.length} providers`);
  console.log(`   ${categories.length} categories`);
  console.log(`   ${staff.length} staff members`);
  console.log(`   ${services.length} services`);
  console.log(`   ${bundles.length} bundles`);
  console.log(`   ${extras.length} extras`);
  console.log(`   ${siteSettings.length} site settings`);
  console.log(`   ${clients.length} clients`);
  console.log(`   ${appointments.length} appointments`);
  console.log(`   ${clientNotes.length} client notes`);
  console.log('');
  console.log('📋 Test scenarios seeded:');
  console.log('   • Back-to-back appointments with exact buffer boundaries');
  console.log('   • Blocked time entries (lunch break, personal time)');
  console.log('   • Manual/walk-in entries with stored duration');
  console.log('   • Cancelled appointment (should NOT block new bookings)');
  console.log('   • Pending appointment (SHOULD block new bookings)');
  console.log('   • Bundle booking with groupId (multi-vendor)');
  console.log('   • Sauna resource calendar bookings');
  console.log('   • Multiple providers busy on same day');
  console.log('   • Open gaps where new bookings should succeed');
}

seedAll().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
