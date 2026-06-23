'use client'

import { useMemo } from 'react'
import { groupAppointmentsByStaff, orderStaffColumns, generateTimeSlots } from '../../utils/calendar'
import StaffColumn from './StaffColumn'

/**
 * MultiStaffView — Top-level component for the "Everyone" multi-staff day view.
 *
 * Groups appointments by staffId, orders staff columns by vendor then resources,
 * and renders a shared time labels column (sticky left) alongside horizontally
 * scrollable staff columns.
 *
 * @param {Object} props
 * @param {Date} props.date - The selected day
 * @param {Array} props.allStaff - StaffSchedule[] - active staff list
 * @param {Array} props.appointments - Appointment[] - all appointments for the day (all staff)
 * @param {number} props.startHour - Grid start hour
 * @param {number} props.endHour - Grid end hour
 * @param {Function} props.onAppointmentClick - (appointment) => void
 * @param {Function} props.onSlotClick - (dateTime, staffId) => void
 * @param {Array} props.vendors - Vendor[] - for column ordering
 * @param {Function} props.TimeBlockColumn - The TimeBlockColumn component to render within each column
 */
export default function MultiStaffView({
  date,
  allStaff,
  appointments,
  startHour,
  endHour,
  onAppointmentClick,
  onSlotClick,
  vendors,
  TimeBlockColumn,
}) {
  // Handle empty state
  if (!allStaff || allStaff.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-light)' }}>
        No active staff found.
      </div>
    )
  }

  // Group appointments by staff
  const groupedAppointments = useMemo(
    () => groupAppointmentsByStaff(appointments || [], allStaff),
    [appointments, allStaff]
  )

  // Order staff columns: staff grouped by vendor, then resources
  const orderedStaff = useMemo(
    () => orderStaffColumns(allStaff, vendors || []),
    [allStaff, vendors]
  )

  // Generate time slots for the time labels column
  const timeSlots = useMemo(
    () => generateTimeSlots(startHour, endHour),
    [startHour, endHour]
  )

  return (
    <div
      className="multi-staff-view"
      style={{
        display: 'flex',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        overflowX: 'auto',
        maxWidth: '100%',
      }}
    >
      {/* Time labels column — sticky left */}
      <div
        className="multi-staff-time-labels"
        style={{
          width: '60px',
          minWidth: '60px',
          flexShrink: 0,
          background: 'var(--color-accent)',
          position: 'sticky',
          left: 0,
          zIndex: 10,
        }}
      >
        {/* Header spacer to align with staff name headers */}
        <div
          style={{
            height: '36px',
            borderBottom: '1px solid var(--color-border)',
          }}
        />
        {/* Time labels */}
        {timeSlots.map((slot, i) => (
          <div
            key={i}
            style={{
              height: '40px',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              paddingRight: '8px',
              paddingTop: '2px',
              fontSize: '0.7rem',
              color: 'var(--color-text-light)',
              borderBottom: slot.minute === 0
                ? '1px solid var(--color-border)'
                : '1px dashed rgba(0,0,0,0.06)',
            }}
          >
            {slot.minute === 0
              ? `${slot.hour === 0 ? 12 : slot.hour > 12 ? slot.hour - 12 : slot.hour}:00 ${slot.hour < 12 ? 'AM' : 'PM'}`
              : `${slot.hour === 0 ? 12 : slot.hour > 12 ? slot.hour - 12 : slot.hour}:30 ${slot.hour < 12 ? 'AM' : 'PM'}`}
          </div>
        ))}
      </div>

      {/* Staff columns container */}
      <div
        className="multi-staff-columns"
        style={{
          display: 'flex',
          flex: 1,
        }}
      >
        {orderedStaff.map((staff) => (
          <StaffColumn
            key={staff.visibleId}
            staff={staff}
            date={date}
            appointments={groupedAppointments.get(staff.visibleId) || []}
            startHour={startHour}
            endHour={endHour}
            onAppointmentClick={onAppointmentClick}
            onSlotClick={onSlotClick}
            TimeBlockColumn={TimeBlockColumn}
          />
        ))}
      </div>
    </div>
  )
}
