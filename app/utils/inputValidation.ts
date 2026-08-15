/**
 * Input Validation for Booking Endpoints
 *
 * Shared validation logic for POST /api/appointments, POST /api/appointments/manual,
 * and PATCH /api/appointments. Validates fields before any business logic executes.
 *
 * Requirements: 11.1
 */

export interface ValidationError {
  field: string;
  reason: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * ID format: alphanumeric characters and dashes, non-empty
 */
const ID_PATTERN = /^[a-zA-Z0-9\-]+$/;

/**
 * DateTime format: YYYY-MM-DDTHH:MM (ISO 8601 without seconds)
 * Also accepts YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM:00 variants for flexibility
 */
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/**
 * Validates a dateTime string:
 * - Must match ISO 8601 format YYYY-MM-DDTHH:MM (optionally with :SS)
 * - Must represent a valid date/time
 * - Must be in the future
 */
export function validateDateTime(dateTime: unknown): string | null {
  if (dateTime === undefined || dateTime === null) {
    return null; // not provided — skip (caller decides if required)
  }

  if (typeof dateTime !== 'string') {
    return 'Must be a string in ISO 8601 format (YYYY-MM-DDTHH:MM)';
  }

  if (!DATETIME_PATTERN.test(dateTime)) {
    return 'Must be in ISO 8601 format (YYYY-MM-DDTHH:MM)';
  }

  // Validate it parses to a real date
  const parsed = new Date(dateTime);
  if (isNaN(parsed.getTime())) {
    return 'Invalid date/time value';
  }

  // Must be in the future
  if (parsed.getTime() <= Date.now()) {
    return 'Must be a future date and time';
  }

  return null;
}

/**
 * Validates a duration value:
 * - Must be a positive integer
 * - Must be between 1 and 480 (minutes)
 */
export function validateDuration(duration: unknown): string | null {
  if (duration === undefined || duration === null) {
    return null; // not provided — skip
  }

  if (typeof duration !== 'number' || !Number.isInteger(duration)) {
    return 'Must be a positive integer';
  }

  if (duration < 1 || duration > 480) {
    return 'Must be between 1 and 480 minutes';
  }

  return null;
}

/**
 * Validates an ID field (staffId, vendorId, serviceId):
 * - Must be a non-empty string
 * - Must match expected ID format (alphanumeric + dashes)
 */
export function validateId(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null; // not provided — skip
  }

  if (typeof value !== 'string') {
    return `${fieldName} must be a non-empty string`;
  }

  if (value.trim().length === 0) {
    return `${fieldName} must not be empty`;
  }

  if (!ID_PATTERN.test(value)) {
    return `${fieldName} must contain only alphanumeric characters and dashes`;
  }

  return null;
}

/**
 * Validates customer name:
 * - Must be a string
 * - Must be 100 characters or fewer
 */
export function validateCustomerName(name: unknown): string | null {
  if (name === undefined || name === null) {
    return null; // not provided — skip
  }

  if (typeof name !== 'string') {
    return 'Must be a string';
  }

  if (name.length > 100) {
    return 'Must be 100 characters or fewer';
  }

  return null;
}

/**
 * Validates customer notes:
 * - Must be a string
 * - Must be 500 characters or fewer
 */
export function validateCustomerNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null) {
    return null; // not provided — skip
  }

  if (typeof notes !== 'string') {
    return 'Must be a string';
  }

  if (notes.length > 500) {
    return 'Must be 500 characters or fewer';
  }

  return null;
}

/**
 * Validates booking request fields for POST /api/appointments (customer booking).
 * Returns a ValidationResult with any errors keyed by field name.
 */
export function validateCustomerBookingInput(body: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};

  // dateTime is required for customer bookings
  if (!body.dateTime) {
    errors.dateTime = 'dateTime is required';
  } else {
    const dtError = validateDateTime(body.dateTime);
    if (dtError) errors.dateTime = dtError;
  }

  // serviceId is required
  if (!body.serviceId) {
    errors.serviceId = 'serviceId is required';
  } else {
    const idError = validateId(body.serviceId, 'serviceId');
    if (idError) errors.serviceId = idError;
  }

  // staffId (optional but must be valid if provided)
  const staffIdError = validateId(body.staffId, 'staffId');
  if (staffIdError) errors.staffId = staffIdError;

  // vendorId (optional but must be valid if provided)
  const vendorIdError = validateId(body.vendorId, 'vendorId');
  if (vendorIdError) errors.vendorId = vendorIdError;

  // customer fields
  if (body.customer && typeof body.customer === 'object') {
    const customer = body.customer as Record<string, unknown>;
    const nameError = validateCustomerName(customer.name);
    if (nameError) errors['customer.name'] = nameError;

    const notesError = validateCustomerNotes(customer.notes);
    if (notesError) errors['customer.notes'] = notesError;
  }

  // duration (optional — service lookup provides it, but validate if sent)
  const durationError = validateDuration(body.duration);
  if (durationError) errors.duration = durationError;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates booking request fields for POST /api/appointments/manual.
 * Returns a ValidationResult with any errors keyed by field name.
 */
export function validateManualBookingInput(body: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};

  // vendorId is required for manual bookings
  if (!body.vendorId) {
    errors.vendorId = 'vendorId is required';
  } else {
    const idError = validateId(body.vendorId, 'vendorId');
    if (idError) errors.vendorId = idError;
  }

  // dateTime is required
  if (!body.dateTime) {
    errors.dateTime = 'dateTime is required';
  } else {
    const dtError = validateDateTime(body.dateTime);
    if (dtError) errors.dateTime = dtError;
  }

  // staffId (optional but must be valid if provided)
  const staffIdError = validateId(body.staffId, 'staffId');
  if (staffIdError) errors.staffId = staffIdError;

  // serviceId (optional for manual — can be 'manual' or 'blocked')
  if (body.serviceId && body.serviceId !== 'manual' && body.serviceId !== 'blocked') {
    const idError = validateId(body.serviceId, 'serviceId');
    if (idError) errors.serviceId = idError;
  }

  // duration (optional but validate if provided)
  const durationError = validateDuration(body.duration);
  if (durationError) errors.duration = durationError;

  // Customer name (from customerName field for manual bookings)
  const nameError = validateCustomerName(body.customerName);
  if (nameError) errors.customerName = nameError;

  // Notes
  const notesError = validateCustomerNotes(body.notes);
  if (notesError) errors.notes = notesError;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates booking request fields for PATCH /api/appointments (edit/reschedule).
 * Returns a ValidationResult with any errors keyed by field name.
 */
export function validateAppointmentUpdateInput(body: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {};

  // appointmentId is required
  if (!body.appointmentId) {
    errors.appointmentId = 'appointmentId is required';
  } else {
    const idError = validateId(body.appointmentId, 'appointmentId');
    if (idError) errors.appointmentId = idError;
  }

  // dateTime (optional for PATCH, but validate if provided)
  if (body.dateTime !== undefined) {
    const dtError = validateDateTime(body.dateTime);
    if (dtError) errors.dateTime = dtError;
  }

  // staffId (optional but validate if provided)
  const staffIdError = validateId(body.staffId, 'staffId');
  if (staffIdError) errors.staffId = staffIdError;

  // vendorId (optional but validate if provided)
  const vendorIdError = validateId(body.vendorId, 'vendorId');
  if (vendorIdError) errors.vendorId = vendorIdError;

  // serviceId (optional but validate if provided)
  if (body.serviceId && body.serviceId !== 'manual' && body.serviceId !== 'blocked') {
    const idError = validateId(body.serviceId, 'serviceId');
    if (idError) errors.serviceId = idError;
  }

  // customer fields (if provided)
  if (body.customer && typeof body.customer === 'object') {
    const customer = body.customer as Record<string, unknown>;
    const nameError = validateCustomerName(customer.name);
    if (nameError) errors['customer.name'] = nameError;

    const notesError = validateCustomerNotes(customer.notes);
    if (notesError) errors['customer.notes'] = notesError;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Returns a structured HTTP 400 response body for validation failures.
 * No internal schema details are exposed.
 */
export function buildValidationErrorResponse(errors: Record<string, string>) {
  return {
    error: 'Validation failed',
    fields: errors,
  };
}
