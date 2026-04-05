import { jest } from '@jest/globals'
import { setupMocks, resetAllMocks, dbMocks, squareCoreMocks } from './setup.mjs'

let app, request

const originalEnv = { ...process.env }

beforeAll(async () => {
  app = await setupMocks()
  request = (await import('supertest')).default
})

beforeEach(() => {
  resetAllMocks()
  process.env = { ...originalEnv }
  process.env.APP_URL = 'http://localhost:3000'
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'sig-key'
})

afterAll(() => { process.env = originalEnv })

function webhookBody(type, payment) {
  return JSON.stringify({ type, data: { object: { payment } } })
}

describe('POST /webhooks/square', () => {
  test('401 when signature is invalid', async () => {
    squareCoreMocks.verifyWebhookSignature.mockReturnValue(false)
    const res = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'text/plain')
      .set('x-square-hmacsha256-signature', 'bad')
      .send('{}')
    expect(res.status).toBe(401)
  })

  test('updates appointment on payment.completed', async () => {
    squareCoreMocks.verifyWebhookSignature.mockReturnValue(true)
    dbMocks.findAppointmentByPaymentId.mockResolvedValue({
      appointmentId: 'a1', paymentId: 'pay1', paymentStatus: 'PENDING', status: 'pending',
    })
    dbMocks.updateAppointment.mockResolvedValue()

    const body = webhookBody('payment.completed', {
      id: 'pay1', status: 'COMPLETED', amountMoney: { amount: 5000, currency: 'USD' },
    })

    const res = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'text/plain')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(dbMocks.updateAppointment).toHaveBeenCalledWith('a1', expect.objectContaining({
      paymentStatus: 'COMPLETED',
      paymentAmount: 50,
      status: 'confirmed',
    }))
  })

  test('updates payment status without confirming already-confirmed appointment', async () => {
    squareCoreMocks.verifyWebhookSignature.mockReturnValue(true)
    dbMocks.findAppointmentByPaymentId.mockResolvedValue({
      appointmentId: 'a1', paymentId: 'pay1', paymentStatus: 'PENDING', status: 'confirmed',
    })
    dbMocks.updateAppointment.mockResolvedValue()

    const body = webhookBody('payment.completed', {
      id: 'pay1', status: 'COMPLETED', amountMoney: { amount: 3000, currency: 'USD' },
    })

    const res = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'text/plain')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body)

    expect(res.status).toBe(200)
    const updateCall = dbMocks.updateAppointment.mock.calls[0][1]
    expect(updateCall.status).toBeUndefined()
  })

  test('skips update when payment status unchanged', async () => {
    squareCoreMocks.verifyWebhookSignature.mockReturnValue(true)
    dbMocks.findAppointmentByPaymentId.mockResolvedValue({
      appointmentId: 'a1', paymentId: 'pay1', paymentStatus: 'COMPLETED',
    })

    const body = webhookBody('payment.updated', {
      id: 'pay1', status: 'COMPLETED',
    })

    const res = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'text/plain')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body)

    expect(res.status).toBe(200)
    expect(dbMocks.updateAppointment).not.toHaveBeenCalled()
  })

  test('handles payment with no matching appointment gracefully', async () => {
    squareCoreMocks.verifyWebhookSignature.mockReturnValue(true)
    dbMocks.findAppointmentByPaymentId.mockResolvedValue(null)

    const body = webhookBody('payment.completed', { id: 'pay-unknown', status: 'COMPLETED' })

    const res = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'text/plain')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body)

    expect(res.status).toBe(200)
    expect(dbMocks.updateAppointment).not.toHaveBeenCalled()
  })

  test('ignores unrelated event types', async () => {
    squareCoreMocks.verifyWebhookSignature.mockReturnValue(true)

    const body = JSON.stringify({ type: 'refund.created', data: {} })
    const res = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'text/plain')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body)

    expect(res.status).toBe(200)
    expect(dbMocks.findAppointmentByPaymentId).not.toHaveBeenCalled()
  })

  test('500 when JSON parsing fails', async () => {
    squareCoreMocks.verifyWebhookSignature.mockReturnValue(true)

    const res = await request(app)
      .post('/webhooks/square')
      .set('Content-Type', 'text/plain')
      .set('x-square-hmacsha256-signature', 'valid')
      .send('not json')

    expect(res.status).toBe(500)
  })
})
