'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  getWeekDates,
  isSameDay,
  generateTimeSlots,
  getAggregateWorkingHours,
  groupAppointmentsByDateAndStaff,
  assignStaffColors,
  orderStaffColumns,
  computeOverlapLayout,
  getBlockPosition,
  parseAppointmentDate,
  SLOT_MINUTES,
} from '../../utils/calendar'
import StaffLegend from './StaffLegend'

/**
 * MultiStaffWeekView — Week grid view showing 7 days of appointments for all
 * active staff, color-coded by staff member.
 *
 * @param {Object} props
 * @param {Date} props.selectedDate - Currently selected date (determines which week to show)
 * @param {Array} props.allStaff - Active staff list (StaffSchedule[])
 * @param {Array} props.appointments - All appointments for the week (all staff, all 7 days)
 * @param {number} props.startHour - Time grid start hour
 * @param {number} props.endHour - Time grid end hour
 * @param {Function} props.onAppointmentClick - (appointment) => void
 * @param {Function} props.onSlotClick - (dateTime) => void
 * @param {Function} props.onDayClick - (date) => void - switches to day view for that date
 * @param {Array} props.vendors - Vendor list for staff ordering
 */
export default function MultiStaffWeekView({
  selectedDate,
  allStaff,
  appointments,
  startHour,
  endHour,
  onAppointmentClick,
  onSlotClick,
  onDayClick,
  vendors,
}) {
  const DAY_ABBREVIATIONS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const DAY_ABBREVIATIONS_NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  // Compute the 7 days (Sun-Sat) of the week containing selectedDate
  const weekDates = useMemo(
    () => getWeekDates(selectedDate),
    [selectedDate]
  )

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Order staff and assign colors
  const orderedStaff = useMemo(
    () => orderStaffColumns(allStaff || [], vendors || []),
    [allStaff, vendors]
  )

  const staffColorMap = useMemo(
    () => assignStaffColors(orderedStaff),
    [orderedStaff]
  )

  // Group appointments by date and staff
  const groupedAppointments = useMemo(
    () => groupAppointmentsByDateAndStaff(appointments || [], weekDates, allStaff || []),
    [appointments, weekDates, allStaff]
  )

  // Legend collapsed state
  const [legendCollapsed, setLegendCollapsed] = useState(false)

  // Track narrow viewport for text fallback
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const checkWidth = () => setIsNarrow(window.innerWidth < 768)
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [])

  return (
    <div>
      {/* Staff color legend above the week grid */}
      <StaffLegend
        staff={orderedStaff}
        colorMap={staffColorMap}
        collapsed={legendCollapsed}
        onToggle={() => setLegendCollapsed(c => !c)}
      />

      <div
        className="multi-staff-week-view"
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
      {/* Scrollable container for both header and body */}
      <div
        className="multi-staff-week-scroll-container"
        style={{
          overflowX: 'auto',
          position: 'relative',
        }}
      >
        {/* Week Header */}
        <WeekHeader
          weekDates={weekDates}
          today={today}
          selectedDate={selectedDate}
          dayAbbreviations={isNarrow ? DAY_ABBREVIATIONS_NARROW : DAY_ABBREVIATIONS_FULL}
          onDayClick={onDayClick}
          isNarrow={isNarrow}
        />

      {/* Week body: time grid + 7 day columns */}
      <div
        className="multi-staff-week-body"
        style={{
          display: 'grid',
          gridTemplateColumns: '60px 1fr',
          position: 'relative',
        }}
      >
        {/* Sticky Time Grid */}
        <TimeGrid startHour={startHour} endHour={endHour} />

        {/* Day columns container */}
        <div
          className="multi-staff-week-columns"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(100px, 1fr))',
            minWidth: '700px',
          }}
        >
          {weekDates.map((date, index) => (
            <DayColumn
              key={index}
              date={date}
              startHour={startHour}
              endHour={endHour}
              allStaff={allStaff}
              isLast={index === 6}
              groupedAppointments={groupedAppointments}
              staffColorMap={staffColorMap}
              onAppointmentClick={onAppointmentClick}
              onSlotClick={onSlotClick}
              isNarrow={isNarrow}
            />
          ))}
        </div>
      </div>
      </div>
    </div>
    </div>
  )
}

/**
 * WeekHeader — Renders the row of day labels with date numbers.
 * Highlights today and the selected date, and supports clicking to navigate.
 */
function WeekHeader({ weekDates, today, selectedDate, dayAbbreviations, onDayClick, isNarrow }) {
  return (
    <div
      className="week-header"
      role="row"
      style={{
        display: 'grid',
        gridTemplateColumns: '60px 1fr',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-accent)',
      }}
    >
      {/* Sticky spacer cell aligned with time grid */}
      <div
        style={{
          position: 'sticky',
          left: 0,
          zIndex: 3,
          background: 'var(--color-accent)',
          borderRight: '1px solid var(--color-border)',
        }}
      />

      {/* Day header cells — grid matches the day columns in the body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(100px, 1fr))',
          minWidth: '700px',
        }}
      >
      {weekDates.map((date, index) => {
        const isToday = isSameDay(date, today)
        const isSelected = !isToday && isSameDay(date, selectedDate)

        return (
          <button
            key={index}
            role="columnheader"
            aria-label={`${dayAbbreviations[index]} ${date.getDate()}${isToday ? ', today' : ''}${isSelected ? ', selected' : ''}`}
            onClick={() => onDayClick && onDayClick(date)}
            className="week-header-day"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 4px',
              border: 'none',
              borderRight: index < 6 ? '1px solid var(--color-border)' : 'none',
              background: isToday
                ? 'var(--color-primary, #4A90D9)'
                : isSelected
                  ? 'rgba(74, 144, 217, 0.12)'
                  : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <span
              className="week-header-day-name"
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                color: isToday
                  ? '#fff'
                  : 'var(--color-text-light)',
                letterSpacing: '0.02em',
              }}
            >
              {dayAbbreviations[index]}
            </span>
            <span
              className="week-header-date-number"
              style={{
                fontSize: '1rem',
                fontWeight: isToday || isSelected ? 700 : 500,
                color: isToday
                  ? '#fff'
                  : isSelected
                    ? 'var(--color-primary, #4A90D9)'
                    : 'var(--color-text)',
                marginTop: '2px',
              }}
            >
              {date.getDate()}
            </span>
          </button>
        )
      })}
      </div>
    </div>
  )
}


/**
 * TimeGrid — Renders the sticky left-side time labels from startHour to endHour.
 * Each slot is 40px tall (matching getBlockPosition's pxPerSlot).
 */
function TimeGrid({ startHour, endHour }) {
  const PX_PER_SLOT = 40
  const timeSlots = useMemo(
    () => generateTimeSlots(startHour, endHour),
    [startHour, endHour]
  )

  return (
    <div
      className="multi-staff-week-time-grid"
      style={{
        position: 'sticky',
        left: 0,
        zIndex: 2,
        background: 'var(--color-background, #fff)',
        borderRight: '1px solid var(--color-border)',
        width: '60px',
        minWidth: '60px',
      }}
    >
      {timeSlots.map((slot, index) => (
        <div
          key={index}
          className="time-grid-label"
          style={{
            height: `${PX_PER_SLOT}px`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            paddingRight: '6px',
            paddingTop: '2px',
            fontSize: '0.65rem',
            color: 'var(--color-text-light)',
            borderBottom: slot.minute === 0
              ? '1px solid var(--color-border)'
              : '1px dashed var(--color-border-light, rgba(0,0,0,0.06))',
            boxSizing: 'border-box',
          }}
        >
          {/* Show label only on the hour (skip half-hour marks) */}
          {slot.minute === 0 && (
            <span>
              {slot.hour === 0
                ? '12 AM'
                : slot.hour < 12
                  ? `${slot.hour} AM`
                  : slot.hour === 12
                    ? '12 PM'
                    : `${slot.hour - 12} PM`}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}


/**
 * DayColumn — Renders a single day's column within the week grid.
 * Displays a working hours highlight region and color-coded appointment blocks.
 */
function DayColumn({ date, startHour, endHour, allStaff, isLast, groupedAppointments, staffColorMap, onAppointmentClick, onSlotClick, isNarrow }) {
  const PX_PER_SLOT = 40
  const totalSlots = (endHour - startHour) * 2
  const totalHeight = totalSlots * PX_PER_SLOT

  // Compute working hours highlight for this day
  const workingHours = useMemo(
    () => getAggregateWorkingHours(allStaff, date),
    [allStaff, date]
  )

  // Get all appointments for this day (across all staff) and compute overlap layout
  const dayAppointments = useMemo(() => {
    const dateKey = formatDateKeyLocal(date)
    const staffMap = groupedAppointments.get(dateKey)
    if (!staffMap) return []

    const allApts = []
    for (const [, apts] of staffMap) {
      allApts.push(...apts)
    }
    return allApts
  }, [groupedAppointments, date])

  const layout = useMemo(
    () => computeOverlapLayout(dayAppointments, startHour),
    [dayAppointments, startHour]
  )

  // Calculate the highlight position in pixels
  const highlightStyle = useMemo(() => {
    if (workingHours.start === null || workingHours.end === null) {
      return null
    }

    const startMinutesFromGridStart = workingHours.start - startHour * 60
    const endMinutesFromGridStart = workingHours.end - startHour * 60

    // Clamp to grid bounds
    const clampedStart = Math.max(0, startMinutesFromGridStart)
    const clampedEnd = Math.min((endHour - startHour) * 60, endMinutesFromGridStart)

    if (clampedStart >= clampedEnd) return null

    const top = (clampedStart / SLOT_MINUTES) * PX_PER_SLOT
    const height = ((clampedEnd - clampedStart) / SLOT_MINUTES) * PX_PER_SLOT

    return { top, height }
  }, [workingHours, startHour, endHour])

  const handleSlotClick = (e, slotIndex) => {
    // Only fire if clicking the background, not an appointment block
    if (e.target !== e.currentTarget) return
    const slotMinutes = slotIndex * SLOT_MINUTES
    const hour = startHour + Math.floor(slotMinutes / 60)
    const minute = slotMinutes % 60
    const dateTime = new Date(date)
    dateTime.setHours(hour, minute, 0, 0)
    onSlotClick && onSlotClick(dateTime)
  }

  return (
    <div
      className="multi-staff-week-day-column"
      style={{
        position: 'relative',
        height: `${totalHeight}px`,
        borderRight: isLast ? 'none' : '1px solid var(--color-border)',
        boxSizing: 'border-box',
      }}
    >
      {/* Working hours highlight */}
      {highlightStyle && (
        <div
          className="working-hours-highlight"
          style={{
            position: 'absolute',
            top: `${highlightStyle.top}px`,
            left: 0,
            right: 0,
            height: `${highlightStyle.height}px`,
            background: 'rgba(74, 144, 217, 0.06)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {/* Horizontal slot lines for visual grid (clickable for new appointments) */}
      {Array.from({ length: totalSlots }, (_, i) => (
        <div
          key={i}
          onClick={(e) => handleSlotClick(e, i)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              const slotMinutes = i * SLOT_MINUTES
              const hour = startHour + Math.floor(slotMinutes / 60)
              const minute = slotMinutes % 60
              const dateTime = new Date(date)
              dateTime.setHours(hour, minute, 0, 0)
              onSlotClick && onSlotClick(dateTime)
            }
          }}
          aria-label={`Add appointment on ${date.toLocaleDateString()} at ${formatSlotTime(i, startHour)}`}
          style={{
            position: 'absolute',
            top: `${i * PX_PER_SLOT}px`,
            left: 0,
            right: 0,
            height: `${PX_PER_SLOT}px`,
            borderBottom: i % 2 === 1
              ? '1px solid var(--color-border)'
              : '1px dashed var(--color-border-light, rgba(0,0,0,0.06))',
            boxSizing: 'border-box',
            cursor: 'cell',
          }}
        />
      ))}

      {/* Color-coded appointment blocks */}
      {layout.map(({ appointment, column, totalColumns }) => (
        <WeekAppointmentBlock
          key={appointment.appointmentId}
          appointment={appointment}
          startHour={startHour}
          column={column}
          totalColumns={totalColumns}
          staffColorMap={staffColorMap}
          onClick={onAppointmentClick}
          isNarrow={isNarrow}
        />
      ))}
    </div>
  )
}


/**
 * WeekAppointmentBlock — Renders a single appointment block color-coded by staff.
 * Shows customer name and staff name when block height allows (>= 40px).
 * Falls back to a color-coded bar when viewport is narrow or block is too small.
 */
function WeekAppointmentBlock({ appointment, startHour, column, totalColumns, staffColorMap, onClick, isNarrow }) {
  const aptDate = parseAppointmentDate(appointment.rawDateTime || appointment.dateTime)
  if (!aptDate) return null

  const customer = appointment.customer || {}
  const duration = (customer.isBlockedTime && customer.duration)
    ? customer.duration
    : (appointment.service?.duration || 30)
  const { top, height } = getBlockPosition(aptDate, duration, startHour)

  const staffColor = staffColorMap.get(appointment.staffId) || '#999'
  const customerName = customer.name || 'Walk-in'
  const staffName = appointment.staffName || ''

  // Determine if we should show text or just a color bar
  const showText = !isNarrow && Math.max(height, 44) >= 40

  // Calculate horizontal position for overlapping appointments
  const widthPercent = 100 / totalColumns
  const leftPercent = column * widthPercent

  return (
    <div
      data-appointment-id={appointment.appointmentId}
      onClick={(e) => {
        e.stopPropagation()
        onClick && onClick(appointment)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick && onClick(appointment)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Appointment: ${customerName} with ${staffName || 'Staff'}${appointment.service?.name ? `, ${appointment.service.name}` : ''}`}
      title={`${customerName} — ${staffName || 'Staff'}${appointment.service?.name ? ` (${appointment.service.name})` : ''}`}
      className="week-appointment-block"
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: `calc(${leftPercent}% + 1px)`,
        width: `calc(${widthPercent}% - 2px)`,
        height: `${Math.max(height, 44)}px`,
        minHeight: '44px',
        background: showText ? staffColor + '18' : staffColor,
        borderLeft: showText ? `3px solid ${staffColor}` : 'none',
        borderRadius: showText ? '3px' : '2px',
        padding: showText ? '2px 4px' : '0',
        fontSize: '0.65rem',
        overflow: 'hidden',
        cursor: 'pointer',
        zIndex: 3,
        lineHeight: '1.2',
        transition: 'box-shadow 0.15s',
        boxSizing: 'border-box',
        opacity: isNarrow && height < 20 ? 0.8 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.18)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
    >
      {showText && (
        <>
          <div style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: 'var(--color-text)',
          }}>
            {customerName}
          </div>
          {height >= 52 && (
            <div style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--color-text-light)',
              fontSize: '0.6rem',
            }}>
              {staffName}
            </div>
          )}
        </>
      )}
    </div>
  )
}


/**
 * Format a Date as YYYY-MM-DD string (local helper matching calendar.js logic).
 */
function formatDateKeyLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}


/**
 * Format a slot index as a readable time string for aria labels.
 */
function formatSlotTime(slotIndex, startHour) {
  const totalMinutes = slotIndex * SLOT_MINUTES
  const hour = startHour + Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const ampm = hour < 12 ? 'AM' : 'PM'
  return `${h}:${String(minute).padStart(2, '0')} ${ampm}`
}
