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
  resolveCredentialChain,
  PaymentRouteError,
  type CredentialResolutionError,
} from '../../utils/paymentRouting';
import {
  isTokenExpiringSoon as isTokenExpiringSoonEnhanced,
  refreshSquareToken as refreshSquareTokenEnhanced,
} from '../../../lib/square-token-enhanced';
import {
  validatePaymentAmount,
  sanitizeNumericInput,
  validateTipAmount,
} from '../../../lib/payment/validator';
import {
  generateIdempotencyKey,
  hashSourceToken,
} from '../../../lib/payment/idempotency';
import {
  decideSplit,
  executeSplitPayment,
  SplitDecisionError,
} from '../../../lib/payment/houseFee';
import {
  appendAuditRecord,
  buildAuditRecord,
} from '../../../lib/payment/audit';
import { withErrorLogging } from '@/lib/logger/middleware';

Amplify.configure(config, { ssr: true });

export const POST = withErrorLogging(async function POST(request: Request) {
  try {
    const { sourceId, amount, tipAmount, vendorId, staffId, bundlePayments, bundleId, serviceIds, people, multiProvider, paymentSplit, appointmentId } = await request.json();

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
      return await processSinglePayment(sourceId, amount, vendorId, staffId, serviceIds, people, tip, appointmentId);
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
})


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
async function processSinglePayment(sourceId: string, amount: number, vendorId: string, staffId: string, serviceIds: string[], people: number, tipAmount: number = 0, appointmentId?: string) {
  const dataClient = generateClient<Schema>();

  // If we have a staffId and serviceIds, attempt staff-based routing via Payment Routing Service
  if (staffId && serviceIds?.length > 0) {
    try {
      return await processStaffRoutedPayment(dataClient, sourceId, amount, staffId, serviceIds, people, tipAmount, appointmentId);
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
 * Processes a payment using the enhanced payment engine for staff-based credential
 * resolution, house fee splitting, and full audit trail.
 *
 * Enhanced flow (Requirements: 1.1–1.9, 2.1, 2.3, 2.4, 4.1–4.5, 5.1–5.3, 8.1, 8.3, 8.4):
 * 1. Sanitize and validate inputs (amount, tipAmount)
 * 2. Fetch appointment → check paymentStatus !== 'paid' (409 if already paid)
 * 3. Fetch staff, service, house provider, sibling staff
 * 4. resolveCredentialChain → if error, return 400 with inPersonRequired
 * 5. Token refresh if needed
 * 6. decideSplit → validate house fee
 * 7. generateIdempotencyKey (deterministic)
 * 8. executeSplitPayment or single charge
 * 9. appendAuditRecord (success, failure, or partial)
 * 10. Return response
 */
async function processStaffRoutedPayment(
  dataClient: any,
  sourceId: string,
  amount: number,
  staffId: string,
  serviceIds: string[],
  people: number,
  tipAmount: number = 0,
  appointmentId?: string
) {
  // --- Step 1: Sanitize and validate inputs ---
  const sanitizedAmount = sanitizeNumericInput(amount);
  if (sanitizedAmount === null) {
    return Response.json({ error: 'Invalid payment amount', details: 'Amount must be a finite number' }, { status: 400 });
  }

  const sanitizedTip = sanitizeNumericInput(tipAmount) ?? 0;
  if (tipAmount !== 0 && sanitizeNumericInput(tipAmount) === null) {
    return Response.json({ error: 'Invalid tip amount', details: 'Tip must be a finite number' }, { status: 400 });
  }

  // --- Step 2: Fetch appointment and check payment status ---
  let appointment: any = null;
  if (appointmentId) {
    const { data: appt } = await dataClient.models.Appointment.get({ appointmentId });
    if (appt) {
      appointment = appt;
      // Requirement 5.2: Reject if already paid
      if (appt.paymentStatus === 'paid') {
        return Response.json(
          { error: 'Already paid', details: 'This appointment has already been paid' },
          { status: 409 }
        );
      }
    }
  }

  // --- Step 3: Fetch staff, service, house provider, sibling staff ---
  const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
  if (!staff) {
    return Response.json({ error: 'Staff member not found', details: `No staff with id ${staffId}` }, { status: 404 });
  }

  const { data: service } = await dataClient.models.Service.get({ serviceId: serviceIds[0] });
  if (!service) {
    return Response.json({ error: 'Service not found', details: `No service with id ${serviceIds[0]}` }, { status: 404 });
  }

  // Calculate expected total from all services (supports multi-service checkout)
  let expectedTotal = service.price;
  if (serviceIds.length > 1) {
    for (let i = 1; i < serviceIds.length; i++) {
      const { data: additionalService } = await dataClient.models.Service.get({ serviceId: serviceIds[i] });
      if (additionalService) {
        expectedTotal += additionalService.price;
      }
    }
  }

  // Validate amount matches total service price (Requirement 4.1, 4.2)
  const amountValidation = validatePaymentAmount({
    amount: sanitizedAmount,
    expectedAmount: expectedTotal,
  });
  if (!amountValidation.valid) {
    return Response.json(
      { error: amountValidation.error!.message, details: amountValidation.error },
      { status: 400 }
    );
  }

  // Validate tip if provided (Requirement 4.4)
  if (sanitizedTip > 0) {
    const tipValidation = validateTipAmount(sanitizedTip, expectedTotal);
    if (!tipValidation.valid) {
      return Response.json(
        { error: tipValidation.error!.message, details: tipValidation.error },
        { status: 400 }
      );
    }
  }

  // Fetch the house provider (isHouse === true)
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseProvider = (vendors || []).find((v: any) => v.isHouse);
  if (!houseProvider) {
    return Response.json({ error: 'House provider not configured' }, { status: 500 });
  }

  // Fetch sibling staff on the same vendor
  const { data: vendorStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId: staff.vendorId });
  const siblingStaff = (vendorStaffList || []).filter(
    (s: any) => s.visibleId !== staffId && s.isActive !== false
  );

  // --- Step 4: resolveCredentialChain ---
  const resolution = resolveCredentialChain(staff, siblingStaff, houseProvider);

  // Check if resolution is an error (CredentialResolutionError)
  if ('code' in resolution && resolution.code === 'NO_CREDENTIALS') {
    const credError = resolution as CredentialResolutionError;
    return Response.json({
      error: 'Card payment unavailable',
      details: credError.message,
      inPersonRequired: true,
      staffName: credError.staffName,
      vendorName: credError.vendorName,
    }, { status: 400 });
  }

  // We have valid credentials
  const credResult = resolution as { credentials: { accessToken: string; locationId: string }; source: string; staffId?: string; vendorId?: string; resolutionPath: string[] };

  // --- Step 5: Token refresh if needed ---
  // Determine the staffId to use for token refresh based on resolution source
  const resolvedStaffId = credResult.staffId || staffId;
  const { data: resolvedStaffRecord } = await dataClient.models.StaffSchedule.get({ visibleId: resolvedStaffId });

  let effectiveCredentials = credResult.credentials;

  if (resolvedStaffRecord && isTokenExpiringSoonEnhanced(resolvedStaffRecord.squareTokenExpiresAt)) {
    const refreshResult = await refreshSquareTokenEnhanced(resolvedStaffId);
    if (refreshResult.success && refreshResult.newAccessToken) {
      effectiveCredentials = {
        accessToken: refreshResult.newAccessToken,
        locationId: credResult.credentials.locationId,
      };
    } else if (!refreshResult.success) {
      // Token refresh failed and token is expired — cannot proceed
      return Response.json({
        error: 'Card payment temporarily unavailable',
        details: refreshResult.error || 'Square token expired. Please reconnect Square in Dashboard Settings.',
      }, { status: 400 });
    }
  }

  // Resolve house provider credentials for split decision
  const houseCredentials = {
    accessToken: houseProvider.squareAccessToken || '',
    locationId: houseProvider.squareLocationId || '',
  };

  // If house fee requires house credentials, refresh house token if needed
  if (houseProvider.squareAccessToken && houseProvider.squareLocationId) {
    // Check house token expiry — house may be a staff record too
    const { data: houseStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId: houseProvider.vendorId });
    const houseStaffWithCreds = (houseStaffList || []).find((s: any) =>
      s.squareAccessToken === houseProvider.squareAccessToken
    );
    if (houseStaffWithCreds && isTokenExpiringSoonEnhanced(houseStaffWithCreds.squareTokenExpiresAt)) {
      const houseRefresh = await refreshSquareTokenEnhanced(houseStaffWithCreds.visibleId);
      if (houseRefresh.success && houseRefresh.newAccessToken) {
        houseCredentials.accessToken = houseRefresh.newAccessToken;
      }
    }
  }

  // --- Step 6: decideSplit ---
  let splitDecision;
  try {
    splitDecision = decideSplit(service, effectiveCredentials, houseCredentials);
  } catch (error: any) {
    if (error instanceof SplitDecisionError) {
      return Response.json({
        error: 'Payment configuration error',
        details: error.message,
      }, { status: 400 });
    }
    throw error;
  }

  // --- Step 7: generateIdempotencyKey (deterministic) ---
  const effectiveAppointmentId = appointmentId || `staff-${staffId}-${serviceIds[0]}-${Date.now()}`;
  const sourceTokenHash = hashSourceToken(sourceId);
  const paymentType = splitDecision.shouldSplit ? 'house_fee' : 'full';
  const idempotencyKeyBase = generateIdempotencyKey(effectiveAppointmentId, paymentType, sourceTokenHash);

  // --- Step 8: executeSplitPayment or single charge ---
  if (splitDecision.shouldSplit) {
    // Execute split payment (or single charge optimization)
    const splitResult = await executeSplitPayment(
      sourceId,
      splitDecision,
      effectiveCredentials,
      houseCredentials,
      sanitizedTip,
      idempotencyKeyBase
    );

    // --- Step 9: appendAuditRecord ---
    if (splitResult.success) {
      const auditRecord = buildAuditRecord({
        type: 'success',
        housePaymentId: splitResult.housePaymentId,
        houseFeeAmount: splitResult.houseFeeAmount,
        staffPaymentId: splitResult.staffPaymentId,
        staffAmount: splitResult.staffAmount,
        tipAmount: sanitizedTip,
        routingMethod: credResult.source as 'staff' | 'sibling_staff' | 'house',
        credentialResolutionPath: credResult.resolutionPath,
      });

      if (appointmentId) {
        await appendAuditRecord(appointmentId, auditRecord);
      }

      return Response.json({
        success: true,
        paymentId: splitResult.staffPaymentId || splitResult.housePaymentId,
        housePaymentId: splitResult.housePaymentId,
        staffPaymentId: splitResult.staffPaymentId,
        status: 'COMPLETED',
        tipAmount: sanitizedTip,
        houseFeeAmount: splitResult.houseFeeAmount,
        staffAmount: splitResult.staffAmount,
        routedTo: credResult.source,
      });
    } else if (splitResult.partial) {
      // Partial: house succeeded, staff failed
      const auditRecord = buildAuditRecord({
        type: 'partial',
        housePaymentId: splitResult.housePaymentId,
        houseFeeAmount: splitResult.houseFeeAmount,
        staffAmount: splitResult.staffAmount,
        tipAmount: sanitizedTip,
        routingMethod: credResult.source as 'staff' | 'sibling_staff' | 'house',
        credentialResolutionPath: credResult.resolutionPath,
        failureReason: splitResult.error,
        idempotencyKey: idempotencyKeyBase,
      });

      if (appointmentId) {
        await appendAuditRecord(appointmentId, auditRecord);
      }

      return Response.json({
        error: 'Partial payment processed',
        details: `Staff payment failed. House fee of $${splitResult.houseFeeAmount.toFixed(2)} was charged.`,
        paymentCompleted: false,
        partial: true,
        housePaymentId: splitResult.housePaymentId,
        houseFeeAmount: splitResult.houseFeeAmount,
      }, { status: 500 });
    } else {
      // Total failure
      const auditRecord = buildAuditRecord({
        type: 'failure',
        houseFeeAmount: splitResult.houseFeeAmount,
        staffAmount: splitResult.staffAmount,
        tipAmount: sanitizedTip,
        routingMethod: credResult.source as 'staff' | 'sibling_staff' | 'house',
        credentialResolutionPath: credResult.resolutionPath,
        failureReason: splitResult.error,
        attemptedAmountCents: Math.round((splitResult.houseFeeAmount + splitResult.staffAmount) * 100),
        credentialSource: credResult.source,
        idempotencyKey: idempotencyKeyBase,
      });

      if (appointmentId) {
        await appendAuditRecord(appointmentId, auditRecord);
      }

      return Response.json({
        error: 'Payment processing failed',
        details: splitResult.error || 'Payment failed',
        paymentCompleted: false,
      }, { status: 500 });
    }
  }

  // --- No split: single charge to effective credentials ---
  const squareEnvironment = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;

  const client = new Client({
    accessToken: effectiveCredentials.accessToken,
    environment: squareEnvironment,
  });

  try {
    const fullIdempotencyKey = `${idempotencyKeyBase}-staff`;
    const amountCents = Math.round(sanitizedAmount * 100);
    const tipCents = Math.round(sanitizedTip * 100);

    const paymentRequest: any = {
      sourceId,
      idempotencyKey: fullIdempotencyKey,
      amountMoney: {
        amount: BigInt(amountCents),
        currency: 'USD',
      },
      locationId: effectiveCredentials.locationId,
    };

    if (tipCents > 0) {
      paymentRequest.tipMoney = {
        amount: BigInt(tipCents),
        currency: 'USD',
      };
    }

    const { result } = await client.paymentsApi.createPayment(paymentRequest);
    const paymentId = result.payment?.id;

    // Audit: success record
    const auditRecord = buildAuditRecord({
      type: 'success',
      staffPaymentId: paymentId,
      staffAmount: sanitizedAmount,
      tipAmount: sanitizedTip,
      routingMethod: credResult.source as 'staff' | 'sibling_staff' | 'house',
      credentialResolutionPath: credResult.resolutionPath,
    });

    if (appointmentId) {
      await appendAuditRecord(appointmentId, auditRecord);
    }

    return Response.json({
      success: true,
      paymentId,
      status: result.payment?.status,
      tipAmount: sanitizedTip,
      routedTo: credResult.source,
    });
  } catch (error: any) {
    console.error('Square API error (staff-routed enhanced):', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';

    // Audit: failure record
    const auditRecord = buildAuditRecord({
      type: 'failure',
      staffAmount: sanitizedAmount,
      tipAmount: sanitizedTip,
      routingMethod: credResult.source as 'staff' | 'sibling_staff' | 'house',
      credentialResolutionPath: credResult.resolutionPath,
      failureReason: details,
      attemptedAmountCents: Math.round(sanitizedAmount * 100),
      credentialSource: credResult.source,
      idempotencyKey: `${idempotencyKeyBase}-staff`,
    });

    if (appointmentId) {
      await appendAuditRecord(appointmentId, auditRecord);
    }

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


/**
 * Resolves Square credentials for the house vendor.
 * Tries connected staff on the house vendor first, then the vendor-level credentials.
 * Returns null if no credentials are available.
 */
async function resolveHouseSquareCredentials(
  dataClient: any,
  houseVendor: any
): Promise<{ accessToken: string; locationId: string; staffId?: string } | null> {
  const { data: houseStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId: houseVendor.vendorId });
  const houseStaff = (houseStaffList || []).find((s: any) =>
    s.isActive !== false && s.squareAccessToken && s.squareLocationId && s.squareOAuthStatus === 'connected'
  );

  if (houseStaff) {
    const fresh = await ensureFreshCredentials(dataClient, { accessToken: houseStaff.squareAccessToken, locationId: houseStaff.squareLocationId }, houseStaff.visibleId, houseVendor.vendorId);
    if (!fresh.error && fresh.accessToken && fresh.locationId) {
      return { accessToken: fresh.accessToken, locationId: fresh.locationId, staffId: houseStaff.visibleId };
    }
  }

  if (houseVendor.squareAccessToken && houseVendor.squareLocationId) {
    return { accessToken: houseVendor.squareAccessToken, locationId: houseVendor.squareLocationId };
  }

  return null;
}

/**
 * Resolves Square credentials for a staff member, falling back to any connected staff on
 * the vendor, then vendor-level credentials.
 * Returns null if no credentials are available.
 */
async function resolveStaffSquareCredentials(
  dataClient: any,
  staffId: string | undefined,
  vendorId: string
): Promise<{ accessToken: string; locationId: string } | null> {
  // Try the specific staff member first
  if (staffId) {
    const { data: staff } = await dataClient.models.StaffSchedule.get({ visibleId: staffId });
    if (staff?.squareAccessToken && staff?.squareLocationId && staff?.squareOAuthStatus !== 'error') {
      const fresh = await ensureFreshCredentials(dataClient, { accessToken: staff.squareAccessToken, locationId: staff.squareLocationId }, staffId, vendorId);
      if (!fresh.error && fresh.accessToken && fresh.locationId) {
        return { accessToken: fresh.accessToken, locationId: fresh.locationId };
      }
    }
  }

  // Fall back to any connected staff on the vendor
  const { data: vendorStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({ vendorId });
  const connectedStaff = (vendorStaffList || []).find((s: any) =>
    s.isActive !== false && s.squareAccessToken && s.squareLocationId && s.squareOAuthStatus === 'connected'
  );
  if (connectedStaff) {
    const fresh = await ensureFreshCredentials(dataClient, { accessToken: connectedStaff.squareAccessToken, locationId: connectedStaff.squareLocationId }, connectedStaff.visibleId, vendorId);
    if (!fresh.error && fresh.accessToken && fresh.locationId) {
      return { accessToken: fresh.accessToken, locationId: fresh.locationId };
    }
  }

  // Last resort: vendor-level credentials
  const { data: vendor } = await dataClient.models.Vendor.get({ vendorId });
  if (vendor?.squareAccessToken && vendor?.squareLocationId) {
    return { accessToken: vendor.squareAccessToken, locationId: vendor.squareLocationId };
  }

  return null;
}

/**
 * Charges a Square account and returns the payment ID.
 * Throws on failure.
 */
async function chargeSquare(
  creds: { accessToken: string; locationId: string },
  sourceId: string,
  amountDollars: number,
  tipDollars: number = 0
): Promise<string> {
  const squareEnvironment = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;

  const client = new Client({ accessToken: creds.accessToken, environment: squareEnvironment });

  const paymentRequest: any = {
    sourceId,
    idempotencyKey: randomUUID(),
    amountMoney: { amount: BigInt(Math.round(amountDollars * 100)), currency: 'USD' },
    locationId: creds.locationId,
  };

  if (tipDollars > 0) {
    paymentRequest.tipMoney = { amount: BigInt(Math.round(tipDollars * 100)), currency: 'USD' };
  }

  const { result } = await client.paymentsApi.createPayment(paymentRequest);
  return result.payment?.id || '';
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
  const actualStaffIds = actualGroupApts.map((a: any) => a.staffId).filter(Boolean).sort((a, b) => a.localeCompare(b));
  const providedStaffIds = assignedStaff.map((s: any) => s.staffId).sort((a, b) => a.localeCompare(b));
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

  // Build the full payment breakdown for audit/tracking
  const paymentRaw = {
    houseFee: split.houseFee > 0 ? { paymentId: housePaymentId, amount: split.houseFee } : null,
    staffPayments: staffPaymentResults.map(sp => ({ staffId: sp.staffId, paymentId: sp.paymentId, amount: sp.amount })),
    totalCharged: split.houseFee + staffPaymentResults.reduce((sum, sp) => sum + sp.amount, 0),
    tipAmount: tipAmount || 0,
    processedAt: new Date().toISOString(),
  };

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
          paymentRaw: JSON.stringify(paymentRaw),
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
