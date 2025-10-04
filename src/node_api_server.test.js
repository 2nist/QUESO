import request from 'supertest'
import { app } from './node_api_server.js'

describe('API Server', () => {
  afterAll(() => {
    // Terminate all spawned processes
    for (const job of app.jobs.values()) {
      if (job.proc) {
        job.proc.kill()
      }
    }
  });

  describe('POST /api/analyze', () => {
    it('should return a job id and slug', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({ input: 'test_input' })
      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('jobId')
      expect(response.body).toHaveProperty('slug')
    })

    it('should return 400 if input is missing', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({})
      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/status/:id', () => {
    it('should return 404 if job does not exist', async () => {
      const response = await request(app).get('/api/status/non-existent-id')
      expect(response.status).toBe(404)
    })

    it('should return job status if job exists', async () => {
      // Create a fake job
      const response = await request(app)
        .post('/api/analyze')
        .send({ input: 'test_input' })
      const { jobId } = response.body

      const statusResponse = await request(app).get(`/api/status/${jobId}`)
      expect(statusResponse.status).toBe(200)
      expect(statusResponse.body).toHaveProperty('jobId', jobId)
      expect(statusResponse.body).toHaveProperty('status', 'running')
    })
  })
})
