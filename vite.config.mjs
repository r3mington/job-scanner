import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  server: {},
  plugins: [
    react(),
    command === 'build' && VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'VeritasRecruit',
        short_name: 'VeritasRecruit',
        description: 'Risky Job Post Detector',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/vite.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/vite.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ].filter(Boolean),
}))
