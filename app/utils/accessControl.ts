/**
 * Access Control Module
 *
 * Enforces the two-role (Admin/Staff) permission model for the unified business platform.
 * Admin users have unrestricted access to all actions.
 * Staff users have limited access — they can manage calendars, bookings, clients, and
 * edit prices, but cannot create/delete services, manage staff, or change site settings.
 */

export type Role = 'admin' | 'staff';

export type Action =
  | 'create_service'
  | 'edit_service'
  | 'delete_service'
  | 'edit_price'
  | 'manage_staff'
  | 'manage_settings'
  | 'view_calendar'
  | 'edit_calendar'
  | 'book_appointment'
  | 'manage_clients'
  | 'view_reports';

export interface Service {
  serviceId: string;
  name: string;
  allowedStaff: string[] | null;
  [key: string]: unknown;
}

export interface ServiceAuthorization {
  canUpdate: boolean;
  canDelete: boolean;
}

/**
 * Actions explicitly denied for the Staff role.
 * All other defined actions are permitted for Staff.
 */
const STAFF_DENIED_ACTIONS: ReadonlySet<Action> = new Set([
  'create_service',
  'delete_service',
  'manage_staff',
  'manage_settings',
]);

/**
 * Determines whether a user with the given role is authorized to perform the specified action.
 *
 * - Admin: all actions are permitted.
 * - Staff: denied for service creation/deletion, staff management, and site settings.
 *          Allowed for calendar access, booking, client management, price editing, and reports.
 *
 * @param role - The user's role ('admin' or 'staff')
 * @param action - The action being attempted
 * @returns true if the action is permitted, false otherwise
 */
export function isAuthorized(role: Role, action: Action): boolean {
  if (role === 'admin') {
    return true;
  }

  // Staff role: deny specific restricted actions
  return !STAFF_DENIED_ACTIONS.has(action);
}

/**
 * Determines a user's authorization to update or delete a specific service.
 *
 * - Admin: can update and delete any service.
 * - Staff: can update a service only if their staffId is in `allowedStaff`
 *          or if `allowedStaff` is null/empty (meaning "all staff").
 *          Staff cannot delete services regardless of assignment.
 *
 * @param role - The user's role ('admin' or 'staff')
 * @param staffId - The staff member's ID
 * @param service - The service record to check authorization against
 * @returns Object with canUpdate and canDelete booleans
 */
export function getServiceAuthorization(
  role: Role,
  staffId: string,
  service: Service
): ServiceAuthorization {
  if (role === 'admin') {
    return { canUpdate: true, canDelete: true };
  }

  // Staff role: cannot delete any service
  const canDelete = false;

  // Staff can update if allowedStaff is null/empty (all staff) or their ID is listed
  const allowedStaff = service.allowedStaff;
  const canUpdate =
    allowedStaff === null ||
    allowedStaff === undefined ||
    allowedStaff.length === 0 ||
    allowedStaff.includes(staffId);

  return { canUpdate, canDelete };
}
