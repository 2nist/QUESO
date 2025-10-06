import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve('client/lab'),
  plugins: [svelte()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // forward API calls to the API server. dev:lab sets PORT env var.
      '/api': {
        target: `http://localhost:${process.env.PORT || 8081}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: { outDir: path.resolve('dist/lab'), emptyOutDir: true }
})
