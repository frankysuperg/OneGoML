import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/events': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/decide': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/explain_decision': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/shock': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/status': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/model_failure': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/replay': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
