import { randomUUID } from 'node:crypto';
import { Client, Environment } from 'square';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import { calculateEqualSplit, validateCustomSplit, dollarsToCents } from '../../../utils/splitCalculator';
import { calculateBundlePaymentSplit } from '../../../utils/bundlePaymentSplit';
import { calculateMultiProviderSplit } from '../../../utils/payment';
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

// --- Extracted helpers to reduce cognitive complexity ---

async function resolveBundleTotalCents(bundleId: string, dataClient: any) {
  const { data: bundle } = await dataClient.models.Bundle.get({ bundleId });
  if (!bundle) {
    return { error: Response.json({ error: 'Invalid bundle status', details: 'Bundle not found' }, { status: 400 }) };
  }

  const validStatuses = ['pending', 'booked', 'pending-confirmation', 'confirmed'];
  if (!bundle.status || !validStatuses.includes(bundle.status)) {
    return { error: Response.json({ error: 'Invalid bundle status', details: `Bundle status "${bundle.status}" is not eligible for split payment` }, { status: 400 }) };
  }

  const { data: existingSessions } = await (dataClient.models as any).SplitPaymentSession.list({
    filter: { bundleId: { eq: bundleId } }
  });
  if ((existingSessions || []).some((s: any) => s.status === 'pending' || s.status === 'partial')) {
    return { error: Response.json({ error: 'Active split session already exists for this bundle' }, { status: 409 }) };
  }

  const totalCents = dollarsToCents(bundle.price);
  const serviceIds = bundle.serviceIds || [];
  const services: any[] = [];
  for (const serviceId of serviceIds) {
    const { data: service } = await dataClient.models.Service.get({ serviceId });
    if (service) services.push(service);
  }

  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = (vendors || []).find((v: any) => v.isHouse);
  if (!houseVendor) {
    return { error: Response.json({ error: 'House vendor not configured' }, { status: 500 }) };
  }

  const subtotal = services.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
  const discountAmount = subtotal - bundle.price;
  const bundleSplit = calculateBundlePaymentSplit({ services, discountAmount, houseVendorId: houseVendor.vendorId });

  return { totalCents, bundleSplit };
}

async function resolveGroupTotalCents(groupId: string, dataClient: any) {
  const { data: groupApts } = await dataClient.models.Appointment.list({
    filter: { groupId: { eq: groupId } },
  });

  if (!groupApts || groupApts.length === 0) {
    return { error: Response.json({ error: 'Group not found', details: `No appointments with groupId ${groupId}` }, { status: 404 }) };
  }

  if (groupApts.some((a: any) => a.paymentStatus === 'paid' || a.paymentId)) {
    return { error: Response.json({ error: 'Group already paid', details: 'One or more appointments in this group have already been paid' }, { status: 400 }) };
  }

  const { data: allSessions } = await (dataClient.models as any).SplitPaymentSession.list();
  if ((allSessions || []).some((s: any) => s.groupId === groupId && (s.status === 'pending' || s.status === 'partial'))) {
    return { error: Response.json({ error: 'Active split session already exists for this group' }, { status: 409 }) };
  }

  const serviceId = (groupApts[0] as any).serviceId;
  const { data: service } = await dataClient.models.Service.get({ serviceId });
  if (!service) {
    return { error: Response.json({ error: 'Service not found' }, { status: 400 }) };
  }

  return { totalCents: dollarsToCents(service.price) };
}

async function resolveAppointmentTotalCents(appointmentId: string, dataClient: any) {
  const { data: apt } = await dataClient.models.Appointment.get({ appointmentId });
  if (!apt) {
    return { error: Response.json({ error: 'Appointment not found', details: `No appointment with id ${appointmentId}` }, { status: 404 }) };
  }

  if ((apt as any).paymentStatus === 'paid' || (apt as any).paymentId) {
    return { error: Response.json({ error: 'Appointment already paid', details: 'This appointment has already been paid' }, { status: 400 }) };
  }

  const { data: allSessions } = await (dataClient.models as any).SplitPaymentSession.list();
  if ((allSessions || []).some((s: any) => s.appointmentId === appointmentId && (s.status === 'pending' || s.status === 'partial'))) {
    return { error: Response.json({ error: 'Active split session already exists for this appointment' }, { status: 409 }) };
  }

  const { data: service } = await dataClient.models.Service.get({ serviceId: (apt as any).serviceId });
  if (!service) {
    return { error: Response.json({ error: 'Service not found' }, { status: 400 }) };
  }

  return { totalCents: dollarsToCents(service.price) };
}

async function computeScaledAllocations(
  session: any,
  payer: any,
  payerIndex: number,
  payers: any[],
  houseVendor: any,
  dataClient: any
): Promise<{ allocations?: any[]; error?: Response }> {
  const allPayerShares = payers.map((p: any) => p.amountCents);

  if (session.bundleId) {
    return computeBundleAllocations(session, payer, payerIndex, allPayerShares, houseVendor, dataClient);
  }
  if (session.groupId) {
    return computeGroupAllocations(session, payer, payerIndex, allPayerShares, houseVendor, dataClient);
  }
  if (session.appointmentId) {
    return computeAppointmentAllocations(session, payer, payerIndex, allPayerShares, houseVendor, dataClient);
  }
  return { error: Response.json({ error: 'Session has no bundleId, groupId, or appointmentId' }, { status: 500 }) };
}

async function computeBundleAllocations(
  session: any, payer: any, payerIndex: number, allPayerShares: number[], houseVendor: any, dataClient: any
) {
  const { data: bundle } = await dataClient.models.Bundle.get({ bundleId: session.bundleId });
  if (!bundle) {
    return { error: Response.json({ error: 'Bundle not found' }, { status: 500 }) };
  }

  const serviceIds = bundle.serviceIds || [];
  const services: any[] = [];
  for (const serviceId of serviceIds) {
    const { data: service } = await dataClient.models.Service.get({ serviceId });
    if (service) services.push(service);
  }

  const subtotal = services.reduce((sum: number, s: any) => sum + (s.price || 0), 0);
  const discountAmount = subtotal - bundle.price;
  const bundleSplit = calculateBundlePaymentSplit({ services, discountAmount, houseVendorId: houseVendor.vendorId });

  const allocations = scaleVendorAllocations(
    bundleSplit.bundlePayments, payer.amountCents, session.totalAmountCents, payerIndex, session.payerCount, allPayerShares
  );
  return { allocations };
}

async function computeGroupAllocations(
  session: any, payer: any, payerIndex: number, allPayerShares: number[], houseVendor: any, dataClient: any
) {
  const { data: groupApts } = await dataClient.models.Appointment.list({
    filter: { groupId: { eq: session.groupId } },
  });

  if (!groupApts || groupApts.length === 0) {
    return { error: Response.json({ error: 'Group appointments not found' }, { status: 500 }) };
  }

  const serviceId = (groupApts[0] as any).serviceId;
  const { data: service } = await dataClient.models.Service.get({ serviceId });
  if (!service) {
    return { error: Response.json({ error: 'Service not found' }, { status: 500 }) };
  }

  const assignedStaff = groupApts.map((apt: any) => ({ staffId: apt.staffId, vendorId: apt.vendorId }));
  const providerSplit = calculateMultiProviderSplit({ service, assignedStaff, houseVendorId: houseVendor.vendorId });

  const bundlePayments: any[] = [];
  if (providerSplit.houseFee > 0) {
    bundlePayments.push({ vendorId: houseVendor.vendorId, amount: providerSplit.houseFee, isHouseFee: true });
  }
  for (const share of providerSplit.providerShares) {
    bundlePayments.push({ vendorId: share.vendorId, amount: share.amount, isHouseFee: false });
  }

  const allocations = scaleVendorAllocations(
    bundlePayments, payer.amountCents, session.totalAmountCents, payerIndex, session.payerCount, allPayerShares
  );
  return { allocations };
}

async function computeAppointmentAllocations(
  session: any, payer: any, payerIndex: number, allPayerShares: number[], houseVendor: any, dataClient: any
) {
  const { data: apt } = await dataClient.models.Appointment.get({ appointmentId: session.appointmentId });
  if (!apt) {
    return { error: Response.json({ error: 'Appointment not found' }, { status: 500 }) };
  }

  const { data: service } = await dataClient.models.Service.get({ serviceId: (apt as any).serviceId });
  if (!service) {
    return { error: Response.json({ error: 'Service not found' }, { status: 500 }) };
  }

  const bundlePayments: any[] = [];
  const houseFee = (service as any).houseFeeEnabled && (service as any).houseFeeAmount > 0
    ? (service as any).houseFeeAmount
    : 0;

  if (houseFee > 0) {
    bundlePayments.push({ vendorId: houseVendor.vendorId, amount: houseFee, isHouseFee: true });
  }

  const vendorShare = service.price - houseFee;
  if (vendorShare > 0) {
    bundlePayments.push({ vendorId: (apt as any).vendorId, amount: vendorShare, isHouseFee: false });
  }

  const allocations = scaleVendorAllocations(
    bundlePayments, payer.amountCents, session.totalAmountCents, payerIndex, session.payerCount, allPayerShares
  );
  return { allocations };
}

async function updateAppointmentStatuses(session: any, paymentStatus: string, dataClient: any) {
  if (session.bundleId) {
    const { data: bundleAppointments } = await dataClient.models.Appointment.list({
      filter: { bundleId: { eq: session.bundleId } },
    });
    if (bundleAppointments?.length) {
      await Promise.all(
        bundleAppointments.map((appt: any) =>
          dataClient.models.Appointment.update({ appointmentId: appt.appointmentId, paymentStatus } as any)
        )
      );
    }
  } else if (session.groupId) {
    const { data: groupApts } = await dataClient.models.Appointment.list({
      filter: { groupId: { eq: session.groupId } },
    });
    if (groupApts?.length) {
      await Promise.all(
        groupApts.map((appt: any) =>
          dataClient.models.Appointment.update({ appointmentId: appt.appointmentId, paymentStatus } as any)
        )
      );
    }
  } else if (session.appointmentId) {
    await dataClient.models.Appointment.update({
      appointmentId: session.appointmentId,
      paymentStatus,
    } as any);
  }
}

function buildRefundAmounts(
  type: 'full' | 'partial',
  paidPayers: any[],
  refundAmountCents?: number
) {
  if (type === 'full') {
    return paidPayers.map((p: any) => ({
      payerIndex: p.payerIndex,
      refundAmountCents: p.amountCents,
      squarePaymentId: p.squarePaymentId,
    }));
  }

  const totalPaidCents = paidPayers.reduce((sum: number, p: any) => sum + p.amountCents, 0);
  const rawRefunds: { payerIndex: number; refundAmountCents: number; squarePaymentId: string }[] = [];
  let distributedCents = 0;

  for (const p of paidPayers) {
    const proportionalRefund = Math.floor(refundAmountCents! * p.amountCents / totalPaidCents);
    rawRefunds.push({ payerIndex: p.payerIndex, refundAmountCents: proportionalRefund, squarePaymentId: p.squarePaymentId });
    distributedCents += proportionalRefund;
  }

  const remainderCents = refundAmountCents! - distributedCents;
  const eligibleRefunds: typeof rawRefunds = [];
  let reallocateCents = 0;

  for (const r of rawRefunds) {
    if (r.refundAmountCents < 1) {
      reallocateCents += r.refundAmountCents;
    } else {
      eligibleRefunds.push(r);
    }
  }

  if (eligibleRefunds.length > 0) {
    eligibleRefunds[0].refundAmountCents += remainderCents + reallocateCents;
  }

  return eligibleRefunds;
}

// --- Main handlers ---

async function handleCreateSession(body: {
  action: string;
  bundleId?: string;
  groupId?: string;
  appointmentId?: string;
  splitType: 'equal' | 'custom';
  payerCount: number;
  payerAmountsCents?: number[];
}) {
  const { bundleId, groupId, appointmentId, splitType, payerCount, payerAmountsCents } = body;

  if (!splitType || !payerCount) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!bundleId && !groupId && !appointmentId) {
    return Response.json({ error: 'One of bundleId, groupId, or appointmentId is required' }, { status: 400 });
  }

  const dataClient = generateClient<Schema>();

  // Resolve total amount and optional bundle split info
  let totalCents: number;
  let bundleSplit: any = null;

  if (bundleId) {
    const result = await resolveBundleTotalCents(bundleId, dataClient);
    if (result.error) return result.error;
    totalCents = result.totalCents!;
    bundleSplit = result.bundleSplit;
  } else if (groupId) {
    const result = await resolveGroupTotalCents(groupId, dataClient);
    if (result.error) return result.error;
    totalCents = result.totalCents!;
  } else {
    const result = await resolveAppointmentTotalCents(appointmentId!, dataClient);
    if (result.error) return result.error;
    totalCents = result.totalCents!;
  }

  // Calculate payer amounts
  let payerAmounts: number[];

  if (splitType === 'equal') {
    payerAmounts = calculateEqualSplit({ totalCents, payerCount }).payerAmounts;
  } else {
    if (!payerAmountsCents || payerAmountsCents.length !== payerCount) {
      return Response.json(
        { error: 'Payer amounts do not sum to total', details: 'payerAmountsCents must be provided with length equal to payerCount for custom splits' },
        { status: 400 }
      );
    }

    const validation = validateCustomSplit({ totalCents, payerAmountsCents });
    if (!validation.valid) {
      if (validation.error?.includes('below the minimum')) {
        return Response.json({ error: 'Amount below Square minimum', minAmount: 50 }, { status: 400 });
      }
      return Response.json({ error: 'Payer amounts do not sum to total', details: validation.error }, { status: 400 });
    }

    payerAmounts = payerAmountsCents;
  }

  // For bundle splits, validate vendor distribution minimums
  if (bundleSplit?.bundlePayments.length) {
    const minPayerAmount = Math.min(...payerAmounts);
    if (minPayerAmount < bundleSplit.bundlePayments.length) {
      return Response.json({ error: 'Minimum payment too low for vendor distribution' }, { status: 400 });
    }
  }

  // Create payer records and persist session
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

  const sessionId = randomUUID();

  await (dataClient.models as any).SplitPaymentSession.create({
    sessionId,
    bundleId: bundleId || null,
    groupId: groupId || null,
    appointmentId: appointmentId || null,
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
    if (session.status === 'pending' || session.status === 'partial') {
      try {
        await (dataClient.models as any).SplitPaymentSession.update({ sessionId, status: 'expired' });
      } catch (err) {
        console.error('Failed to update session to expired:', err);
      }
    }
    return Response.json({ error: 'Split payment session expired' }, { status: 410 });
  }

  // 3. Validate payerIndex
  if (!Number.isInteger(payerIndex) || payerIndex < 0 || payerIndex >= session.payerCount) {
    return Response.json({ error: 'Invalid payer index' }, { status: 400 });
  }

  // 4. Parse payers and validate payer status
  const payers = typeof session.payers === 'string' ? JSON.parse(session.payers) : session.payers;
  const payer = payers[payerIndex];

  if (payer.status === 'paid') {
    return Response.json({ error: 'Payer has already completed payment' }, { status: 409 });
  }

  // 5. Validate sourceId
  if (!sourceId?.trim()) {
    return Response.json({ error: 'Missing card nonce' }, { status: 400 });
  }

  // 6. Validate amount matches stored session amount (if provided)
  if (amountCents !== undefined && amountCents !== payer.amountCents) {
    return Response.json({ error: 'Amount mismatch with stored session' }, { status: 400 });
  }

  // 7. Get house vendor
  const { data: vendors } = await dataClient.models.Vendor.list();
  const houseVendor = (vendors || []).find((v: any) => v.isHouse);
  if (!houseVendor) {
    return Response.json({ error: 'House vendor not configured' }, { status: 500 });
  }

  // 8. Compute vendor allocations
  const allocationResult = await computeScaledAllocations(session, payer, payerIndex, payers, houseVendor, dataClient);
  if (allocationResult.error) return allocationResult.error;
  const scaledAllocations = allocationResult.allocations!;

  // 9. Build Square payment request
  const otherAllocations = scaledAllocations.filter(
    (a) => a.vendorId !== houseVendor.vendorId && a.amountCents > 0
  );

  const additionalRecipients: any[] = [];
  for (const allocation of otherAllocations) {
    const { data: vendor } = await dataClient.models.Vendor.get({ vendorId: allocation.vendorId });
    if (vendor?.squareLocationId) {
      additionalRecipients.push({
        locationId: vendor.squareLocationId,
        amountMoney: { amount: BigInt(allocation.amountCents), currency: 'USD' },
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
      amountMoney: { amount: BigInt(payer.amountCents), currency: 'USD' },
      locationId: houseVendor.squareLocationId,
      additionalRecipients: additionalRecipients.length > 0 ? additionalRecipients : undefined,
    };

    const { result } = await client.paymentsApi.createPayment(paymentRequest);
    const squarePaymentId = result.payment?.id;

    // 11. Update payer status in session
    const now = new Date().toISOString();
    payers[payerIndex] = { ...payers[payerIndex], status: 'paid', squarePaymentId: squarePaymentId || null, paidAt: now };

    const paidCount = payers.filter((p: any) => p.status === 'paid').length;
    const allPaid = paidCount === session.payerCount;
    const newSessionStatus = allPaid ? 'completed' : 'partial';

    try {
      await (dataClient.models as any).SplitPaymentSession.update({
        sessionId,
        payers: JSON.stringify(payers),
        status: newSessionStatus,
      });

      const appointmentPaymentStatus = allPaid ? 'paid' : 'partial';
      await updateAppointmentStatuses(session, appointmentPaymentStatus, dataClient);
    } catch (updateError: any) {
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
    console.error('Square API error (split payer payment):', JSON.stringify(error, null, 2));
    const details = error?.errors?.[0]?.detail || error?.message || 'Unknown Square error';
    return Response.json({ error: 'Payment processing failed', details }, { status: 502 });
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
    bundleId: session.bundleId || null,
    groupId: session.groupId || null,
    appointmentId: session.appointmentId || null,
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

  if (type !== 'full' && type !== 'partial') {
    return Response.json({ error: 'Missing or invalid refund type' }, { status: 400 });
  }

  if (type === 'partial' && (refundAmountCents === undefined || refundAmountCents === null)) {
    return Response.json({ error: 'Missing refundAmountCents for partial refund' }, { status: 400 });
  }

  const dataClient = generateClient<Schema>();

  const { data: session } = await (dataClient.models as any).SplitPaymentSession.get({ sessionId });
  if (!session) {
    return Response.json({ error: 'Split payment session not found' }, { status: 404 });
  }

  const payers = typeof session.payers === 'string' ? JSON.parse(session.payers) : session.payers;
  const paidPayers = payers.filter((p: any) => p.status === 'paid');

  if (paidPayers.length === 0) {
    return Response.json({ error: 'No paid payers to refund' }, { status: 400 });
  }

  const payerRefunds = buildRefundAmounts(type, paidPayers, refundAmountCents);

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

  const results: { payerIndex: number; success: boolean; refundedAmountCents?: number; error?: string }[] = [];

  for (const refund of payerRefunds) {
    try {
      await client.refundsApi.refundPayment({
        idempotencyKey: `${sessionId}-refund-${refund.payerIndex}`,
        paymentId: refund.squarePaymentId,
        amountMoney: { amount: BigInt(refund.refundAmountCents), currency: 'USD' },
        reason: 'Split payment refund',
      });
      results.push({ payerIndex: refund.payerIndex, success: true, refundedAmountCents: refund.refundAmountCents });
    } catch (error: any) {
      const details = error?.errors?.[0]?.detail || error?.message || 'Unknown refund error';
      results.push({ payerIndex: refund.payerIndex, success: false, error: details });
    }
  }

  const allSucceeded = results.every((r) => r.success);
  const sessionStatus = allSucceeded ? 'refunded' : 'partially_refunded';

  try {
    await (dataClient.models as any).SplitPaymentSession.update({ sessionId, status: sessionStatus });
  } catch (updateError: any) {
    console.error(
      `Failed to update session status to "${sessionStatus}" after refund. SessionId: ${sessionId}. Manual reconciliation required.`,
      updateError
    );
  }

  return Response.json({ success: allSucceeded, sessionStatus, results });
}
