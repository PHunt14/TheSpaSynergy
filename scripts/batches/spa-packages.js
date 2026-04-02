// Batch: Spa Packages (replaces old bundles)
//
// Run:  node scripts/upsert.js --batch spa-packages
// Test: node scripts/upsert.js --batch spa-packages --dry-run

const operations = [
  // --- Bookable Packages (Fri–Mon only) ---

  { model: 'Bundle', id: 'bundle-relax-package', data: {
    name: 'Relax Package',
    description: '25 min Himalayan Salt Foot Soak with exfoliation, massage & hot towel oil treatment • 25 min Infrared Sauna Session • 30 min Frisson Therapy session with Makaila',
    serviceIds: ['svc-winsome-salt-soak', 'svc-kera-sauna-25', 'svc-winsome-frisson-therapy'],
    vendorIds: ['vendor-winsome-woods', 'vendor-kera-studio'],
    price: 65.00,
    discountPercent: 0,
    isActive: true,
    minPeople: 1,
    maxPeople: 6,
    allowedDays: ['friday', 'saturday', 'sunday', 'monday'],
    addOns: [{ name: '60 min Sound Bath', price: 25, perPerson: true, serviceId: 'svc-winsome-sound-healing-60', groupOnly: true }],
  }},

  { model: 'Bundle', id: 'bundle-rejuvenate-package', data: {
    name: 'Rejuvenate Package',
    description: '30 min Massage with 30 min Red Light Therapy session • 45 min Mini-Facial with steam, exfoliation, and hydrating masks for face and hands',
    serviceIds: ['svc-winsome-massage-30', 'svc-winsome-redlight-therapy', 'svc-kera-mini-facial'],
    vendorIds: ['vendor-winsome-woods', 'vendor-kera-studio'],
    price: 115.00,
    discountPercent: 0,
    isActive: true,
    minPeople: 1,
    maxPeople: 6,
    allowedDays: ['friday', 'saturday', 'sunday', 'monday'],
    addOns: [{ name: '60 min Sound Bath', price: 25, perPerson: true, serviceId: 'svc-winsome-sound-healing-60', groupOnly: true }],
  }},

  { model: 'Bundle', id: 'bundle-recover-package', data: {
    name: 'Recover Package',
    description: '60 min Massage • 25 min Infrared Sauna Session • Selene Glow Facial',
    serviceIds: ['svc-winsome-massage-60', 'svc-kera-sauna-25', 'svc-selene-signature-glow-facial'],
    vendorIds: ['vendor-winsome-woods', 'vendor-kera-studio', 'vendor-selene-glow-studio'],
    price: 165.00,
    discountPercent: 0,
    isActive: true,
    minPeople: 1,
    maxPeople: 2,
    allowedDays: ['friday', 'saturday', 'sunday', 'monday'],
  }},

  { model: 'Bundle', id: 'bundle-reset-package', data: {
    name: 'Reset Package',
    description: '60 min Massage • 60 min Head Bath & Facial complete with a hot towel hand treatment',
    serviceIds: ['svc-winsome-massage-60', 'svc-kera-head-bath'],
    vendorIds: ['vendor-winsome-woods', 'vendor-kera-studio'],
    price: 215.00,
    discountPercent: 0,
    isActive: true,
    minPeople: 1,
    maxPeople: 2,
    allowedDays: ['friday', 'saturday', 'sunday', 'monday'],
  }},

  { model: 'Bundle', id: 'bundle-mini-moon', data: {
    name: 'Mini-Moon',
    description: '60 min Couples Massage with Red Light & Frisson therapies • 45 min Couples Head Bath with hot towel hand treatments and massage table • 60 min Couples Sound Bath',
    serviceIds: ['svc-winsome-massage-60', 'svc-winsome-redlight-therapy', 'svc-winsome-frisson-therapy', 'svc-kera-couple-head-bath', 'svc-winsome-sound-healing-60'],
    vendorIds: ['vendor-winsome-woods', 'vendor-kera-studio'],
    price: 400.00,
    discountPercent: 0,
    isActive: true,
    minPeople: 2,
    maxPeople: 2,
    allowedDays: ['friday', 'saturday', 'sunday', 'monday'],
  }},

  // --- Contact-Only Packages (call/text to book) ---

  { model: 'Bundle', id: 'bundle-princess-party', data: {
    name: 'Princess Party / Birthday Spa Day',
    description: 'A magical spa experience for your little princess and her friends. Text or call to customize your party!',
    serviceIds: [],
    vendorIds: ['vendor-kera-studio'],
    price: 0,
    discountPercent: 0,
    isActive: true,
    contactOnly: true,
  }},

  { model: 'Bundle', id: 'bundle-bridal-spa-day', data: {
    name: 'Bridal Spa Day',
    description: 'Pamper the bride-to-be and her bridal party with a customized spa experience. Text or call to plan your special day!',
    serviceIds: [],
    vendorIds: ['vendor-kera-studio'],
    price: 0,
    discountPercent: 0,
    isActive: true,
    contactOnly: true,
  }},

  { model: 'Bundle', id: 'bundle-grooms-party', data: {
    name: 'Grooms Party',
    description: 'Relaxation and grooming for the groom and his crew. Text or call to customize your experience!',
    serviceIds: [],
    vendorIds: ['vendor-kera-studio'],
    price: 0,
    discountPercent: 0,
    isActive: true,
    contactOnly: true,
  }},

  { model: 'Bundle', id: 'bundle-retreat-package', data: {
    name: 'Retreat Package',
    description: 'A full retreat experience for your group. Text or call to design your perfect wellness retreat!',
    serviceIds: [],
    vendorIds: ['vendor-kera-studio'],
    price: 0,
    discountPercent: 0,
    isActive: true,
    contactOnly: true,
  }},

];

export default operations;
