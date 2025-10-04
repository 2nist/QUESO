import { registerLabRoutes } from './routes.mjs'

function mockApp() {
  const routes = []
  return {
    get: (p,h) => routes.push({ method: 'get', path: p }),
    post: (p,h) => routes.push({ method: 'post', path: p }),
    routes
  }
}

const app = mockApp()
registerLabRoutes(app)
if (!app.routes.length) {
  console.error('No lab routes registered')
  process.exit(2)
}
console.log('Lab routes validated:', app.routes.map(r => r.path).join(', '))
process.exit(0)
