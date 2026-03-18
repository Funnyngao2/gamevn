import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  server: {
    port: 8080,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4321',
        ws: true,
        changeOrigin: true
      }
    }
  },
  define: {
    global: 'window',
    'process.env': {}
  },
  plugins: [
    nodePolyfills({ include: ['stream', 'buffer', 'util', 'events', 'process'] }),
    react(),
    tailwindcss(),
    {
      name: 'ogg-mime',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith('.ogg')) {
            res.setHeader('Content-Type', 'audio/ogg')
          }
          next()
        })
      }
    }
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0
  }
})
