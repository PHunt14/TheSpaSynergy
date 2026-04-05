import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const raw = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' })
const ddb = DynamoDBDocumentClient.from(raw)

const tables = {
  vendor: () => process.env.DYNAMO_TABLE_VENDOR,
  staff: () => process.env.DYNAMO_TABLE_STAFF,
  appointment: () => process.env.DYNAMO_TABLE_APPOINTMENT,
}

// ── Vendor ────────────────────────────────────────────────────

export async function getVendor(vendorId) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: tables.vendor(),
    Key: { vendorId },
  }))
  return Item || null
}

export async function listVendors() {
  const { Items } = await ddb.send(new ScanCommand({ TableName: tables.vendor() }))
  return Items || []
}

export async function updateVendor(vendorId, fields) {
  const keys = Object.keys(fields)
  if (!keys.length) return
  const expr = keys.map((k, i) => `#k${i} = :v${i}`).join(', ')
  const names = Object.fromEntries(keys.map((k, i) => [`#k${i}`, k]))
  const values = Object.fromEntries(keys.map((k, i) => [`:v${i}`, fields[k]]))
  await ddb.send(new UpdateCommand({
    TableName: tables.vendor(),
    Key: { vendorId },
    UpdateExpression: `SET ${expr}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }))
}

// ── Staff ─────────────────────────────────────────────────────

export async function getStaff(visibleId) {
  const { Item } = await ddb.send(new GetCommand({
    TableName: tables.staff(),
    Key: { visibleId },
  }))
  return Item || null
}

export async function updateStaff(visibleId, fields) {
  const keys = Object.keys(fields)
  if (!keys.length) return
  const expr = keys.map((k, i) => `#k${i} = :v${i}`).join(', ')
  const names = Object.fromEntries(keys.map((k, i) => [`#k${i}`, k]))
  const values = Object.fromEntries(keys.map((k, i) => [`:v${i}`, fields[k]]))
  await ddb.send(new UpdateCommand({
    TableName: tables.staff(),
    Key: { visibleId },
    UpdateExpression: `SET ${expr}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }))
}

// ── Appointment ───────────────────────────────────────────────

export async function findAppointmentByPaymentId(paymentId) {
  const { Items } = await ddb.send(new ScanCommand({
    TableName: tables.appointment(),
    FilterExpression: 'paymentId = :pid',
    ExpressionAttributeValues: { ':pid': paymentId },
  }))
  return Items?.[0] || null
}

export async function updateAppointment(appointmentId, fields) {
  const keys = Object.keys(fields)
  if (!keys.length) return
  const expr = keys.map((k, i) => `#k${i} = :v${i}`).join(', ')
  const names = Object.fromEntries(keys.map((k, i) => [`#k${i}`, k]))
  const values = Object.fromEntries(keys.map((k, i) => [`:v${i}`, fields[k]]))
  await ddb.send(new UpdateCommand({
    TableName: tables.appointment(),
    Key: { appointmentId },
    UpdateExpression: `SET ${expr}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }))
}
