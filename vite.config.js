import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    port: 8080,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4321',
        ws: true,
        changeOrigin: true
      }
    }
  },
  // Giải pháp triệt để cho simple-peer và các thư viện Node.js trên Vite
  define: {
    global: 'window',
    'process.env': {}
  },
  plugins: [
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
