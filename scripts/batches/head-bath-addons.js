// Batch: Head Bath service for all vendors + addons
//
// Run:  node scripts/upsert.js --batch head-bath-addons
// Test: node scripts/upsert.js --batch head-bath-addons --dry-run

const operations = [
  // Winsome Woods — Head Bath + addons
  { model: 'Service', id: 'svc-winsome-head-bath', data: {
    vendorId: 'vendor-winsome-woods', category: 'Spa Room', name: 'Head Bath',
    description: 'Luxurious scalp treatment and massage', duration: 60, price: 120,
    houseFeeEnabled: true, houseFeeAmount: 65, requiresConsultation: true, isActive: true,
  }},
  { model: 'Service', id: 'svc-winsome-head-bath-addon-mini-facial', data: {
    vendorId: 'vendor-winsome-woods', category: 'Spa Room', name: 'Mini Facial',
    description: 'Quick refresh facial add-on', duration: 15, price: 35,
    houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-winsome-head-bath'],
  }},
  { model: 'Service', id: 'svc-winsome-head-bath-addon-steam', data: {
    vendorId: 'vendor-winsome-woods', category: 'Spa Room', name: 'Steam Conditioning',
    description: 'Steam conditioning treatment add-on', duration: 10, price: 18,
    houseFeeEnabled: true, houseFeeAmount: 13, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-winsome-head-bath'],
  }},
  { model: 'Service', id: 'svc-winsome-head-bath-addon-heat-style', data: {
    vendorId: 'vendor-winsome-woods', category: 'Spa Room', name: 'Heat Style',
    description: 'Heat styling finish add-on', duration: 15, price: 15,
    houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-winsome-head-bath'],
  }},

  // Kera Studio — addons shared across 60-min and 30-min Head Bath
  { model: 'Service', id: 'svc-kera-head-bath-addon-mini-facial', data: {
    vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Mini Facial',
    description: 'Quick refresh facial add-on', duration: 15, price: 35,
    houseFeeEnabled: false, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-kera-head-bath', 'svc-kera-head-bath-30'],
  }},
  { model: 'Service', id: 'svc-kera-head-bath-addon-steam', data: {
    vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Steam Conditioning',
    description: 'Steam conditioning treatment add-on', duration: 10, price: 18,
    houseFeeEnabled: false, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-kera-head-bath', 'svc-kera-head-bath-30'],
  }},
  { model: 'Service', id: 'svc-kera-head-bath-addon-heat-style', data: {
    vendorId: 'vendor-kera-studio', category: 'Spa Room', name: 'Heat Style',
    description: 'Heat styling finish add-on', duration: 15, price: 15,
    houseFeeEnabled: false, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-kera-head-bath', 'svc-kera-head-bath-30'],
  }},

  // Selene Glow Studio — Head Bath + addons
  { model: 'Service', id: 'svc-selene-head-bath', data: {
    vendorId: 'vendor-selene-glow-studio', category: 'Spa Room', name: 'Head Bath',
    description: 'Luxurious scalp treatment and massage', duration: 60, price: 120,
    houseFeeEnabled: true, houseFeeAmount: 65, requiresConsultation: true, isActive: true,
  }},
  { model: 'Service', id: 'svc-selene-head-bath-addon-mini-facial', data: {
    vendorId: 'vendor-selene-glow-studio', category: 'Spa Room', name: 'Mini Facial',
    description: 'Quick refresh facial add-on', duration: 15, price: 35,
    houseFeeEnabled: true, houseFeeAmount: 20, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-selene-head-bath'],
  }},
  { model: 'Service', id: 'svc-selene-head-bath-addon-steam', data: {
    vendorId: 'vendor-selene-glow-studio', category: 'Spa Room', name: 'Steam Conditioning',
    description: 'Steam conditioning treatment add-on', duration: 10, price: 18,
    houseFeeEnabled: true, houseFeeAmount: 13, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-selene-head-bath'],
  }},
  { model: 'Service', id: 'svc-selene-head-bath-addon-heat-style', data: {
    vendorId: 'vendor-selene-glow-studio', category: 'Spa Room', name: 'Heat Style',
    description: 'Heat styling finish add-on', duration: 15, price: 15,
    houseFeeEnabled: true, houseFeeAmount: 10, requiresConsultation: false, isActive: true,
    parentServiceIds: ['svc-selene-head-bath'],
  }},
];

export default operations;
