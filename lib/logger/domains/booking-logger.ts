/**
 * Booking Domain Logger
 *
 * Provides type-safe, pre-tagged logging functions for booking operations:
 * appointment creation, scheduling conflicts, cancellations, reschedules, and rejections.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { Logger, createConfigFromEnv } from '../logger';
import type { LogContext } from '../types';

// ---------------------------------------------------------------------------
// Detail interfaces
// ---------------------------------------------------------------------------

export interface AppointmentCreatedDetails {
  appointmentId: string;
  vendorId: string;
  serviceId: string;
  staffId: string;
  clientId: string;
  dateTime: string;
}

export interface ConflictDetails {
  proposedAppointmentId: string;
  conflictingAppointmentId: string;
  overlapStart: string;
  overlapEnd: string;
  staffId: string;
  confirmOverlap: boolean;
}

export interface CancellationDetails {
  appointmentId: string;
  dateTime: string;
  actor: 'customer' | 'staff' | 'admin';
}

export interface RescheduleDetails {
  appointmentId: string;
  previousDateTime: string;
  newDateTime: string;
  previousStaffId: string;
  newStaffId?: string;
  actor: 'customer' | 'staff' | 'admin';
}

export interface RejectionDetails {
  vendorId: string;
  staffId: string;
  requestedDateTime: string;
  serviceId: string;
  rejectionReason: string;
}

// ---------------------------------------------------------------------------
// Module-level logger instance
// ---------------------------------------------------------------------------

const logger = new Logger(createConfigFromEnv());

// ---------------------------------------------------------------------------
// Domain logging functions
// ---------------------------------------------------------------------------

/**
 * Log an appointment creation event.
 * Severity: info | Domain: booking
 *
 * Requirement 8.1
 */
export function logAppointmentCreated(details: AppointmentCreatedDetails): void {
  const context: LogContext = {
    appointmentId: details.appointmentId,
    vendorId: details.vendorId,
    serviceId: details.serviceId,
    staffId: details.staffId,
    clientId: details.clientId,
    dateTime: details.dateTime,
  };

  logger.info('booking', 'Appointment created', context);
}

/**
 * Log a scheduling conflict detection event.
 * Severity: warn | Domain: booking
 *
 * Requirement 8.2
 */
export function logSchedulingConflict(details: ConflictDetails): void {
  const context: LogContext = {
    proposedAppointmentId: details.proposedAppointmentId,
    conflictingAppointmentId: details.conflictingAppointmentId,
    overlapStart: details.overlapStart,
    overlapEnd: details.overlapEnd,
    staffId: details.staffId,
    confirmOverlap: String(details.confirmOverlap),
  };

  logger.warn('booking', 'Scheduling conflict detected', context);
}

/**
 * Log an appointment cancellation event.
 * Severity: info | Domain: booking
 *
 * Requirement 8.3
 */
export function logAppointmentCancelled(details: CancellationDetails): void {
  const context: LogContext = {
    appointmentId: details.appointmentId,
    dateTime: details.dateTime,
    actor: details.actor,
  };

  logger.info('booking', 'Appointment cancelled', context);
}

/**
 * Log an appointment reschedule event.
 * Severity: info | Domain: booking
 *
 * Requirement 8.4
 */
export function logAppointmentRescheduled(details: RescheduleDetails): void {
  const context: LogContext = {
    appointmentId: details.appointmentId,
    previousDateTime: details.previousDateTime,
    newDateTime: details.newDateTime,
    previousStaffId: details.previousStaffId,
    actor: details.actor,
  };

  if (details.newStaffId) {
    context.newStaffId = details.newStaffId;
  }

  logger.info('booking', 'Appointment rescheduled', context);
}

/**
 * Log a booking rejection event.
 * Severity: warn | Domain: booking
 *
 * Requirement 8.5
 */
export function logBookingRejected(details: RejectionDetails): void {
  const context: LogContext = {
    vendorId: details.vendorId,
    staffId: details.staffId,
    requestedDateTime: details.requestedDateTime,
    serviceId: details.serviceId,
    rejectionReason: details.rejectionReason,
  };

  logger.warn('booking', 'Booking rejected', context);
}
