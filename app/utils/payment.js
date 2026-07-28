/**
 * Calculate payment splits for services with house fees
 * @param {Array} services - Array of service objects with price, houseFeeEnabled, houseFeeAmount, vendorId
 * @param {string} houseVendorId - The vendor ID of the house (Kera)
 * @returns {Object} - { total, splits: [{ vendorId, amount, description }] }
 */
export function calculatePaymentSplits(services, houseVendorId) {
  const splits = [];
  let total = 0;

  services.forEach(service => {
    total += service.price;

    if (service.houseFeeEnabled && service.houseFeeAmount > 0) {
      // Add house fee
      const existingHouseSplit = splits.find(s => s.vendorId === houseVendorId);
      if (existingHouseSplit) {
        existingHouseSplit.amount += service.houseFeeAmount;
      } else {
        splits.push({
          vendorId: houseVendorId,
          amount: service.houseFeeAmount,
          description: 'House fee',
          isHouseFee: true
        });
      }

      // Add vendor portion
      const vendorAmount = service.price - service.houseFeeAmount;
      const existingVendorSplit = splits.find(s => s.vendorId === service.vendorId && !s.isHouseFee);
      if (existingVendorSplit) {
        existingVendorSplit.amount += vendorAmount;
      } else {
        splits.push({
          vendorId: service.vendorId,
          amount: vendorAmount,
          description: 'Service payment',
          isHouseFee: false
        });
      }
    } else {
      // No house fee - vendor gets full amount
      const existingVendorSplit = splits.find(s => s.vendorId === service.vendorId && !s.isHouseFee);
      if (existingVendorSplit) {
        existingVendorSplit.amount += service.price;
      } else {
        splits.push({
          vendorId: service.vendorId,
          amount: service.price,
          description: 'Service payment',
          isHouseFee: false
        });
      }
    }
  });

  return { total, splits };
}

/**
 * Calculate vendor's net amount after house fee
 * @param {number} price - Service price
 * @param {boolean} houseFeeEnabled - Whether house fee is enabled
 * @param {number} houseFeeAmount - House fee amount
 * @returns {number} - Net amount vendor receives
 */
export function calculateVendorNet(price, houseFeeEnabled, houseFeeAmount) {
  if (houseFeeEnabled && houseFeeAmount > 0) {
    return price - houseFeeAmount;
  }
  return price;
}

/**
 * Calculate payment split for a multi-provider service (e.g., couples booking).
 *
 * Supports two split types defined in `service.paymentSplitRules`:
 *   - "equal" (default): remainder after house fee is split equally among providers.
 *   - "percentage": remainder is split according to the percentages array.
 *
 * House fee comes from the service's standard `houseFeeEnabled` / `houseFeeAmount` fields
 * (same as single-provider services — the house fee is a property of the service, not the split).
 *
 * @param {Object} params
 * @param {Object} params.service - Service object with price, houseFeeEnabled, houseFeeAmount, paymentSplitRules
 * @param {Array}  params.assignedStaff - Array of { staffId, vendorId, staffName }
 * @param {string} params.houseVendorId - The vendor ID of the house
 * @returns {{ total: number, houseFee: number, providerShares: Array<{ vendorId: string, staffId: string, amount: number }> }}
 */
export function calculateMultiProviderSplit({ service, assignedStaff, houseVendorId }) {
  const { price, paymentSplitRules, houseFeeEnabled, houseFeeAmount } = service;
  const rules = paymentSplitRules || {};

  // House fee comes from the service's standard fields (single source of truth)
  const effectiveHouseFee = (houseFeeEnabled && houseFeeAmount > 0) ? houseFeeAmount : 0;
  const remainder = price - effectiveHouseFee;

  const splitType = rules.type || 'equal';
  let providerShares;

  if (splitType === 'percentage' && Array.isArray(rules.percentages)) {
    // Custom percentage split
    providerShares = assignedStaff.map((staff, index) => {
      const pct = rules.percentages[index] || 0;
      return {
        vendorId: staff.vendorId,
        staffId: staff.staffId,
        amount: (remainder * pct) / 100,
      };
    });
  } else {
    // Equal split among all providers
    const perProvider = remainder / assignedStaff.length;
    providerShares = assignedStaff.map((staff) => ({
      vendorId: staff.vendorId,
      staffId: staff.staffId,
      amount: perProvider,
    }));
  }

  return {
    total: price,
    houseFee: effectiveHouseFee,
    providerShares,
  };
}

/**
 * Format payment split for display
 * @param {Array} splits - Array of split objects
 * @param {Array} vendors - Array of vendor objects
 * @returns {string} - Formatted string for display
 */
export function formatPaymentSplits(splits, vendors) {
  return splits.map(split => {
    const vendor = vendors.find(v => v.vendorId === split.vendorId);
    const vendorName = vendor?.name || split.vendorId;
    return `${vendorName}: $${split.amount.toFixed(2)}`;
  }).join(', ');
}
