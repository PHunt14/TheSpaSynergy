/**
 * Formats a dateTime string to a short time display (e.g. "2:30 PM").
 */
export default function formatTime(dateTime) {
  try {
    return new Date(dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return dateTime }
}
