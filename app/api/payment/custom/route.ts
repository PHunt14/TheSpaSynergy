import { randomUUID } from 'node:crypto';
import { Client, Environment } from 'square';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json';
import { Amplify } from 'aws-amplify';
import {
  sanitizeNumericInput,
  validateCustomChargeAmount,
  validateTipAmount,
  dollarsToCents,
} from '../../../../lib/payment/validator';
import { generateIdempotencyKey, hashSourceToken } from '../../../../lib/payment/idempotency';
import { appendAuditRecord, buildAuditRecord } from '../../../../lib/payment/audit';
import { hasValidCredentials } from '../../../utils/paymentRouting';
import { isTokenExpiringSoon, refreshSquareToken } from '../../../../lib/square-token-enhanced';

Amplify.configure(config, { ssr: true });

/**
 * POST /api/payment/custom
 *
 * Processes a custom amount charge through the house provider's Square account.
 * Custom charges are ad-hoc payments not tied to an appointment.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.7, 3.8, 4.3, 4.4, 4.5, 5.1, 8.2
 */
export async function POST(request: Request) {
  let auditAppointmentId: string | undefined;

  try {
    const body = await request.json();
    const { sourceId, amount, description, clientName, tipAmount } = body;

    // --- Validation ---

    // 1. sourceId must be present
    if (!sourceId || typeof sourceId !== 'string' || sourceId.trim() === '') {
      return Response.json(
        { success: false, error: 'Missing payment source' },
        { status: 400 }
      );
    }

    // 2. Sanitize and validate amount (Requirement 4.5)
    const sanitizedAmount = sanitizeNumericInput(amount);
    if (sanitizedAmount === null) {
      return Response.json(
        { success: false, error: 'Invalid payment amount' },
        { status: 400 }
      );
    }

    // 3. Validate custom charge amount range and decimal places (Requirement 3.3)
    const amountValidation = validateCustomChargeAmount(sanitizedAmount);
    if (!amountValidation.valid) {
      return Response.json(
        { success: false, error: amountValidation.error!.message },
        { status: 400 }
      );
    }

    // 4. Validate description: present, string, 3–200 chars (Requirement 3.5)
    if (!description || typeof description !== 'string') {
      return Response.json(
        { success: false, error: 'Description is required' },
        { status: 400 }
      );
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 3) {
      return Response.json(
        { success: false, error: 'Description must be at least 3 characters' },
        { status: 400 }
      );
    }
    if (trimmedDescription.length > 200) {
      return Response.json(
        { success: false, error: 'Description cannot exceed 200 characters' },
        { status: 400 }
      );
    }

    // 5. Validate clientName if provided: string, ≤100 chars
    let validatedClientName: string | undefined;
    if (clientName !== undefined && clientName !== null && clientName !== '') {
      if (typeof clientName !== 'string') {
        return Response.json(
          { success: false, error: 'Client name must be a string' },
          { status: 400 }
        );
      }
      if (clientName.length > 100) {
        return Response.json(
          { success: false, error: 'Client name cannot exceed 100 characters' },
          { status: 400 }
        );
      }
      validatedClientName = clientName;
    }

    // 6. Validate tipAmount if provided (Requirements 3.7, 4.4, 4.5)
    let validatedTip = 0;
    if (tipAmount !== undefined && tipAmount !== null) {
      const sanitizedTip = sanitizeNumericInput(tipAmount);
      if (sanitizedTip === null) {
        return Response.json(
          { success: false, error: 'Invalid tip amount' },
          { status: 400 }
        );
      }
      const tipValidation = validateTipAmount(sanitizedTip, sanitizedAmount);
      if (!tipValidation.valid) {
        return Response.json(
          { success: false, error: tipValidation.error!.message },
          { status: 400 }
        );
      }
      validatedTip = sanitizedTip;
    }

    // --- Resolve house provider credentials (Requirements 3.4, 3.8) ---

    const dataClient = generateClient<Schema>();
    const { data: vendors } = await (dataClient.models as any).Vendor.list();
    const houseProvider = (vendors || []).find((v: any) => v.isHouse === true);

    if (!houseProvider) {
      return Response.json(
        { success: false, error: 'House payment account not configured' },
        { status: 400 }
      );
    }

    if (!hasValidCredentials(houseProvider)) {
      return Response.json(
        { success: false, error: 'House payment account not configured' },
        { status: 400 }
      );
    }

    // --- Token refresh if expiring (Requirement 6.1) ---

    let accessToken = houseProvider.squareAccessToken!;
    let locationId = houseProvider.squareLocationId!;

    if (isTokenExpiringSoon(houseProvider.squareTokenExpiresAt)) {
      // Try connected staff on house vendor first
      const { data: houseStaffList } = await (dataClient.models as any).StaffSchedule.listStaffScheduleByVendorId({
        vendorId: houseProvider.vendorId,
      });
      const connectedHouseStaff = (houseStaffList || []).find(
        (s: any) =>
          s.isActive !== false &&
          s.squareAccessToken &&
          s.squareLocationId &&
          s.squareOAuthStatus === 'connected'
      );

      if (connectedHouseStaff) {
        const refreshResult = await refreshSquareToken(connectedHouseStaff.visibleId);
        if (refreshResult.success && refreshResult.newAccessToken) {
          // Re-fetch staff for updated creds
          const { data: refreshedStaff } = await (dataClient.models as any).StaffSchedule.get({
            visibleId: connectedHouseStaff.visibleId,
          });
          if (refreshedStaff?.squareAccessToken && refreshedStaff?.squareLocationId) {
            accessToken = refreshedStaff.squareAccessToken;
            locationId = refreshedStaff.squareLocationId;
          }
        }
      }
      // If staff refresh didn't produce new creds, proceed with vendor-level credentials
      // (they may still be valid even if expiring soon — Requirement 6.3)
    }

    // --- Generate idempotency key (Requirement 5.1) ---

    const customChargeSessionId = randomUUID();
    auditAppointmentId = customChargeSessionId;
    const sourceTokenHash = hashSourceToken(sourceId);
    const idempotencyKey = generateIdempotencyKey(customChargeSessionId, 'custom', sourceTokenHash);

    // --- Process payment through Square (Requirement 3.4) ---

    const squareEnvironment =
      process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox;

    const client = new Client({
      accessToken,
      environment: squareEnvironment,
    });

    const amountCents = dollarsToCents(sanitizedAmount);

    const paymentRequest: any = {
      sourceId,
      idempotencyKey,
      amountMoney: {
        amount: BigInt(amountCents),
        currency: 'USD',
      },
      locationId,
      note: trimmedDescription,
    };

    if (validatedTip > 0) {
      paymentRequest.tipMoney = {
        amount: BigInt(dollarsToCents(validatedTip)),
        currency: 'USD',
      };
    }

    const { result } = await client.paymentsApi.createPayment(paymentRequest);
    const paymentId = result.payment?.id || '';

    // --- Persist audit record (Requirement 8.2) ---

    const auditRecord = buildAuditRecord({
      type: 'success',
      staffPaymentId: paymentId,
      staffAmount: sanitizedAmount,
      tipAmount: validatedTip,
      routingMethod: 'house',
      credentialResolutionPath: ['house:resolved'],
      description: trimmedDescription,
      clientName: validatedClientName,
      idempotencyKey,
    });

    await appendAuditRecord(customChargeSessionId, auditRecord);

    // --- Return success ---

    return Response.json({
      success: true,
      paymentId,
    } as { success: boolean; paymentId: string });
  } catch (error: any) {
    console.error('Custom charge error:', error);

    // Attempt to persist failure audit record
    if (auditAppointmentId) {
      try {
        const failureRecord = buildAuditRecord({
          type: 'failure',
          routingMethod: 'house',
          credentialResolutionPath: ['house:resolved'],
          failureReason: error?.errors?.[0]?.detail || error?.message || 'Unknown error',
          attemptedAmountCents: undefined,
          credentialSource: 'house_provider',
          idempotencyKey: undefined,
        });
        await appendAuditRecord(auditAppointmentId, failureRecord);
      } catch (auditError) {
        console.error('Failed to persist audit record for custom charge failure:', auditError);
      }
    }

    // Sanitize error for client (Requirement 7.4 — never expose raw Square errors)
    const sanitizedError =
      error?.errors?.[0]?.category === 'PAYMENT_METHOD_ERROR'
        ? 'Card declined — please try a different card'
        : 'Payment processing failed';

    return Response.json(
      { success: false, error: sanitizedError, details: 'Please try again or contact support' },
      { status: 500 }
    );
  }
}
