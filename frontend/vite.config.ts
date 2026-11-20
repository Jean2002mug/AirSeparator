import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const target = loadEnv(mode, '.', 'AIRSEPARATOR_').AIRSEPARATOR_API_URL || 'http://127.0.0.1:8080'
  const proxy = { '/api': target, '/health': target }
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', proxy },
    preview: { host: '127.0.0.1', proxy },
  }
})
