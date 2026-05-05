/**
 * Backfill Client Catalog from Existing Appointments
 *
 * Scans all appointments, extracts customer data, and creates
 * Client records for any customers not already in the catalog.
 *
 * Usage:
 *   node scripts/backfill-clients.cjs              # live run
 *   node scripts/backfill-clients.cjs --dry-run    # preview only, no writes
 */

const { Amplify } = require('aws-amplify')
const { generateClient } = require('aws-amplify/data')
const config = require('../amplify_outputs.json')

Amplify.configure(config)
const client = generateClient()

const DRY_RUN = process.argv.includes('--dry-run')

function normalizePhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

function normalizeEmail(email) {
  if (!email) return null
  return email.trim().toLowerCase() || null
}

async function findExistingClient(phone, email) {
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone) {
    const { data } = await client.models.Client.list({ filter: { phone: { eq: normalizedPhone } } })
    if (data && data.length > 0) return data[0]
  }
  const normalizedEmail = normalizeEmail(email)
  if (normalizedEmail) {
    const { data } = await client.models.Client.list({ filter: { email: { eq: normalizedEmail } } })
    if (data && data.length > 0) return data[0]
  }
  return null
}

async function run() {
  if (DRY_RUN) console.log('=== DRY RUN — no data will be written ===\n')

  // Verify Client model exists
  if (!client.models.Client) {
    console.error('ERROR: Client model not found. Deploy the schema first, then re-download amplify_outputs.json.')
    process.exit(1)
  }

  console.log('Fetching all appointments...')
  const { data: appointments } = await client.models.Appointment.list({ limit: 10000 })
  console.log(`Found ${appointments.length} appointments\n`)

  let created = 0
  let linked = 0
  let skipped = 0
  let matched = 0

  for (const apt of appointments) {
    const customer = typeof apt.customer === 'string' ? JSON.parse(apt.customer) : apt.customer
    if (!customer?.name || customer.isBlockedTime || customer.name === 'Blocked Time' || customer.name === 'Manual Entry') { skipped++; continue }

    const existing = await findExistingClient(customer.phone, customer.email)

    let clientId
    if (existing) {
      clientId = existing.clientId
      matched++
      if (customer.name.length > (existing.name?.length || 0)) {
        if (!DRY_RUN) await client.models.Client.update({ clientId, name: customer.name })
        console.log(`  Updated name: "${existing.name}" → "${customer.name}"`)
      }
    } else {
      clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      if (!DRY_RUN) {
        await client.models.Client.create({
          clientId,
          name: customer.name,
          phone: normalizePhone(customer.phone) || customer.phone || null,
          email: normalizeEmail(customer.email) || null,
          createdAt: apt.createdAt || new Date().toISOString(),
        })
      }
      console.log(`  + New client: ${customer.name} (${normalizePhone(customer.phone) || customer.email || 'no contact'})`)
      created++
    }

    if (!apt.clientId) {
      if (!DRY_RUN) await client.models.Appointment.update({ appointmentId: apt.appointmentId, clientId })
      linked++
    }
  }

  console.log(`\n${DRY_RUN ? '=== DRY RUN SUMMARY ===' : 'Done!'}`)
  console.log(`  New clients to create: ${created}`)
  console.log(`  Matched to existing:   ${matched}`)
  console.log(`  Appointments to link:  ${linked}`)
  console.log(`  Skipped:               ${skipped} (blocked time, manual, or no customer)`)
  if (DRY_RUN) console.log(`\nRun without --dry-run to execute.`)
}

run().catch(console.error)
