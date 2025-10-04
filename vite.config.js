// vite.config.js
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  root: path.resolve('src/svelte_app'),
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080'
    }
  },
  build: {
    outDir: path.resolve('dist'),
    emptyOutDir: true
  }
})