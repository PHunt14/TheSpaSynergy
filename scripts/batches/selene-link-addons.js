// Batch: Link Selene Glow Studio's existing add-on category services to their parents
//
// Run:  node scripts/upsert.js --batch selene-link-addons
// Test: node scripts/upsert.js --batch selene-link-addons --dry-run

const hairParents = [
  'svc-selene-womens-haircut',
  'svc-selene-mens-haircut',
  'svc-selene-shampoo-conditioning',
  'svc-selene-blowout',
];

const facialParents = [
  'svc-selene-express-glow-facial',
  'svc-selene-signature-glow-facial',
  'svc-selene-korean-glass-skin-facial',
  'svc-selene-black-glow-facial',
];

const operations = [
  // Hair Ritual Add-ons → all Hair Rituals
  { model: 'Service', id: 'svc-selene-hot-oil-treatment', data: { parentServiceIds: hairParents } },
  { model: 'Service', id: 'svc-selene-deep-conditioning', data: { parentServiceIds: hairParents } },
  { model: 'Service', id: 'svc-selene-flat-iron', data: { parentServiceIds: hairParents } },
  { model: 'Service', id: 'svc-selene-curling-iron', data: { parentServiceIds: hairParents } },

  // Facial Ritual Add-ons → all Facial Rituals
  { model: 'Service', id: 'svc-selene-deluxe-ritual-addon', data: { parentServiceIds: facialParents } },
  { model: 'Service', id: 'svc-selene-eye-treatment', data: { parentServiceIds: facialParents } },
  { model: 'Service', id: 'svc-selene-lip-treatment', data: { parentServiceIds: facialParents } },
];

export default operations;
