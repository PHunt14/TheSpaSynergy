import { Client, Environment } from 'square';
import { randomUUID } from 'crypto';
import { generateClient } from 'aws-amplify/data';
import config from '../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import { buildOrderLineItems } from '../../../lib/square/catalog.js';

Amplify.configure(config, { ssr: true });

export async function POST(request) {
  try {
    const { sourceId, amount, tipAmount, vendorId, staffId, bundlePayments, serviceIds, people } = await request.json();

    if (!sourceId || !amount) {
      return Response.json({ error: 'Missing payment details' }, { status: 400 });
    }

    // Validate tipAmount if provided
    const tip = typeof tipAmount === 'number' && tipAmount > 0 ? tipAmount : 0;

    // Single vendor payment
    if (vendorId && !bundlePayments) {
      return await processSinglePayment(sourceId, amount, vendorId, staffId, serviceIds, people, tip);
    }

    // Multi-vendor bundle payment
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
  if (!staffId) {
    return { error: 'No staff assigned', details: 'Online payment requires an assigned staff member with Square connected', status: 400 };
  }
  const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
  if (!staff) return { error: 'Staff not found', status: 404 };
  if (staff.squareOAuthStatus === 'error') {
    return { error: 'Payment unavailable', details: 'Staff Square account needs to be reconnected', status: 400 };
  }
  if (!staff.squareAccessToken || !staff.squareLocationId) {
    return { error: 'Payment configuration error', details: 'Staff member has not connected Square', status: 400 };
  }
  return { accessToken: staff.squareAccessToken, locationId: staff.squareLocationId };
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

  // Validate all non-house vendors are connected to Square
  const vendorChecks = await Promise.all(
    consolidatedPayments
      .filter(p => p.vendorId !== houseVendor.vendorId)
      .map(async ({ vendorId }) => {
        const { data: vendor } = await dataClient.models.Vendor.get({ vendorId });
        return { vendorId, vendor };
      })
  );

  const missingVendors = vendorChecks.filter(({ vendor }) => !vendor?.squareAccessToken);
  if (missingVendors.length > 0) {
    return Response.json({ 
      error: 'Some vendors not connected to Square',
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
