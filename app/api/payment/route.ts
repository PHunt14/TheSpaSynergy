import { Client, Environment } from 'square';
import { randomUUID } from 'crypto';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import { buildOrderLineItems } from '../../../lib/square/catalog.js';
import { calculateMultiProviderSplit } from '../../utils/payment.js';
import { refreshSquareToken, isTokenExpiringSoon } from '../../../lib/square-token.js';
import {
  resolvePaymentRoute,
  PaymentRouteError,
} from '../../utils/paymentRouting';

Amplify.configure(config, { ssr: true });

export async function POST(request: Request) {
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

    // Single payment — staff-based routing
    if ((vendorId || staffId) && !bundlePayments) {
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
  } catch (error: any) {
    console.error('Payment error:', error);
    return Response.json({ 
      error: 'Payment failed',
      details: error.message 
    }, { status: 500 });
  }
}


/**
 * Resolves Square credentials for a staff member, with fallback to vendor.
 * Handles token refresh when credentials are expiring soon.
 */
async function resolveSquareCredentials(dataClient: any, vendorId: string, staffId: string) {
  // Try the assigned staff member first
  if (staffId) {
    const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
    if (!staff) {
      return { error: 'Staff member not found', details: `No staff with id ${staffId}`, status: 404 };
    }
    if (staff.squareOAuthStatus === 'error') {
      return { error: 'Payment unavailable', details: 'Staff Square account needs to be reconnected', status: 400 };
    }
    if (staff.squareAccessToken && staff.squareLocationId) {
      // Check if token is expired or expiring soon and refresh proactively
      if (isTokenExpiringSoon(staff.squareTokenExpiresAt, 1)) {
        const refreshed = await refreshSquareToken(staffId);
        if (!refreshed) {
          return { error: 'Payment unavailable', details: 'Square token expired. Please reconnect Square in Dashboard → Settings.', status: 400 };
        }
        // Re-fetch the staff record with updated credentials
        const { data: refreshedStaff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
        return { accessToken: refreshedStaff.squareAccessToken, locationId: refreshedStaff.squareLocationId };
      }
      return { accessToken: staff.squareAccessToken, locationId: staff.squareLocationId };
    }
  }

  // Fallback: find any connected staff member on this vendor
  if (vendorId) {
    const { data: vendorStaff } = await dataClient.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
    const connected = (vendorStaff || []).find((s: any) =>
      s.isActive !== false && s.squareAccessToken && s.squareLocationId && s.squareOAuthStatus === 'connected'
    );
    if (connected) {
      // Check token expiry for fallback staff too
      if (isTokenExpiringSoon(connected.squareTokenExpiresAt, 1)) {
        const refreshed = await refreshSquareToken(connected.visibleId);
        if (!refreshed) {
          return { error: 'Payment unavailable', details: 'Square token expired. Please reconnect Square in Dashboard → Settings.', status: 400 };
        }
        const { data: refreshedStaff } = await dataClient.models.StaffSchedule.get({ visibleId: connected.visibleId });
        return { accessToken: refreshedStaff.squareAccessToken, locationId: refreshedStaff.squareLocationId };
      }
      return { accessToken: connected.squareAccessToken, locationId: connected.squareLocationId };
    }
  }

  return { error: 'Payment configuration error', details: 'No staff member with Square connected found for this vendor', status: 400 };
}

/**
 * Process a single-service payment using staff-based routing.
 *
 * Uses the Payment Routing Service (resolvePaymentRoute) to determine:
 * - Which Square credentials to use (staff → provider fallback)
 * - Whether to split payment for house fee
 *
 * Requirements: 6.1, 6.2, 6.4, 6.5
 */
async function processSinglePayment(sourceId: string, amount: number, vendorId: string, staffId: string, serviceIds: string[], people: number, tipAmount: number = 0) {
  const dataClient = generateClient<Schema>();

  // If we have a staffId and serviceIds, attempt staff-based routing via Payment Routing Service
  if (staffId && serviceIds?.length > 0) {
    try {
      return await processStaffRoutedPayment(dataClient, sourceId, amount, staffId, serviceIds, people, tipAmount);
    } catch (error: any) {
      if (error instanceof PaymentRouteError) {
        // No valid Square credentials available — in-person payment required (Req 6.4)
        return Response.json({
          error: 'Card payment unavailable',
          details: error.message,
          inPersonRequired: true,
        }, { status: 400 });
      }
      // Re-throw other errors to be handled by the outer catch
      throw error;
    }
  }

  // Fallback to legacy credential resolution for requests without full routing info
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
    let orderId: string | undefined;
    if (serviceIds?.length > 0) {
      const serviceDetails: any[] = [];
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
        orderId = orderResult.order?.id;
      }
    }

    const paymentRequest: any = {
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
      paymentId: result.payment?.id,
      status: result.payment?.status,
      tipAmount: tipAmount || 0,
    });
  } catch (error: any) {
    // Square API error — display error, don't mark as paid, retain booking (Req 6.5)
    console.error('Square API error:', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
    return Response.json({ 
      error: 'Payment processing failed',
      details,
      paymentCompleted: false,
    }, { status: 500 });
  }
}


/**
 * Processes a payment using the Payment Routing Service for staff-based credential resolution
 * and house fee splitting.
 *
 * Flow:
 * 1. Fetch staff, provider, service, and house provider records
 * 2. Call resolvePaymentRoute to determine credentials and amounts
 * 3. If house fee > 0, split payment: house fee → houseFeeCredentials, remainder → effectiveCredentials
 * 4. If house fee === 0, process single payment to effectiveCredentials
 *
 * Throws PaymentRouteError if no credentials are available (caught by caller).
 *
 * Requirements: 6.1, 6.2, 6.4, 6.5
 */
async function processStaffRoutedPayment(
  dataClient: any,
  sourceId: string,
  amount: number,
  staffId: string,
  serviceIds: string[],
  people: number,
  tipAmount: number = 0
) {
  // Fetch assigned staff member
  const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
  if (!staff) {
    return Response.json({ error: 'Staff member not found', details: `No staff with id ${staffId}` }, { status: 404 });
  }

  // Fetch the provider (vendor) associated with the staff member
  const { data: provider } = await dataClient.models.Vendor.get({ vendorId: staff.vendorId });
  if (!provider) {
    return Response.json({ error: 'Provider not found', details: `No provider for staff ${staffId}` }, { status: 404 });
  }

  // Fetch the primary service for routing (use first service in the list)
  const { data: service } = await dataClient.models.Service.get({ serviceId: serviceIds[0] });
  if (!service) {
    return Response.json({ error: 'Service not found', details: `No service with id ${serviceIds[0]}` }, { status: 404 });
  }

  // Fetch the house provider (isHouse === true)
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseProvider = (vendors || []).find((v: any) => v.isHouse);
  if (!houseProvider) {
    return Response.json({ error: 'House provider not configured' }, { status: 500 });
  }

  // Resolve payment route using the Payment Routing Service
  // This may throw PaymentRouteError if no credentials are available
  const route = resolvePaymentRoute(
    { appointmentId: '', vendorId: staff.vendorId, serviceId: serviceIds[0], staffId },
    staff,
    provider,
    service,
    houseProvider
  );

  // Refresh token if needed for effective credentials
  const effectiveCreds = await ensureFreshCredentials(dataClient, route.effectiveCredentials, staffId, staff.vendorId);
  if (effectiveCreds.error) {
    return Response.json({ error: effectiveCreds.error, details: effectiveCreds.details }, { status: 400 });
  }

  const squareEnvironment = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;

  // If house fee > 0, split the payment into two charges (Req 6.2)
  if (route.houseFeeAmount > 0) {
    return await processHouseFeeSplit(
      dataClient,
      sourceId,
      amount,
      route,
      effectiveCreds,
      staffId,
      serviceIds,
      people,
      tipAmount,
      squareEnvironment
    );
  }

  // No house fee — process single payment to effective credentials (Req 6.1)
  const client = new Client({
    accessToken: effectiveCreds.accessToken,
    environment: squareEnvironment,
  });

  try {
    // Load service details for order line items
    let orderId: string | undefined;
    const serviceDetails: any[] = [];
    for (const sid of serviceIds) {
      const { data: svc } = await dataClient.models.Service.get({ serviceId: sid });
      if (svc) serviceDetails.push(svc);
    }
    if (serviceDetails.length > 0) {
      const lineItems = buildOrderLineItems(serviceDetails, people);
      const { result: orderResult } = await client.ordersApi.createOrder({
        order: {
          locationId: effectiveCreds.locationId,
          lineItems,
        },
        idempotencyKey: randomUUID(),
      });
      orderId = orderResult.order?.id;
    }

    const paymentRequest: any = {
      sourceId,
      idempotencyKey: randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(amount * 100)),
        currency: 'USD',
      },
      locationId: effectiveCreds.locationId,
      orderId,
    };

    if (tipAmount > 0) {
      paymentRequest.tipMoney = {
        amount: BigInt(Math.round(tipAmount * 100)),
        currency: 'USD',
      };
    }

    const { result } = await client.paymentsApi.createPayment(paymentRequest);

    return Response.json({
      success: true,
      paymentId: result.payment?.id,
      status: result.payment?.status,
      tipAmount: tipAmount || 0,
      routedTo: route.staffSquareCredentials ? 'staff' : 'provider',
    });
  } catch (error: any) {
    // Square API error — display error, don't mark as paid, retain booking (Req 6.5)
    console.error('Square API error (staff-routed):', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
    return Response.json({
      error: 'Payment processing failed',
      details,
      paymentCompleted: false,
    }, { status: 500 });
  }
}

/**
 * Processes a split payment when a service has a house fee enabled.
 *
 * Splits the payment into two charges:
 * 1. House fee amount → house provider's Square account
 * 2. Remainder (staff amount) → staff member's Square account (or provider fallback)
 *
 * Tip is applied to the staff portion only.
 *
 * Requirements: 6.2, 6.5
 */
async function processHouseFeeSplit(
  dataClient: any,
  sourceId: string,
  amount: number,
  route: any,
  effectiveCreds: { accessToken: string; locationId: string },
  staffId: string,
  serviceIds: string[],
  people: number,
  tipAmount: number,
  squareEnvironment: any
) {
  // Ensure house fee credentials are fresh
  const houseCreds = await ensureFreshCredentials(dataClient, route.houseFeeCredentials, null, null);
  if (houseCreds.error) {
    return Response.json({ error: houseCreds.error, details: houseCreds.details }, { status: 400 });
  }

  const staffAmount = route.staffAmount;
  const houseFeeAmount = route.houseFeeAmount;

  // 1. Process house fee payment to house provider's Square account
  const houseClient = new Client({
    accessToken: houseCreds.accessToken,
    environment: squareEnvironment,
  });

  let housePaymentId: string | undefined;
  try {
    const housePaymentRequest: any = {
      sourceId,
      idempotencyKey: randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(houseFeeAmount * 100)),
        currency: 'USD',
      },
      locationId: houseCreds.locationId,
    };

    const { result: houseResult } = await houseClient.paymentsApi.createPayment(housePaymentRequest);
    housePaymentId = houseResult.payment?.id;
  } catch (error: any) {
    // Square API error on house fee — don't mark as paid (Req 6.5)
    console.error('Square API error (house fee):', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
    return Response.json({
      error: 'Payment processing failed',
      details: `House fee payment failed: ${details}`,
      paymentCompleted: false,
    }, { status: 500 });
  }

  // 2. Process staff portion payment to staff's Square account
  const staffClient = new Client({
    accessToken: effectiveCreds.accessToken,
    environment: squareEnvironment,
  });

  try {
    // Build order line items for the staff portion
    let orderId: string | undefined;
    const serviceDetails: any[] = [];
    for (const sid of serviceIds) {
      const { data: svc } = await dataClient.models.Service.get({ serviceId: sid });
      if (svc) serviceDetails.push(svc);
    }
    if (serviceDetails.length > 0) {
      const lineItems = buildOrderLineItems(serviceDetails, people);
      const { result: orderResult } = await staffClient.ordersApi.createOrder({
        order: {
          locationId: effectiveCreds.locationId,
          lineItems,
        },
        idempotencyKey: randomUUID(),
      });
      orderId = orderResult.order?.id;
    }

    const staffPaymentRequest: any = {
      sourceId,
      idempotencyKey: randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(staffAmount * 100)),
        currency: 'USD',
      },
      locationId: effectiveCreds.locationId,
      orderId,
    };

    // Tip goes to the staff member
    if (tipAmount > 0) {
      staffPaymentRequest.tipMoney = {
        amount: BigInt(Math.round(tipAmount * 100)),
        currency: 'USD',
      };
    }

    const { result: staffResult } = await staffClient.paymentsApi.createPayment(staffPaymentRequest);

    return Response.json({
      success: true,
      paymentId: staffResult.payment?.id,
      housePaymentId,
      status: staffResult.payment?.status,
      tipAmount: tipAmount || 0,
      houseFeeAmount,
      staffAmount,
      routedTo: route.staffSquareCredentials ? 'staff' : 'provider',
    });
  } catch (error: any) {
    // Square API error on staff portion — don't mark as paid (Req 6.5)
    console.error('Square API error (staff portion):', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
    return Response.json({
      error: 'Payment processing failed',
      details: `Staff payment failed: ${details}. House fee of $${houseFeeAmount.toFixed(2)} was already processed (ID: ${housePaymentId}).`,
      paymentCompleted: false,
      housePaymentId,
    }, { status: 500 });
  }
}

/**
 * Ensures the given Square credentials have a fresh (non-expired) access token.
 * If the token is expiring soon, attempts to refresh it.
 *
 * For staff credentials, uses staffId for refresh.
 * For provider credentials (when staffId is null), returns as-is (provider tokens
 * are typically long-lived OAuth tokens managed separately).
 */
async function ensureFreshCredentials(
  dataClient: any,
  credentials: { accessToken: string; locationId: string },
  staffId: string | null,
  vendorId: string | null
): Promise<{ accessToken: string; locationId: string; error?: string; details?: string }> {
  if (!credentials || !credentials.accessToken || !credentials.locationId) {
    return { accessToken: '', locationId: '', error: 'Payment unavailable', details: 'Missing Square credentials' };
  }

  // If we have a staffId, check the token expiry and refresh if needed
  if (staffId) {
    const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
    if (staff && isTokenExpiringSoon(staff.squareTokenExpiresAt, 1)) {
      const refreshed = await refreshSquareToken(staffId);
      if (!refreshed) {
        return { accessToken: '', locationId: '', error: 'Payment unavailable', details: 'Square token expired. Please reconnect Square in Dashboard → Settings.' };
      }
      // Re-fetch the staff record with updated credentials
      const { data: refreshedStaff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
      return { accessToken: refreshedStaff.squareAccessToken, locationId: refreshedStaff.squareLocationId };
    }
  }

  return credentials;
}


async function processMultiProviderPayment(sourceId: string, totalAmount: number, paymentSplit: any, tipAmount: number = 0) {
  const dataClient = generateClient<Schema>();

  // paymentSplit contains: { serviceId, assignedStaff, groupId }
  // assignedStaff: [{ staffId, vendorId, staffName }]
  const { serviceId, assignedStaff, groupId } = paymentSplit;

  if (!serviceId || !assignedStaff || !groupId) {
    return Response.json({ error: 'Missing multi-provider payment details' }, { status: 400 });
  }

  // Validate assignedStaff is an array with expected shape
  if (!Array.isArray(assignedStaff) || assignedStaff.length === 0) {
    return Response.json({ error: 'Invalid assignedStaff: must be a non-empty array' }, { status: 400 });
  }
  if (!assignedStaff.every((s: any) => s.staffId && typeof s.staffId === 'string')) {
    return Response.json({ error: 'Invalid assignedStaff: each entry must have a staffId' }, { status: 400 });
  }

  // Verify the groupId exists and the assignedStaff matches actual appointments in the group
  const { data: actualGroupApts } = await dataClient.models.Appointment.list({
    filter: { groupId: { eq: groupId } },
  });
  if (!actualGroupApts || actualGroupApts.length === 0) {
    return Response.json({ error: 'Group not found', details: `No appointments with groupId ${groupId}` }, { status: 404 });
  }
  const actualStaffIds = actualGroupApts.map((a: any) => a.staffId).filter(Boolean).sort();
  const providedStaffIds = assignedStaff.map((s: any) => s.staffId).sort();
  if (JSON.stringify(actualStaffIds) !== JSON.stringify(providedStaffIds)) {
    return Response.json({ error: 'Staff assignment mismatch', details: 'Provided staff does not match appointments in this group' }, { status: 400 });
  }

  // Prevent double-charging: reject if any appointment in the group is already paid
  const alreadyPaid = actualGroupApts.find((a: any) => a.paymentId || a.paymentStatus === 'paid');
  if (alreadyPaid) {
    return Response.json({ error: 'Group already paid', details: 'One or more appointments in this group have already been paid' }, { status: 409 });
  }

  // Fetch the service to get price and paymentSplitRules
  const { data: service } = await dataClient.models.Service.get({ serviceId });
  if (!service) {
    return Response.json({ error: 'Service not found' }, { status: 404 });
  }

  // Validate the client-provided amount matches the service price (prevent amount manipulation)
  const servicePrice = service.price as number;
  if (Math.abs(totalAmount - servicePrice) > 0.01) {
    return Response.json({
      error: 'Amount mismatch',
      details: `Client sent $${totalAmount} but service price is $${servicePrice}`,
    }, { status: 400 });
  }

  // Get house vendor (for house fee routing)
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = (vendors || []).find((v: any) => v.isHouse);

  if (!houseVendor) {
    return Response.json({ error: 'House vendor not configured' }, { status: 500 });
  }

  // Calculate the payment split using the utility function
  const split = calculateMultiProviderSplit({
    service,
    assignedStaff,
    houseVendorId: houseVendor.vendorId,
  });

  // Resolve Square credentials for each staff member (staff-level, not vendor-level)
  const staffCredentials: { staffId: string; vendorId: string; creds: { accessToken: string; locationId: string }; amount: number }[] = [];

  for (const share of split.providerShares) {
    const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: share.staffId });
    if (!staff) {
      return Response.json({
        error: 'Staff member not found',
        details: `No staff record for ${share.staffId}`,
      }, { status: 404 });
    }

    // Resolve credentials: staff's own Square first, then fallback to vendor
    const staffCreds = await ensureFreshCredentials(
      dataClient,
      { accessToken: staff.squareAccessToken || '', locationId: staff.squareLocationId || '' },
      staff.squareAccessToken && staff.squareLocationId && staff.squareOAuthStatus !== 'error' ? share.staffId : null,
      share.vendorId
    );

    if (staffCreds.error || !staffCreds.accessToken || !staffCreds.locationId) {
      // Staff doesn't have credentials — try vendor fallback
      const { data: vendor } = await dataClient.models.Vendor.get({ vendorId: share.vendorId });
      if (vendor?.squareAccessToken && vendor?.squareLocationId) {
        staffCredentials.push({
          staffId: share.staffId,
          vendorId: share.vendorId,
          creds: { accessToken: vendor.squareAccessToken, locationId: vendor.squareLocationId },
          amount: share.amount,
        });
      } else {
        return Response.json({
          error: 'Card payment unavailable',
          details: `Staff member "${staff.staffName || share.staffId}" has not connected Square. Please pay in person.`,
        }, { status: 400 });
      }
    } else {
      staffCredentials.push({
        staffId: share.staffId,
        vendorId: share.vendorId,
        creds: { accessToken: staffCreds.accessToken, locationId: staffCreds.locationId },
        amount: share.amount,
      });
    }
  }

  // Resolve house credentials for house fee
  let housePaymentId: string | undefined;
  const squareEnvironment = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;

  if (split.houseFee > 0) {
    // Find house staff (any connected staff on the house vendor)
    const { data: houseStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId: houseVendor.vendorId });
    const houseStaff = (houseStaffList || []).find((s: any) =>
      s.isActive !== false && s.squareAccessToken && s.squareLocationId && s.squareOAuthStatus === 'connected'
    );

    const houseCreds = houseStaff
      ? { accessToken: houseStaff.squareAccessToken, locationId: houseStaff.squareLocationId }
      : houseVendor.squareAccessToken && houseVendor.squareLocationId
        ? { accessToken: houseVendor.squareAccessToken, locationId: houseVendor.squareLocationId }
        : null;

    if (!houseCreds) {
      return Response.json({
        error: 'Card payment unavailable',
        details: 'House account has not connected Square.',
      }, { status: 400 });
    }

    // Refresh house credentials if needed
    const freshHouseCreds = await ensureFreshCredentials(
      dataClient,
      houseCreds,
      houseStaff?.visibleId || null,
      houseVendor.vendorId
    );
    if (freshHouseCreds.error) {
      return Response.json({ error: freshHouseCreds.error, details: freshHouseCreds.details }, { status: 400 });
    }

    // Charge house fee
    const houseClient = new Client({
      accessToken: freshHouseCreds.accessToken,
      environment: squareEnvironment,
    });

    try {
      const { result: houseResult } = await houseClient.paymentsApi.createPayment({
        sourceId,
        idempotencyKey: randomUUID(),
        amountMoney: {
          amount: BigInt(Math.round(split.houseFee * 100)),
          currency: 'USD',
        },
        locationId: freshHouseCreds.locationId,
      });
      housePaymentId = houseResult.payment?.id;
    } catch (error: any) {
      console.error('Square API error (multi-provider house fee):', JSON.stringify(error, null, 2));
      const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
      return Response.json({
        error: 'Payment processing failed',
        details: `House fee payment failed: ${details}`,
        paymentCompleted: false,
      }, { status: 500 });
    }
  }

  // Charge each staff member's portion individually
  const staffPaymentResults: { staffId: string; paymentId: string; amount: number }[] = [];

  for (const entry of staffCredentials) {
    const staffClient = new Client({
      accessToken: entry.creds.accessToken,
      environment: squareEnvironment,
    });

    try {
      const paymentRequest: any = {
        sourceId,
        idempotencyKey: randomUUID(),
        amountMoney: {
          amount: BigInt(Math.round(entry.amount * 100)),
          currency: 'USD',
        },
        locationId: entry.creds.locationId,
      };

      // Tip split equally among staff (goes to last staff if odd cents)
      if (tipAmount > 0) {
        const tipPerStaff = Math.floor((tipAmount / staffCredentials.length) * 100) / 100;
        const isLast = entry === staffCredentials[staffCredentials.length - 1];
        const thisTip = isLast
          ? tipAmount - tipPerStaff * (staffCredentials.length - 1)
          : tipPerStaff;
        if (thisTip > 0) {
          paymentRequest.tipMoney = {
            amount: BigInt(Math.round(thisTip * 100)),
            currency: 'USD',
          };
        }
      }

      const { result } = await staffClient.paymentsApi.createPayment(paymentRequest);
      staffPaymentResults.push({
        staffId: entry.staffId,
        paymentId: result.payment?.id || '',
        amount: entry.amount,
      });
    } catch (error: any) {
      console.error(`Square API error (multi-provider staff ${entry.staffId}):`, JSON.stringify(error, null, 2));
      const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
      return Response.json({
        error: 'Payment processing failed',
        details: `Payment to staff "${entry.staffId}" failed: ${details}. ${housePaymentId ? `House fee was already charged (ID: ${housePaymentId}).` : ''} ${staffPaymentResults.length > 0 ? `${staffPaymentResults.length} other staff payments succeeded.` : ''} Manual reconciliation may be required.`,
        paymentCompleted: false,
        housePaymentId,
        completedStaffPayments: staffPaymentResults,
      }, { status: 500 });
    }
  }

  // All charges successful — record payment details on each appointment in the group
  const primaryPaymentId = staffPaymentResults[0]?.paymentId || housePaymentId || '';

  const { data: groupAppointments } = await dataClient.models.Appointment.list({
    filter: { groupId: { eq: groupId } },
  });

  if (groupAppointments && groupAppointments.length > 0) {
    await Promise.all(
      groupAppointments.map(async (appointment: any) => {
        // Find this appointment's share from the split
        const staffPayment = staffPaymentResults.find(
          (sp) => sp.staffId === appointment.staffId
        );
        const paymentAmount = staffPayment ? staffPayment.amount : split.houseFee;

        await dataClient.models.Appointment.update({
          appointmentId: appointment.appointmentId,
          paymentId: staffPayment?.paymentId || primaryPaymentId,
          paymentStatus: 'paid',
          paymentAmount,
        } as any);
      })
    );
  }

  return Response.json({
    success: true,
    paymentId: primaryPaymentId,
    housePaymentId,
    staffPayments: staffPaymentResults,
    status: 'COMPLETED',
    splitDetails: split,
    groupId,
    tipAmount: tipAmount || 0,
  });
}

async function processMultiVendorBundlePayment(sourceId: string, totalAmount: number, bundlePayments: any[], bundleId: string, tipAmount: number = 0) {
  const dataClient = generateClient<Schema>();

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
        bundleAppointments.map(async (appt: any) => {
          const { data: svc } = await dataClient.models.Service.get({ serviceId: appt.serviceId });
          return { appt, servicePrice: svc?.price || 0 };
        })
      );

      const subtotal = appointmentsWithServices.reduce((sum, { servicePrice }) => sum + servicePrice, 0);

      await Promise.all(
        appointmentsWithServices.map(async ({ appt, servicePrice }) => {
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
  } catch (error: any) {
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

async function processBundlePayment(sourceId: string, totalAmount: number, bundlePayments: any[], tipAmount: number = 0) {
  const dataClient = generateClient<Schema>();
  
  // Get house vendor
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = (vendors || []).find((v: any) => v.isHouse);
  
  if (!houseVendor) {
    return Response.json({ error: 'House vendor not configured' }, { status: 500 });
  }

  // Consolidate payments by staffId when available, otherwise by vendorId.
  // Each entry in bundlePayments can have: { vendorId, staffId?, amount, isHouseFee? }
  const paymentEntries: { vendorId: string; staffId?: string; amount: number; isHouseFee: boolean }[] = [];
  
  bundlePayments.forEach(({ vendorId, staffId, amount, isHouseFee }: any) => {
    const key = isHouseFee ? '__house__' : (staffId || vendorId);
    const existing = paymentEntries.find(e => 
      isHouseFee ? e.isHouseFee : (!e.isHouseFee && (e.staffId || e.vendorId) === key)
    );
    if (existing) {
      existing.amount += amount;
    } else {
      paymentEntries.push({ vendorId, staffId, amount, isHouseFee: !!isHouseFee });
    }
  });

  const squareEnvironment = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;

  const completedPayments: { vendorId: string; staffId?: string; paymentId: string; amount: number; isHouseFee: boolean }[] = [];

  // Process house fee first
  const houseEntry = paymentEntries.find(e => e.isHouseFee);
  if (houseEntry && houseEntry.amount > 0) {
    // Resolve house credentials (staff on house vendor, or vendor-level)
    const { data: houseStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId: houseVendor.vendorId });
    const houseStaff = (houseStaffList || []).find((s: any) =>
      s.isActive !== false && s.squareAccessToken && s.squareLocationId && s.squareOAuthStatus === 'connected'
    );

    const houseCreds = houseStaff
      ? { accessToken: houseStaff.squareAccessToken, locationId: houseStaff.squareLocationId }
      : houseVendor.squareAccessToken && houseVendor.squareLocationId
        ? { accessToken: houseVendor.squareAccessToken, locationId: houseVendor.squareLocationId }
        : null;

    if (!houseCreds) {
      return Response.json({
        error: 'Card payment unavailable',
        details: 'House account has not connected Square.',
      }, { status: 400 });
    }

    const freshHouseCreds = await ensureFreshCredentials(dataClient, houseCreds, houseStaff?.visibleId || null, houseVendor.vendorId);
    if (freshHouseCreds.error) {
      return Response.json({ error: freshHouseCreds.error, details: freshHouseCreds.details }, { status: 400 });
    }

    const houseClient = new Client({ accessToken: freshHouseCreds.accessToken, environment: squareEnvironment });
    try {
      const { result } = await houseClient.paymentsApi.createPayment({
        sourceId,
        idempotencyKey: randomUUID(),
        amountMoney: { amount: BigInt(Math.round(houseEntry.amount * 100)), currency: 'USD' },
        locationId: freshHouseCreds.locationId,
      });
      completedPayments.push({
        vendorId: houseVendor.vendorId,
        paymentId: result.payment?.id || '',
        amount: houseEntry.amount,
        isHouseFee: true,
      });
    } catch (error: any) {
      console.error('Square API error (bundle house fee):', JSON.stringify(error, null, 2));
      const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
      return Response.json({ error: 'Payment processing failed', details: `House fee failed: ${details}`, paymentCompleted: false }, { status: 500 });
    }
  }

  // Process each non-house payment — resolve staff-level credentials
  const staffEntries = paymentEntries.filter(e => !e.isHouseFee);

  for (const entry of staffEntries) {
    let creds: { accessToken: string; locationId: string } | null = null;

    // Try staff credentials first
    if (entry.staffId) {
      const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: entry.staffId });
      if (staff?.squareAccessToken && staff?.squareLocationId && staff?.squareOAuthStatus !== 'error') {
        const fresh = await ensureFreshCredentials(dataClient, { accessToken: staff.squareAccessToken, locationId: staff.squareLocationId }, entry.staffId, entry.vendorId);
        if (!fresh.error) creds = fresh;
      }
    }

    // Fall back to any connected staff on the vendor
    if (!creds) {
      const { data: vendorStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId: entry.vendorId });
      const connectedStaff = (vendorStaffList || []).find((s: any) =>
        s.isActive !== false && s.squareAccessToken && s.squareLocationId && s.squareOAuthStatus === 'connected'
      );
      if (connectedStaff) {
        const fresh = await ensureFreshCredentials(dataClient, { accessToken: connectedStaff.squareAccessToken, locationId: connectedStaff.squareLocationId }, connectedStaff.visibleId, entry.vendorId);
        if (!fresh.error) creds = fresh;
      }
    }

    // Last resort: vendor-level credentials
    if (!creds) {
      const { data: vendor } = await dataClient.models.Vendor.get({ vendorId: entry.vendorId });
      if (vendor?.squareAccessToken && vendor?.squareLocationId) {
        creds = { accessToken: vendor.squareAccessToken, locationId: vendor.squareLocationId };
      }
    }

    if (!creds) {
      return Response.json({
        error: 'Card payment unavailable',
        details: `No Square connection found for vendor "${entry.vendorId}". Please pay in person.`,
        completedPayments,
      }, { status: 400 });
    }

    const staffClient = new Client({ accessToken: creds.accessToken, environment: squareEnvironment });
    try {
      const paymentRequest: any = {
        sourceId,
        idempotencyKey: randomUUID(),
        amountMoney: { amount: BigInt(Math.round(entry.amount * 100)), currency: 'USD' },
        locationId: creds.locationId,
      };

      // Tip distributed among non-house recipients
      if (tipAmount > 0 && staffEntries.length > 0) {
        const tipPerEntry = Math.floor((tipAmount / staffEntries.length) * 100) / 100;
        const isLast = entry === staffEntries[staffEntries.length - 1];
        const thisTip = isLast ? tipAmount - tipPerEntry * (staffEntries.length - 1) : tipPerEntry;
        if (thisTip > 0) {
          paymentRequest.tipMoney = { amount: BigInt(Math.round(thisTip * 100)), currency: 'USD' };
        }
      }

      const { result } = await staffClient.paymentsApi.createPayment(paymentRequest);
      completedPayments.push({
        vendorId: entry.vendorId,
        staffId: entry.staffId,
        paymentId: result.payment?.id || '',
        amount: entry.amount,
        isHouseFee: false,
      });
    } catch (error: any) {
      console.error(`Square API error (bundle vendor ${entry.vendorId}):`, JSON.stringify(error, null, 2));
      const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
      return Response.json({
        error: 'Payment processing failed',
        details: `Payment to "${entry.vendorId}" failed: ${details}. ${completedPayments.length > 0 ? `${completedPayments.length} payment(s) already processed. Manual reconciliation may be required.` : ''}`,
        paymentCompleted: false,
        completedPayments,
      }, { status: 500 });
    }
  }

  return Response.json({
    success: true,
    paymentId: completedPayments[0]?.paymentId || '',
    status: 'COMPLETED',
    splitPayments: completedPayments,
    tipAmount: tipAmount || 0,
  });
}
