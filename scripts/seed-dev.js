/**
 * Dev Seed Script — Unified Business Model
 *
 * Seeds a dev/sandbox environment with production-like data using the
 * unified business model: multi-category services, allowedStaff arrays,
 * ServiceCategory records, and no vendorId on Service records.
 *
 * Usage: node scripts/seed-dev.js
 * Requires: amplify_outputs.json to point at your dev/sandbox backend
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

const devSmsPhone = process.env.DEV_SMS_PHONE || '';

// ═══════════════════════════════════════════════════════════════
// PROVIDERS (formerly vendors)
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
// SERVICES — Unified model (no vendorId, multi-category, allowedStaff)
// ═══════════════════════════════════════════════════════════════

const services = [
  // ─── Massage (Makaila only) ───
  { serviceId: 'svc-massage-30', name: 'Massage - 30 min', description: 'Targeted massage session', categories: ['Massage'], duration: 30, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-massage-60', name: 'Massage - 60 min', description: 'Relaxing full-body massage', categories: ['Massage'], duration: 60, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-massage-90', name: 'Massage - 90 min', description: 'Extended full-body massage for deep relaxation', categories: ['Massage'], duration: 90, price: 125, houseFeeEnabled: true, houseFeeAmount: 30, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },

  // ─── Wellness (Makaila only) ───
  { serviceId: 'svc-frisson-therapy', name: 'Frisson Therapy - 30 min', description: 'Therapeutic frisson treatment', categories: ['Wellness'], duration: 30, price: 40, houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-reiki', name: 'Reiki', description: 'Energy healing session', categories: ['Wellness'], duration: 30, price: 75, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-sound-healing-30', name: 'Sound Healing - 30 min', description: 'Therapeutic sound bath experience', categories: ['Wellness'], duration: 30, price: 35, houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-sound-healing-60', name: 'Sound Healing - 60 min', description: 'Extended sound bath for deep meditation', categories: ['Wellness'], duration: 60, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-salt-soak', name: 'Himalayan Salt Foot Soak', description: 'Relaxing Himalayan mineral salt foot bath', categories: ['Wellness'], duration: 30, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-ionic-detox', name: 'Ionic Foot Detox', description: 'Detoxifying ionic foot bath', categories: ['Wellness'], duration: 30, price: 20, houseFeeEnabled: true, houseFeeAmount: 6, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },

  // ─── Red Light & Tarot (Makaila) ───
  { serviceId: 'svc-red-light', name: 'Red Light Therapy', description: 'Rejuvenating red light treatment', categories: ['Red Light', 'Wellness'], duration: 30, price: 25, houseFeeEnabled: true, houseFeeAmount: 8, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-tarot-30', name: 'Tarot Reading - 30 min', description: 'Insightful tarot card reading', categories: ['Tarot'], duration: 30, price: 20, houseFeeEnabled: true, houseFeeAmount: 5, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },
  { serviceId: 'svc-tarot-60', name: 'Tarot Reading - 60 min', description: 'In-depth tarot consultation', categories: ['Tarot'], duration: 60, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-winsome-makaila'], isActive: true },

  // ─── Spa Room (shared across Stacey, Makaila, Jylian) ───
  { serviceId: 'svc-head-bath-30', name: '30-min Head Bath', description: 'Luxurious scalp treatment and massage', categories: ['Spa Room'], resourceType: 'room', duration: 30, price: 75, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: null, isActive: true },
  { serviceId: 'svc-head-bath-60', name: 'Head Bath', description: 'Luxurious scalp treatment and massage', categories: ['Spa Room'], resourceType: 'room', duration: 60, price: 120, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: null, isActive: true },
  { serviceId: 'svc-facial-full', name: 'Facial', description: 'Deep cleansing and rejuvenating facial', categories: ['Spa Room', 'Facials'], resourceType: 'room', duration: 60, price: 65, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-mini-facial', name: 'Mini Facial', description: 'Quick refresh facial treatment', categories: ['Spa Room', 'Facials'], resourceType: 'room', duration: 30, price: 30, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-beard-facial', name: 'Beard Facial', description: 'Specialized beard grooming and facial', categories: ['Spa Room'], resourceType: 'room', duration: 60, price: 65, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  { serviceId: 'svc-couples-head-bath', name: 'Couples Head Bath', description: 'Relaxing head spa experience for two', categories: ['Spa Room'], resourceType: 'room', duration: 120, price: 230, houseFeeEnabled: false, requiresConsultation: true, providersRequired: 2, allowedStaff: null, isActive: true },

  // ─── Head Bath Add-ons (all staff) ───
  { serviceId: 'svc-addon-mini-facial', name: 'Mini Facial (Add-on)', description: 'Quick refresh facial add-on', categories: ['Spa Room'], resourceType: 'room', duration: 15, price: 35, houseFeeEnabled: false, allowedStaff: null, isActive: true, parentServiceIds: ['svc-head-bath-60', 'svc-head-bath-30'] },
  { serviceId: 'svc-addon-steam', name: 'Steam Conditioning (Add-on)', description: 'Steam conditioning treatment add-on', categories: ['Spa Room'], resourceType: 'room', duration: 10, price: 18, houseFeeEnabled: false, allowedStaff: null, isActive: true, parentServiceIds: ['svc-head-bath-60', 'svc-head-bath-30'] },
  { serviceId: 'svc-addon-heat-style', name: 'Heat Style (Add-on)', description: 'Heat styling finish add-on', categories: ['Spa Room'], resourceType: 'room', duration: 15, price: 15, houseFeeEnabled: false, allowedStaff: null, isActive: true, parentServiceIds: ['svc-head-bath-60', 'svc-head-bath-30'] },

  // ─── Hair Studio (Stacey & Trinity) ───
  { serviceId: 'svc-trim', name: 'Trim', description: 'Quick hair trim and touch-up', categories: ['Hair Studio'], duration: 30, price: 15, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-up-do', name: 'Up-Do', description: 'Elegant updo styling for special occasions', categories: ['Hair Studio', 'Wedding'], duration: 60, price: 55, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-kids-cut', name: 'Kids Cut', description: 'Haircut for children 12 and under', categories: ['Hair Studio'], duration: 30, price: 15, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-shampoo-style', name: 'Shampoo & Style', description: 'Professional wash and styling', categories: ['Hair Studio'], duration: 45, price: 35, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-highlights', name: 'Highlights', description: 'Dimensional color highlights', categories: ['Hair Studio'], duration: 90, price: 120, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  { serviceId: 'svc-color-treatment', name: 'Color Treatment', description: 'Full color application and treatment', categories: ['Hair Studio'], duration: 60, price: 95, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
  { serviceId: 'svc-womens-haircut', name: "Women's Haircut", description: 'Precision cut and style', categories: ['Hair Studio'], duration: 30, price: 38, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-mens-haircut', name: "Men's Haircut", description: 'Classic or modern mens cut', categories: ['Hair Studio'], duration: 30, price: 25, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-kera-trinity'], isActive: true },
  { serviceId: 'svc-vivid-color', name: 'Partial Vivid Color', description: 'Bold fashion color application', categories: ['Hair Studio'], duration: 60, price: 145, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },

  // ─── Nail Care (Stacey & Jylian) ───
  { serviceId: 'svc-manicure', name: 'Classic Manicure', description: 'Complete nail care and polish', categories: ['Nail Care'], duration: 30, price: 25, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-gel-manicure', name: 'Gel Manicure', description: 'Long-lasting gel polish manicure', categories: ['Nail Care'], duration: 30, price: 30, houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-deluxe-manicure', name: 'Deluxe Manicure', description: 'Premium manicure with hand treatment', categories: ['Nail Care'], duration: 30, price: 40, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-classic-pedicure', name: 'Classic Pedicure', description: 'Classic pedicure treatment', categories: ['Nail Care'], duration: 45, price: 40, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-gel-pedicure', name: 'Gel Pedicure', description: 'Long-lasting gel polish pedicure', categories: ['Nail Care'], duration: 45, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-deluxe-pedicure', name: 'Deluxe Pedicure', description: 'Premium pedicure with foot treatment', categories: ['Nail Care'], duration: 60, price: 75, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-foot-soak', name: 'Foot Soak', description: 'Soothing foot bath and massage', categories: ['Nail Care'], duration: 30, price: 18, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },

  // ─── Waxing (Stacey & Jylian) ───
  { serviceId: 'svc-brow-wax', name: 'Brow Wax', description: 'Eyebrow shaping and waxing', categories: ['Waxing'], duration: 15, price: 15, houseFeeEnabled: false, requiresConsultation: true, allowedStaff: ['staff-kera-stacey', 'staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-lip-wax', name: 'Lip Wax', description: 'Upper lip hair removal', categories: ['Waxing'], duration: 10, price: 10, houseFeeEnabled: true, houseFeeAmount: 3, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-chin-wax', name: 'Chin Wax', description: 'Chin hair removal', categories: ['Waxing'], duration: 15, price: 15, houseFeeEnabled: true, houseFeeAmount: 5, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-brazilian', name: 'Brazilian', description: 'Complete bikini area hair removal', categories: ['Waxing'], duration: 45, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-bikini', name: 'Bikini', description: 'Bikini line hair removal', categories: ['Waxing'], duration: 30, price: 50, houseFeeEnabled: true, houseFeeAmount: 15, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-full-legs', name: 'Full Legs', description: 'Full leg hair removal', categories: ['Waxing'], duration: 45, price: 70, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-underarms', name: 'Underarms', description: 'Underarm hair removal', categories: ['Waxing'], duration: 20, price: 28, houseFeeEnabled: true, houseFeeAmount: 8, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },

  // ─── Facials (Jylian) ───
  { serviceId: 'svc-express-glow-facial', name: 'Express Glow Facial', description: 'Quick refreshing facial', categories: ['Facials'], duration: 30, price: 45, houseFeeEnabled: true, houseFeeAmount: 12, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-signature-glow-facial', name: 'Signature Glow Facial', description: 'Signature facial treatment', categories: ['Facials'], duration: 60, price: 85, houseFeeEnabled: true, houseFeeAmount: 25, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-glass-skin-facial', name: 'Korean Glass Skin Facial', description: 'Korean glass skin facial treatment', categories: ['Facials'], duration: 75, price: 110, houseFeeEnabled: true, houseFeeAmount: 30, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-black-glow-facial', name: 'Black Glow Facial', description: 'Specialized glow facial', categories: ['Facials'], duration: 60, price: 65, houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },

  // ─── Signature Rituals (Jylian) ───
  { serviceId: 'svc-she-king-ritual', name: 'The She-King Herbal Ritual', description: 'Luxurious herbal ritual experience', categories: ['Signature Rituals'], duration: 90, price: 125, houseFeeEnabled: true, houseFeeAmount: 35, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-lunar-luxe', name: 'Lunar Luxe Mani-Pedi Ritual', description: 'Complete mani-pedi ritual', categories: ['Signature Rituals', 'Nail Care'], duration: 90, price: 110, houseFeeEnabled: true, houseFeeAmount: 30, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-glow-polish', name: 'Glow & Polish Ritual', description: 'Signature glow and polish experience', categories: ['Signature Rituals', 'Nail Care'], duration: 75, price: 95, houseFeeEnabled: true, houseFeeAmount: 28, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },
  { serviceId: 'svc-glass-skin-ritual', name: 'Glass Skin Ritual Package', description: 'Korean glass skin facial and Japanese head spa', categories: ['Signature Rituals', 'Spa Room'], duration: 135, price: 195, houseFeeEnabled: true, houseFeeAmount: 55, requiresConsultation: true, allowedStaff: ['staff-selene-jylian'], isActive: true },

  // ─── Sauna (no staff required) ───
  { serviceId: 'svc-sauna-25', name: 'Sauna - 25 min', description: 'Infrared sauna session for detox and relaxation', categories: ['Sauna'], resourceType: 'sauna', duration: 25, price: 10, houseFeeEnabled: false, allowedStaff: null, isActive: true },
  { serviceId: 'svc-sauna-45', name: 'Sauna - 45 min', description: 'Extended infrared sauna session', categories: ['Sauna'], resourceType: 'sauna', duration: 45, price: 18, houseFeeEnabled: false, allowedStaff: null, isActive: true },

  // ─── Wedding (Stacey) ───
  { serviceId: 'svc-wedding-trial', name: 'Wedding Trial', description: 'Complimentary bridal hair and makeup trial', categories: ['Wedding', 'Hair Studio'], duration: 60, price: 0, requiresConsultation: true, allowedStaff: ['staff-kera-stacey'], isActive: true },
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
// SEED EXECUTION
// ═══════════════════════════════════════════════════════════════

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

async function seedAll() {
  console.log('🌱 Seeding dev environment with unified business model data...\n');

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

  // 4. Services (unified model — no vendorId)
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

  console.log('\n✅ Dev seed complete!');
  console.log(`   ${providers.length} providers`);
  console.log(`   ${categories.length} categories`);
  console.log(`   ${staff.length} staff members`);
  console.log(`   ${services.length} services`);
  console.log(`   ${bundles.length} bundles`);
}

seedAll().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
