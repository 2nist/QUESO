import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve('client/lab'),
  plugins: [svelte()],
  server: { port: 5173 },
  build: { outDir: path.resolve('dist/lab'), emptyOutDir: true }
})
