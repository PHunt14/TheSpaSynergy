'use client'

import { useMemo } from 'react'
import { getWorkingHoursForStaff } from '../../utils/calendar'

/**
 * StaffColumn — A single staff member's column within the multi-staff view.
 *
 * Renders the staff name as a header, computes working hours for the selected day,
 * and delegates to the existing TimeBlockColumn for time grid + appointment rendering.
 * Enriches slot click events with the staff's visibleId so the parent knows which
 * column was clicked.
 *
 * @param {Object} props
 * @param {Object} props.staff - StaffSchedule record (visibleId, staffName, schedule, etc.)
 * @param {Date} props.date - The selected day
 * @param {Array} props.appointments - Only this staff's appointments for the day
 * @param {number} props.startHour - Grid start hour
 * @param {number} props.endHour - Grid end hour
 * @param {Function} props.onAppointmentClick - (appointment) => void
 * @param {Function} props.onSlotClick - (dateTime, staffId) => void
 * @param {Function} props.TimeBlockColumn - The TimeBlockColumn component to render
 */
export default function StaffColumn({
  staff,
  date,
  appointments,
  startHour,
  endHour,
  onAppointmentClick,
  onSlotClick,
  TimeBlockColumn,
}) {
  // Parse the staff schedule (may be a JSON string or object)
  const schedule = useMemo(() => {
    if (!staff?.schedule) return null
    if (typeof staff.schedule === 'string') {
      try {
        return JSON.parse(staff.schedule)
      } catch {
        return null
      }
    }
    return staff.schedule
  }, [staff?.schedule])

  // Compute working hours for the selected day
  const workingHours = useMemo(
    () => getWorkingHoursForStaff(schedule, date),
    [schedule, date]
  )

  // Enrich slot click with this staff's visibleId
  const handleSlotClick = (dateTime) => {
    onSlotClick(dateTime, staff.visibleId)
  }

  return (
    <div className="staff-column" style={{ minWidth: '120px', flex: 1 }}>
      {/* Staff name header */}
      <div
        className="staff-column-header"
        style={{
          padding: '0.5rem 0.25rem',
          textAlign: 'center',
          fontWeight: 600,
          fontSize: '0.85rem',
          borderBottom: '1px solid var(--color-border)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={staff.staffName}
      >
        {staff.staffName}
      </div>

      {/* Delegate to TimeBlockColumn for time grid and appointment rendering */}
      <TimeBlockColumn
        date={date}
        appointments={appointments}
        startHour={startHour}
        endHour={endHour}
        onAppointmentClick={onAppointmentClick}
        onSlotClick={handleSlotClick}
        workingStart={workingHours.start}
        workingEnd={workingHours.end}
      />
    </div>
  )
}
