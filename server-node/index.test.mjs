import { jest } from '@jest/globals'
import { build } from './index.mjs'
import { randomUUID } from 'node:crypto'

describe('Server', () => {
  let app

  beforeEach(() => {
    app = build({ logger: false })
  })

  afterEach(() => {
    app.close()
  })

  it('should build the server', async () => {
    expect(app).toBeDefined()
  })

  describe('/api/analyze', () => {
    it('should return a job id and slug', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/analyze',
        payload: {
          input: 'test_input'
        }
      })

      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json).toHaveProperty('jobId')
      expect(json).toHaveProperty('slug')
    })

    it('should return 400 if input is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/analyze',
        payload: {}
      })

      expect(response.statusCode).toBe(400)
    })
  })

  describe('/api/status/:id', () => {
    it('should return 404 if job does not exist', async () => {
      const jobId = randomUUID()
      const response = await app.inject({
        method: 'GET',
        url: `/api/status/${jobId}`
      })
      expect(response.statusCode).toBe(404)
    })

    it('should return job status if job exists', async () => {
      const jobId = randomUUID()
      const job = { status: 'running', slug: 'test-slug', progress: 0, started: 123, ended: 456 }
      app.jobs.set(jobId, job)

      const response = await app.inject({
        method: 'GET',
        url: `/api/status/${jobId}`
      })

      expect(response.statusCode).toBe(200)
      const json = response.json()
      expect(json).toEqual({
        status: 'running',
        slug: 'test-slug',
        progress: 0,
        started: 123,
        ended: 456
      })
    })
  })

  describe('/api/logs/:id', () => {
    it('should return 404 if job does not exist', async () => {
      const jobId = randomUUID()
      const response = await app.inject({
        method: 'GET',
        url: `/api/logs/${jobId}`
      })
      expect(response.statusCode).toBe(404)
    })

    it('should return logs if job exists', async () => {
      const jobId = randomUUID()
      const job = {
        status: 'running',
        log: [
          { t: Date.now(), line: 'log line 1' },
          { t: Date.now(), line: 'log line 2' }
        ]
      }
      app.jobs.set(jobId, job)

      const response = await app.inject({
        method: 'GET',
        url: `/api/logs/${jobId}`
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toBe('text/event-stream')
    })
  })
})
