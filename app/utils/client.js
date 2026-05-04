// Normalize phone to digits only for matching
export function normalizePhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

// Normalize email for matching
export function normalizeEmail(email) {
  if (!email) return null
  return email.trim().toLowerCase() || null
}

// Determine if two customer records represent the same client
export function isMatchingClient(existing, incoming) {
  const existingPhone = normalizePhone(existing.phone)
  const incomingPhone = normalizePhone(incoming.phone)
  if (existingPhone && incomingPhone && existingPhone === incomingPhone) return true

  const existingEmail = normalizeEmail(existing.email)
  const incomingEmail = normalizeEmail(incoming.email)
  if (existingEmail && incomingEmail && existingEmail === incomingEmail) return true

  return false
}
