import { randomUUID } from 'crypto';
import { Client, Environment } from 'square';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import { calculateEqualSplit, validateCustomSplit, dollarsToCents } from '../../../utils/splitCalculator';
import { calculateBundlePaymentSplit } from '../../../utils/bundlePaymentSplit';
import { scaleVendorAllocations } from '../../../utils/vendorRevenueScaler';

Amplify.configure(config, { ssr: true });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'createSession':
        return await handleCreateSession(body);
      case 'payPayer':
        return await handlePayPayer(body);
      case 'getSession':
        return await handleGetSession(body);
      case 'refund':
        return await handleRefund(body);
      default:
        return Response.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Split payment error:', error);
    return Response.json({
      error: 'Split payment request failed',
      details: error.message,
    }, { status: 500 });
  }
}

async function handleCreateSession(body: {
  action: string;
  bundleId: string;
  splitType: 'equal' | 'custom';
  payerCount: number;
  payerAmountsCents?: number[];
}) {
  const { bundleId, splitType, payerCount, payerAmountsCents } = body;

  if (!bundleId || !splitType || !payerCount) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const dataClient = generateClient<Schema>();

  // 1. Validate bundle exists and has valid status
  const { data: bundle } = await dataClient.models.Bundle.get({ bundleId });
  if (!bundle) {
    return Response.json(
      { error: 'Invalid bundle status', details: 'Bundle not found' },
      { status: 400 }
    );
  }

  const validStatuses = ['pending', 'booked', 'pending-confirmation', 'confirmed'];
  if (!bundle.status || !validStatuses.includes(bundle.status)) {
    return Response.json(
      { error: 'Invalid bundle status', details: `Bundle status "${bundle.status}" is not eligible for split payment` },
      { status: 400 }
    );
  }

  // 2. Check no active session exists for this bundleId
  try {
    const { data: existingSessions } = await (dataClient.models as any).SplitPaymentSession.list({
      filter: { bundleId: { eq: bundleId } }
    });
    const activeSession = (existingSessions || []).find(
      (s: any) => s.status === 'pending' || s.status === 'partial'
    );
    if (activeSession) {
      return Response.json(
        { error: 'Active split session already exists for this bundle' },
        { status: 409 }
      );
    }
  } catch (err: any) {
    // SplitPaymentSession model may not be deployed yet — skip check
    console.warn('Could not check existing sessions (model may not be deployed):', err.message);
  }

  // 3. Calculate the bundle total in cents
  const totalCents = dollarsToCents(bundle.price);

  // 4. Calculate payer amounts
  let payerAmounts: number[];

  if (splitType === 'equal') {
    const result = calculateEqualSplit({ totalCents, payerCount });
    payerAmounts = result.payerAmounts;
  } else {
    // Custom mode: validate the provided amounts
    if (!payerAmountsCents || payerAmountsCents.length !== payerCount) {
      return Response.json(
        { error: 'Payer amounts do not sum to bundle total', details: 'payerAmountsCents must be provided with length equal to payerCount for custom splits' },
        { status: 400 }
      );
    }

    const validation = validateCustomSplit({ totalCents, payerAmountsCents });
    if (!validation.valid) {
      // Determine specific error type
      if (validation.error && validation.error.includes('below the minimum')) {
        return Response.json(
          { error: 'Amount below Square minimum', minAmount: 50 },
          { status: 400 }
        );
      }
      return Response.json(
        { error: 'Payer amounts do not sum to bundle total', details: validation.error },
        { status: 400 }
      );
    }

    payerAmounts = payerAmountsCents;
  }

  // 5. Fetch services and compute vendor allocations to validate minimum amounts
  const serviceIds = bundle.serviceIds || [];
  const services: any[] = [];
  for (const serviceId of serviceIds) {
    const { data: service } = await dataClient.models.Service.get({ serviceId });
    if (service) {
      services.push(service);
    }
  }

  // Get house vendor
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = (vendors || []).find((v: any) => v.isHouse);
  if (!houseVendor) {
    return Response.json(
      { error: 'House vendor not configured' },
      { status: 500 }
    );
  }

  // Calculate discount amount: sum of service prices - bundle price
  const subtotal = services.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
  const discountAmount = subtotal - bundle.price;

  // Compute vendor allocations using bundlePaymentSplit
  const bundleSplit = calculateBundlePaymentSplit({
    services,
    discountAmount,
    houseVendorId: houseVendor.vendorId,
  });

  // 6. Validate each payer amount can cover vendor distribution (at least 1 cent per vendor)
  const vendorCount = bundleSplit.bundlePayments.length;
  if (vendorCount > 0) {
    const minimumPayerAmount = vendorCount; // 1 cent per vendor
    const minPayerAmount = Math.min(...payerAmounts);
    if (minPayerAmount < minimumPayerAmount) {
      return Response.json(
        { error: 'Minimum payment too low for vendor distribution' },
        { status: 400 }
      );
    }
  }

  // 7. Create payer records
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const payers = payerAmounts.map((amountCents, index) => ({
    payerIndex: index,
    label: `Person ${index + 1}`,
    amountCents,
    status: 'pending',
    squarePaymentId: null,
    paidAt: null,
  }));

  // 8. Create SplitPaymentSession in DynamoDB
  const sessionId = randomUUID();

  await (dataClient.models as any).SplitPaymentSession.create({
    sessionId,
    bundleId,
    totalAmountCents: totalCents,
    splitType,
    payerCount,
    status: 'pending',
    payers: JSON.stringify(payers),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return Response.json({
    sessionId,
    payers,
    expiresAt: expiresAt.toISOString(),
  });
}

async function handlePayPayer(body: {
  action: string;
  sessionId: string;
  payerIndex: number;
  sourceId: string;
  amountCents?: number;
}) {
  const { sessionId, payerIndex, sourceId, amountCents } = body;

  const dataClient = generateClient<Schema>();

  // 1. Validate session exists
  const { data: session } = await (dataClient.models as any).SplitPaymentSession.get({ sessionId });
  if (!session) {
    return Response.json({ error: 'Split payment session not found' }, { status: 404 });
  }

  // 2. Check expiration
  if (new Date(session.expiresAt) < new Date()) {
    // Mark session as expired if not already
    if (session.status === 'pending' || session.status === 'partial') {
      try {
        await (dataClient.models as any).SplitPaymentSession.update({
          sessionId,
          status: 'expired',
        });
      } catch (err) {
        console.error('Failed to update session to expired:', err);
      }
    }
    return Response.json({ error: 'Split payment session expired' }, { status: 410 });
  }

  // 3. Validate payerIndex
  if (
    payerIndex === undefined ||
    payerIndex === null ||
    !Number.isInteger(payerIndex) ||
    payerIndex < 0 ||
    payerIndex >= session.payerCount
  ) {
    return Response.json({ error: 'Invalid payer index' }, { status: 400 });
  }

  // 4. Parse payers and validate payer status
  const payers = typeof session.payers === 'string' ? JSON.parse(session.payers) : session.payers;
  const payer = payers[payerIndex];

  if (payer.status === 'paid') {
    return Response.json({ error: 'Payer has already completed payment' }, { status: 409 });
  }

  // 5. Validate sourceId
  if (!sourceId || sourceId.trim() === '') {
    return Response.json({ error: 'Missing card nonce' }, { status: 400 });
  }

  // 6. Validate amount matches stored session amount (if provided)
  if (amountCents !== undefined && amountCents !== payer.amountCents) {
    return Response.json({ error: 'Amount mismatch with stored session' }, { status: 400 });
  }

  // 7. Get bundle info to compute vendor allocations
  const { data: bundle } = await dataClient.models.Bundle.get({ bundleId: session.bundleId });
  if (!bundle) {
    return Response.json({ error: 'Bundle not found' }, { status: 500 });
  }

  const serviceIds = bundle.serviceIds || [];
  const services: any[] = [];
  for (const serviceId of serviceIds) {
    const { data: service } = await dataClient.models.Service.get({ serviceId });
    if (service) {
      services.push(service);
    }
  }

  // Get house vendor
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = (vendors || []).find((v: any) => v.isHouse);
  if (!houseVendor) {
    return Response.json({ error: 'House vendor not configured' }, { status: 500 });
  }

  // Calculate discount and vendor allocations
  const subtotal = services.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
  const discountAmount = subtotal - bundle.price;

  const bundleSplit = calculateBundlePaymentSplit({
    services,
    discountAmount,
    houseVendorId: houseVendor.vendorId,
  });

  // 8. Scale vendor allocations for this payer's share
  const allPayerShares = payers.map((p: any) => p.amountCents);
  const scaledAllocations = scaleVendorAllocations(
    bundleSplit.bundlePayments,
    payer.amountCents,
    session.totalAmountCents,
    payerIndex,
    session.payerCount,
    allPayerShares
  );

  // 9. Build Square payment request
  // House vendor is primary recipient; other vendors are additionalRecipients
  const houseAllocation = scaledAllocations.find(
    (a) => a.vendorId === houseVendor.vendorId
  );
  const otherAllocations = scaledAllocations.filter(
    (a) => a.vendorId !== houseVendor.vendorId && a.amountCents > 0
  );

  // Fetch vendor details for additionalRecipients (need squareLocationId)
  const additionalRecipients: any[] = [];
  for (const allocation of otherAllocations) {
    const { data: vendor } = await dataClient.models.Vendor.get({ vendorId: allocation.vendorId });
    // Only include vendors with Square configured
    if (vendor?.squareLocationId) {
      additionalRecipients.push({
        locationId: vendor.squareLocationId,
        amountMoney: {
          amount: BigInt(allocation.amountCents),
          currency: 'USD',
        },
        description: 'Vendor payment',
      });
    }
  }

  const idempotencyKey = `${sessionId}-payer-${payerIndex}`;

  const client = new Client({
    accessToken: houseVendor.squareAccessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  });

  // 10. Process Square charge
  try {
    const paymentRequest: any = {
      sourceId,
      idempotencyKey,
      amountMoney: {
        amount: BigInt(payer.amountCents),
        currency: 'USD',
      },
      locationId: houseVendor.squareLocationId,
      additionalRecipients: additionalRecipients.length > 0 ? additionalRecipients : undefined,
    };

    const { result } = await client.paymentsApi.createPayment(paymentRequest);
    const squarePaymentId = result.payment?.id;

    // 11. Update payer status in session
    const now = new Date().toISOString();
    payers[payerIndex] = {
      ...payers[payerIndex],
      status: 'paid',
      squarePaymentId: squarePaymentId || null,
      paidAt: now,
    };

    // Determine new session status
    const paidCount = payers.filter((p: any) => p.status === 'paid').length;
    const allPaid = paidCount === session.payerCount;
    const newSessionStatus = allPaid ? 'completed' : 'partial';

    try {
      await (dataClient.models as any).SplitPaymentSession.update({
        sessionId,
        payers: JSON.stringify(payers),
        status: newSessionStatus,
      });

      // Update appointment payment status
      const appointmentPaymentStatus = allPaid ? 'COMPLETED' : 'PARTIAL';
      const { data: bundleAppointments } = await dataClient.models.Appointment.list({
        filter: { bundleId: { eq: session.bundleId } },
      });

      if (bundleAppointments && bundleAppointments.length > 0) {
        await Promise.all(
          bundleAppointments.map(async (appt: any) => {
            await dataClient.models.Appointment.update({
              appointmentId: appt.appointmentId,
              paymentStatus: appointmentPaymentStatus,
            } as any);
          })
        );
      }
    } catch (updateError: any) {
      // Session update failed after successful charge - log for reconciliation
      // but still return success to the payer (Requirement 4.5)
      console.error(
        'Split payment session update failed after successful charge. ' +
        `SessionId: ${sessionId}, PayerIndex: ${payerIndex}, SquarePaymentId: ${squarePaymentId}. ` +
        'Manual reconciliation required.',
        updateError
      );
    }

    return Response.json({
      success: true,
      payerIndex,
      squarePaymentId,
      paidAt: now,
      sessionStatus: newSessionStatus,
    });
  } catch (error: any) {
    // Square charge failed - return error, leave payer as "pending"
    console.error('Square API error (split payer payment):', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
    return Response.json({
      error: 'Payment processing failed',
      details,
    }, { status: 502 });
  }
}

async function handleGetSession(body: { action: string; sessionId: string }) {
  const { sessionId } = body;

  if (!sessionId) {
    return Response.json({ error: 'Missing required field: sessionId' }, { status: 400 });
  }

  const dataClient = generateClient<Schema>();

  // Fetch session from DynamoDB
  const { data: session } = await (dataClient.models as any).SplitPaymentSession.get({ sessionId });

  if (!session) {
    return Response.json({ error: 'Split payment session not found' }, { status: 404 });
  }

  // Check expiration: if past expiresAt and status is still pending or partial, mark as expired
  let currentStatus = session.status;
  if (
    (currentStatus === 'pending' || currentStatus === 'partial') &&
    new Date(session.expiresAt) < new Date()
  ) {
    currentStatus = 'expired';
    await (dataClient.models as any).SplitPaymentSession.update({
      sessionId,
      status: 'expired',
    });
  }

  // Parse payers JSON
  const payers = typeof session.payers === 'string' ? JSON.parse(session.payers) : session.payers;

  return Response.json({
    sessionId: session.sessionId,
    bundleId: session.bundleId,
    totalAmountCents: session.totalAmountCents,
    splitType: session.splitType,
    payerCount: session.payerCount,
    status: currentStatus,
    payers,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  });
}

async function handleRefund(body: {
  action: string;
  sessionId: string;
  type: 'full' | 'partial';
  refundAmountCents?: number;
}) {
  const { sessionId, type, refundAmountCents } = body;

  if (!sessionId) {
    return Response.json({ error: 'Missing required field: sessionId' }, { status: 400 });
  }

  if (!type || (type !== 'full' && type !== 'partial')) {
    return Response.json({ error: 'Missing or invalid refund type' }, { status: 400 });
  }

  if (type === 'partial' && (refundAmountCents === undefined || refundAmountCents === null)) {
    return Response.json({ error: 'Missing refundAmountCents for partial refund' }, { status: 400 });
  }

  const dataClient = generateClient<Schema>();

  // 1. Fetch session
  const { data: session } = await (dataClient.models as any).SplitPaymentSession.get({ sessionId });
  if (!session) {
    return Response.json({ error: 'Split payment session not found' }, { status: 404 });
  }

  // 2. Parse payers and find all paid payers
  const payers = typeof session.payers === 'string' ? JSON.parse(session.payers) : session.payers;
  const paidPayers = payers.filter((p: any) => p.status === 'paid');

  if (paidPayers.length === 0) {
    return Response.json({ error: 'No paid payers to refund' }, { status: 400 });
  }

  // 3. Calculate refund amounts per payer
  interface PayerRefund {
    payerIndex: number;
    refundAmountCents: number;
    squarePaymentId: string;
  }

  let payerRefunds: PayerRefund[] = [];

  if (type === 'full') {
    // Full refund: each paid payer gets refunded their full amountCents
    payerRefunds = paidPayers.map((p: any) => ({
      payerIndex: p.payerIndex,
      refundAmountCents: p.amountCents,
      squarePaymentId: p.squarePaymentId,
    }));
  } else {
    // Partial refund: distribute proportionally based on original payment shares
    const totalPaidCents = paidPayers.reduce((sum: number, p: any) => sum + p.amountCents, 0);

    // Calculate proportional refund for each paid payer
    let rawRefunds: { payerIndex: number; refundAmountCents: number; squarePaymentId: string }[] = [];
    let distributedCents = 0;

    for (const p of paidPayers) {
      const proportionalRefund = Math.floor(refundAmountCents! * p.amountCents / totalPaidCents);
      rawRefunds.push({
        payerIndex: p.payerIndex,
        refundAmountCents: proportionalRefund,
        squarePaymentId: p.squarePaymentId,
      });
      distributedCents += proportionalRefund;
    }

    // Assign remainder to first eligible payer
    let remainderCents = refundAmountCents! - distributedCents;

    // Skip payers whose refund < 1 cent and reallocate their portion
    let eligibleRefunds: PayerRefund[] = [];
    let reallocateCents = 0;

    for (const r of rawRefunds) {
      if (r.refundAmountCents < 1) {
        reallocateCents += r.refundAmountCents;
      } else {
        eligibleRefunds.push(r);
      }
    }

    // Add remainder + reallocated cents to first eligible payer
    if (eligibleRefunds.length > 0) {
      eligibleRefunds[0].refundAmountCents += remainderCents + reallocateCents;
    }

    payerRefunds = eligibleRefunds;
  }

  // 4. Get house vendor credentials for Square client
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = (vendors || []).find((v: any) => v.isHouse);
  if (!houseVendor) {
    return Response.json({ error: 'House vendor not configured' }, { status: 500 });
  }

  const client = new Client({
    accessToken: houseVendor.squareAccessToken || process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  });

  // 5. Process refunds for each eligible payer
  const results: { payerIndex: number; success: boolean; refundedAmountCents?: number; error?: string }[] = [];

  for (const refund of payerRefunds) {
    try {
      const { result } = await client.refundsApi.refundPayment({
        idempotencyKey: `${sessionId}-refund-${refund.payerIndex}`,
        paymentId: refund.squarePaymentId,
        amountMoney: { amount: BigInt(refund.refundAmountCents), currency: 'USD' },
        reason: 'Bundle split payment refund',
      });

      results.push({
        payerIndex: refund.payerIndex,
        success: true,
        refundedAmountCents: refund.refundAmountCents,
      });
    } catch (error: any) {
      const details = error?.errors?.[0]?.detail || error?.message || 'Unknown refund error';
      results.push({
        payerIndex: refund.payerIndex,
        success: false,
        error: details,
      });
    }
  }

  // 6. Determine session status based on results
  const allSucceeded = results.every((r) => r.success);
  const sessionStatus = allSucceeded ? 'refunded' : 'partially_refunded';

  // 7. Update session status
  try {
    await (dataClient.models as any).SplitPaymentSession.update({
      sessionId,
      status: sessionStatus,
    });
  } catch (updateError: any) {
    console.error(
      `Failed to update session status to "${sessionStatus}" after refund. ` +
      `SessionId: ${sessionId}. Manual reconciliation required.`,
      updateError
    );
  }

  // 8. Return detailed report
  return Response.json({
    success: allSucceeded,
    sessionStatus,
    results,
  });
}
