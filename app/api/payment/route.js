import { Client, Environment } from 'square';
import { randomUUID } from 'crypto';
import { generateClient } from 'aws-amplify/data';
import config from '../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import { buildOrderLineItems } from '../../../lib/square/catalog.js';
import { calculateMultiProviderSplit } from '../../utils/payment.js';

Amplify.configure(config, { ssr: true });

export async function POST(request) {
  try {
    const { sourceId, amount, tipAmount, vendorId, staffId, bundlePayments, bundleId, serviceIds, people, multiProvider, paymentSplit } = await request.json();

    if (!sourceId || !amount) {
      return Response.json({ error: 'Missing payment details' }, { status: 400 });
    }

    // Validate tipAmount if provided
    const tip = typeof tipAmount === 'number' && tipAmount > 0 ? tipAmount : 0;

    // Multi-provider payment (e.g., couples booking)
    if (multiProvider && paymentSplit) {
      return await processMultiProviderPayment(sourceId, amount, paymentSplit, tip);
    }

    // Single vendor payment
    if (vendorId && !bundlePayments) {
      return await processSinglePayment(sourceId, amount, vendorId, staffId, serviceIds, people, tip);
    }

    // Multi-vendor bundle payment — when a bundleId is present we link the charge
    // to all appointments in the bundle after a successful capture
    if (bundlePayments && bundlePayments.length > 0 && bundleId) {
      return await processMultiVendorBundlePayment(sourceId, amount, bundlePayments, bundleId, tip);
    }

    // Legacy bundle payment path (e.g., couples booking flow that pre-builds its own bundlePayments
    // and links appointments via groupId in processMultiProviderPayment)
    if (bundlePayments && bundlePayments.length > 0) {
      return await processBundlePayment(sourceId, amount, bundlePayments, tip);
    }

    return Response.json({ error: 'Invalid payment configuration' }, { status: 400 });
  } catch (error) {
    console.error('Payment error:', error);
    return Response.json({ 
      error: 'Payment failed',
      details: error.message 
    }, { status: 500 });
  }
}

async function resolveSquareCredentials(dataClient, vendorId, staffId) {
  // Try the assigned staff member first
  if (staffId) {
    const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
    if (staff) {
      if (staff.squareOAuthStatus === 'error') {
        return { error: 'Payment unavailable', details: 'Staff Square account needs to be reconnected', status: 400 };
      }
      if (staff.squareAccessToken && staff.squareLocationId) {
        return { accessToken: staff.squareAccessToken, locationId: staff.squareLocationId };
      }
    }
  }

  // Fallback: find any connected staff member on this vendor
  if (vendorId) {
    const { data: vendorStaff } = await dataClient.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
    const connected = (vendorStaff || []).find(s =>
      s.isActive !== false && s.squareAccessToken && s.squareLocationId && s.squareOAuthStatus === 'connected'
    );
    if (connected) {
      return { accessToken: connected.squareAccessToken, locationId: connected.squareLocationId };
    }
  }

  return { error: 'Payment configuration error', details: 'No staff member with Square connected found for this vendor', status: 400 };
}

async function processMultiProviderPayment(sourceId, totalAmount, paymentSplit, tipAmount = 0) {
  const dataClient = generateClient();

  // paymentSplit contains: { serviceId, assignedStaff, groupId }
  const { serviceId, assignedStaff, groupId } = paymentSplit;

  if (!serviceId || !assignedStaff || !groupId) {
    return Response.json({ error: 'Missing multi-provider payment details' }, { status: 400 });
  }

  // Fetch the service to get price and paymentSplitRules
  const { data: service } = await dataClient.models.Service.get({ serviceId });
  if (!service) {
    return Response.json({ error: 'Service not found' }, { status: 404 });
  }

  // Get house vendor
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = vendors.find(v => v.isHouse);

  if (!houseVendor) {
    return Response.json({ error: 'House vendor not configured' }, { status: 500 });
  }

  // Calculate the payment split using the utility function
  const split = calculateMultiProviderSplit({
    service,
    assignedStaff,
    houseVendorId: houseVendor.vendorId,
  });

  // Check that all vendors in the split have Square credentials
  const vendorIds = [...new Set(split.providerShares.map(s => s.vendorId))];
  const vendorChecks = await Promise.all(
    vendorIds.map(async (vid) => {
      const { data: vendor } = await dataClient.models.Vendor.get({ vendorId: vid });
      return { vendorId: vid, vendor };
    })
  );

  const missingCredentials = vendorChecks.filter(
    ({ vendor }) => !vendor?.squareAccessToken || !vendor?.squareLocationId
  );

  if (missingCredentials.length > 0) {
    return Response.json({
      error: 'Card payment unavailable',
      details: 'One or more providers have not connected Square. Please pay in person.',
      vendors: missingCredentials.map(v => v.vendorId),
    }, { status: 400 });
  }

  // Build bundlePayments array from provider shares for processBundlePayment
  const bundlePayments = [];

  // Add house fee as a payment to the house vendor
  if (split.houseFee > 0) {
    bundlePayments.push({
      vendorId: houseVendor.vendorId,
      amount: split.houseFee,
      isHouseFee: true,
    });
  }

  // Add each provider's share
  split.providerShares.forEach(({ vendorId, amount }) => {
    bundlePayments.push({
      vendorId,
      amount,
      isHouseFee: false,
    });
  });

  // Process via existing bundle payment infrastructure
  const paymentResult = await processBundlePayment(sourceId, totalAmount, bundlePayments, tipAmount);
  const paymentResponse = await paymentResult.json();

  if (!paymentResponse.success) {
    return Response.json(paymentResponse, { status: 500 });
  }

  // Record payment split details on each appointment in the group
  const { data: groupAppointments } = await dataClient.models.Appointment.list({
    filter: { groupId: { eq: groupId } },
  });

  if (groupAppointments && groupAppointments.length > 0) {
    await Promise.all(
      groupAppointments.map(async (appointment) => {
        // Find this appointment's share from the split
        const share = split.providerShares.find(
          s => s.staffId === appointment.staffId
        );
        const paymentAmount = share ? share.amount : 0;

        await dataClient.models.Appointment.update({
          appointmentId: appointment.appointmentId,
          paymentId: paymentResponse.paymentId,
          paymentStatus: paymentResponse.status,
          paymentAmount,
        });
      })
    );
  }

  return Response.json({
    success: true,
    paymentId: paymentResponse.paymentId,
    status: paymentResponse.status,
    splitDetails: split,
    groupId,
    tipAmount: tipAmount || 0,
  });
}

async function processSinglePayment(sourceId, amount, vendorId, staffId, serviceIds, people, tipAmount = 0) {
  const dataClient = generateClient();
  const creds = await resolveSquareCredentials(dataClient, vendorId, staffId);

  if (creds.error) {
    return Response.json({ error: creds.error, details: creds.details }, { status: creds.status });
  }

  const { accessToken, locationId } = creds;

  const client = new Client({
    accessToken,
    environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' 
      ? Environment.Production 
      : Environment.Sandbox
  });

  try {
    // Load service details for order line items
    let orderId;
    if (serviceIds?.length > 0) {
      const serviceDetails = [];
      for (const sid of serviceIds) {
        const { data: svc } = await dataClient.models.Service.get({ serviceId: sid });
        if (svc) serviceDetails.push(svc);
      }
      if (serviceDetails.length > 0) {
        const lineItems = buildOrderLineItems(serviceDetails, people);
        const { result: orderResult } = await client.ordersApi.createOrder({
          order: {
            locationId,
            lineItems,
          },
          idempotencyKey: randomUUID(),
        });
        orderId = orderResult.order.id;
      }
    }

    const paymentRequest = {
      sourceId,
      idempotencyKey: randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(amount * 100)),
        currency: 'USD'
      },
      locationId,
      orderId,
    };

    // Include tip as a separate field so Square tracks it independently
    if (tipAmount > 0) {
      paymentRequest.tipMoney = {
        amount: BigInt(Math.round(tipAmount * 100)),
        currency: 'USD'
      };
    }

    const { result } = await client.paymentsApi.createPayment(paymentRequest);

    return Response.json({
      success: true,
      paymentId: result.payment.id,
      status: result.payment.status,
      tipAmount: tipAmount || 0,
    });
  } catch (error) {
    console.error('Square API error:', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
    return Response.json({ 
      error: 'Payment processing failed',
      details
    }, { status: 500 });
  }
}

async function processMultiVendorBundlePayment(sourceId, totalAmount, bundlePayments, bundleId, tipAmount = 0) {
  const dataClient = generateClient();

  // Delegate charge + credential validation to the shared bundle payment helper
  const paymentResult = await processBundlePayment(sourceId, totalAmount, bundlePayments, tipAmount);
  const paymentResponse = await paymentResult.json();

  // Bubble up errors (e.g., missing Square credentials → 400, Square API failures → 500)
  if (!paymentResponse.success) {
    return Response.json(paymentResponse, { status: paymentResult.status || 500 });
  }

  // Record paymentId + per-appointment paymentAmount on each appointment in the bundle
  try {
    const { data: bundleAppointments } = await dataClient.models.Appointment.list({
      filter: { bundleId: { eq: bundleId } },
    });

    if (bundleAppointments && bundleAppointments.length > 0) {
      // Fetch each appointment's service to determine its share of the total
      const appointmentsWithServices = await Promise.all(
        bundleAppointments.map(async (appt) => {
          const { data: svc } = await dataClient.models.Service.get({ serviceId: appt.serviceId });
          return { appt, servicePrice: svc?.price || 0 };
        })
      );

      const subtotal = appointmentsWithServices.reduce((sum, { servicePrice }) => sum + servicePrice, 0);

      await Promise.all(
        appointmentsWithServices.map(async ({ appt, servicePrice }, idx) => {
          // Proportional share of the (possibly discounted) total.
          // Fall back to even split if subtotal is zero (avoids divide-by-zero).
          let paymentAmount;
          if (subtotal > 0) {
            paymentAmount = Math.round((servicePrice / subtotal) * totalAmount * 100) / 100;
          } else {
            paymentAmount = Math.round((totalAmount / appointmentsWithServices.length) * 100) / 100;
          }

          await dataClient.models.Appointment.update({
            appointmentId: appt.appointmentId,
            paymentId: paymentResponse.paymentId,
            paymentStatus: paymentResponse.status,
            paymentAmount,
          });
        })
      );
    }
  } catch (error) {
    // Log but do not fail the payment response — the charge already succeeded.
    console.error('Failed to record payment details on bundle appointments:', error);
  }

  return Response.json({
    success: true,
    paymentId: paymentResponse.paymentId,
    status: paymentResponse.status,
    splitPayments: paymentResponse.splitPayments,
    bundleId,
    tipAmount: tipAmount || 0,
  });
}

async function processBundlePayment(sourceId, totalAmount, bundlePayments, tipAmount = 0) {
  const dataClient = generateClient();
  
  // Get house vendor
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = vendors.find(v => v.isHouse);
  
  if (!houseVendor) {
    return Response.json({ error: 'House vendor not configured' }, { status: 500 });
  }

  // Consolidate payments by vendor (combine house fees and vendor portions)
  const vendorPaymentMap = new Map();
  
  bundlePayments.forEach(({ vendorId, amount, isHouseFee }) => {
    if (vendorPaymentMap.has(vendorId)) {
      vendorPaymentMap.set(vendorId, vendorPaymentMap.get(vendorId) + amount);
    } else {
      vendorPaymentMap.set(vendorId, amount);
    }
  });

  const consolidatedPayments = Array.from(vendorPaymentMap.entries()).map(([vendorId, amount]) => ({
    vendorId,
    amount
  }));

  // Validate all non-house vendors are connected to Square (access token AND location id)
  const vendorChecks = await Promise.all(
    consolidatedPayments
      .filter(p => p.vendorId !== houseVendor.vendorId)
      .map(async ({ vendorId }) => {
        const { data: vendor } = await dataClient.models.Vendor.get({ vendorId });
        return { vendorId, vendor };
      })
  );

  const missingVendors = vendorChecks.filter(
    ({ vendor }) => !vendor?.squareAccessToken || !vendor?.squareLocationId
  );
  if (missingVendors.length > 0) {
    return Response.json({
      error: 'Card payment unavailable',
      details: 'One or more vendors have not connected Square. Please pay in person.',
      vendors: missingVendors.map(v => v.vendorId)
    }, { status: 400 });
  }

  // Determine primary recipient (house or first vendor)
  const housePayment = consolidatedPayments.find(p => p.vendorId === houseVendor.vendorId);
  const otherPayments = consolidatedPayments.filter(p => p.vendorId !== houseVendor.vendorId);

  let primaryVendor, primaryAmount, additionalRecipients;

  if (housePayment) {
    // House gets paid first (uses platform credentials)
    primaryVendor = houseVendor;
    primaryAmount = housePayment.amount;
    
    // Other vendors as additional recipients
    additionalRecipients = otherPayments.map(({ vendorId, amount }) => {
      const vendor = vendorChecks.find(v => v.vendorId === vendorId).vendor;
      return {
        locationId: vendor.squareLocationId,
        amountMoney: {
          amount: BigInt(Math.round(amount * 100)),
          currency: 'USD'
        },
        description: 'Bundle service payment'
      };
    });
  } else {
    // No house fee - use first vendor as primary
    primaryVendor = vendorChecks[0].vendor;
    primaryAmount = otherPayments[0].amount;
    
    additionalRecipients = otherPayments.slice(1).map(({ vendorId, amount }) => {
      const vendor = vendorChecks.find(v => v.vendorId === vendorId).vendor;
      return {
        locationId: vendor.squareLocationId,
        amountMoney: {
          amount: BigInt(Math.round(amount * 100)),
          currency: 'USD'
        },
        description: 'Bundle service payment'
      };
    });
  }

  const client = new Client({
    accessToken: primaryVendor.squareAccessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production' 
      ? Environment.Production 
      : Environment.Sandbox
  });

  const paymentRequest = {
    sourceId,
    idempotencyKey: randomUUID(),
    amountMoney: {
      amount: BigInt(Math.round(totalAmount * 100)),
      currency: 'USD'
    },
    locationId: primaryVendor.squareLocationId,
    additionalRecipients: additionalRecipients.length > 0 ? additionalRecipients : undefined
  };

  // Include tip as a separate field so Square tracks it independently
  if (tipAmount > 0) {
    paymentRequest.tipMoney = {
      amount: BigInt(Math.round(tipAmount * 100)),
      currency: 'USD'
    };
  }

  const { result } = await client.paymentsApi.createPayment(paymentRequest);

  return Response.json({
    success: true,
    paymentId: result.payment.id,
    status: result.payment.status,
    splitPayments: consolidatedPayments,
    tipAmount: tipAmount || 0,
  });
}
