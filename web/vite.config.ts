import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  plugins: [react()],
  // keep the browser's Host header, as production does (web and API on one origin): the API refuses writes from other origins
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } } },
  build: { outDir: '../dist/web', emptyOutDir: true },
})
