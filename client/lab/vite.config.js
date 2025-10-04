import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'node:path'

export default defineConfig({
  root: path.resolve('client/lab'),
  plugins: [svelte()],
  server: { port: 5173 },
  build: { outDir: path.resolve('dist/lab'), emptyOutDir: true }
})
