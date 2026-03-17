import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 8080,
    headers: {
      // Ensure correct MIME types for audio
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
  plugins: [
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
