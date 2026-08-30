/**
 * Scheduling Domain Logger
 *
 * Provides type-safe, pre-tagged logging functions for scheduling operations:
 * schedule changes, staff assignments, assignment failures, and schedule deletions.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { Logger, createConfigFromEnv } from '../logger';
import type { LogContext } from '../types';

// ---------------------------------------------------------------------------
// Detail interfaces
// ---------------------------------------------------------------------------

export interface ScheduleChangeDetails {
  staffId: string;
  vendorId: string;
  changeType: 'created' | 'updated';
  startDate: string;
  endDate: string;
}

export interface StaffAssignmentDetails {
  appointmentId: string;
  staffId: string;
  vendorId: string;
  eligibleCandidatesCount: string;
  assignmentRuleName: string;
}

export interface AssignmentFailureDetails {
  vendorId: string;
  serviceId: string;
  requestedDateTime: string;
  eligibleCandidatesCount: string;
  unavailableReason: string;
}

export interface ScheduleDeletedDetails {
  staffId: string;
  vendorId: string;
  startDate: string;
  endDate: string;
}

// ---------------------------------------------------------------------------
// Module-level logger instance
// ---------------------------------------------------------------------------

const logger = new Logger(createConfigFromEnv());

// ---------------------------------------------------------------------------
// Domain logging functions
// ---------------------------------------------------------------------------

/**
 * Log a staff schedule creation or update event.
 * Severity: info | Domain: scheduling
 *
 * Requirement 9.1
 */
export function logScheduleChange(details: ScheduleChangeDetails): void {
  const context: LogContext = {
    staffId: details.staffId,
    vendorId: details.vendorId,
    changeType: details.changeType,
    startDate: details.startDate,
    endDate: details.endDate,
  };

  logger.info('scheduling', 'Staff schedule changed', context);
}

/**
 * Log a successful staff auto-assignment event.
 * Severity: info | Domain: scheduling
 *
 * Requirement 9.2
 */
export function logStaffAssignment(details: StaffAssignmentDetails): void {
  const context: LogContext = {
    appointmentId: details.appointmentId,
    staffId: details.staffId,
    vendorId: details.vendorId,
    eligibleCandidatesCount: details.eligibleCandidatesCount,
    assignmentRuleName: details.assignmentRuleName,
  };

  logger.info('scheduling', 'Staff auto-assignment completed', context);
}

/**
 * Log a staff auto-assignment failure event.
 * Severity: warn | Domain: scheduling
 *
 * Requirement 9.3
 */
export function logAssignmentFailure(details: AssignmentFailureDetails): void {
  const context: LogContext = {
    vendorId: details.vendorId,
    serviceId: details.serviceId,
    requestedDateTime: details.requestedDateTime,
    eligibleCandidatesCount: details.eligibleCandidatesCount,
    unavailableReason: details.unavailableReason,
  };

  logger.warn('scheduling', 'Staff auto-assignment failed: no eligible provider', context);
}

/**
 * Log a staff schedule deletion event.
 * Severity: info | Domain: scheduling
 *
 * Requirement 9.4
 */
export function logScheduleDeleted(details: ScheduleDeletedDetails): void {
  const context: LogContext = {
    staffId: details.staffId,
    vendorId: details.vendorId,
    startDate: details.startDate,
    endDate: details.endDate,
  };

  logger.info('scheduling', 'Staff schedule deleted', context);
}
