#!/usr/bin/env node
const port = process.env.PORT || 8081
console.log('Lab helper')
console.log('API base:', `http://localhost:${port}`)
console.log('Check lab allowed:')
console.log(`curl http://localhost:${port}/api/lab/allowed`)
