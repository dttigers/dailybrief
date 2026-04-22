import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Phase 107.2 — cross-machine Tailscale dev access.
// Function form lets us call loadEnv() to read VITE_DEV_API_TARGET from .env.local.
// Vite does NOT populate process.env from .env files — loadEnv() is the only way.
// Third arg '' (empty prefix) loads all vars; we still name ours VITE_-prefixed so
// import.meta.env exposes them if ever needed at browser-bundle time.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // D-C2 — escape hatch for staging/integration targets. Default hits the local
  // vigil-core running in the same `npm run dev` concurrently stream.
  const apiTarget = env.VITE_DEV_API_TARGET ?? 'http://localhost:3001'

  return {
    server: {
      // D-E1 — bind 0.0.0.0 so Tailscale/LAN peers can reach :5173.
      // Safe in dev; Vite dev-server never runs in prod.
      host: true,
      proxy: {
        '/v1': {
          // D-C1 — proxy /v1/* to vigil-core. Browser sees same-origin traffic to :5173;
          // proxy runs server-side so CORS is not involved in the dev path. Pitfall 4:
          // VITE_API_BASE in .env.local MUST be unset/empty for this to take effect
          // (otherwise client.ts:3 uses the env value and bypasses the proxy).
          target: apiTarget,
          changeOrigin: true,
          // ws: true NOT added — /v1 routes are plain HTTP; HMR uses Vite's own WS channel
          // at the root (:5173) and does not traverse this proxy.
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // devOptions intentionally omitted — plugin defaults enabled:false in dev
        // (vite-plugin-pwa 1.2.0 verified). D-E3 stands: no dev service worker to
        // confuse cross-origin caching during Tailscale sessions.
        includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
        manifest: {
          name: 'Vigil Dashboard',
          short_name: 'Vigil',
          description: 'Vigil ambient AI dashboard',
          theme_color: '#0F6E56',
          background_color: '#0f172a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-256x256.png',
              sizes: '256x256',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-384x384.png',
              sizes: '384x384',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Skip waiting — new SW activates immediately instead of waiting
          // for all tabs to close. Means deploys reflect within seconds.
          skipWaiting: true,
          clientsClaim: true,
        },
      }),
    ],
  }
})
