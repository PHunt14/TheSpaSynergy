import { jest } from '@jest/globals'
import { setupMocks, resetAllMocks } from './setup.mjs'

let app, request

beforeAll(async () => {
  app = await setupMocks()
  request = (await import('supertest')).default
})

beforeEach(() => resetAllMocks())

describe('GET /health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
