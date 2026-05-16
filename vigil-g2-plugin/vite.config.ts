import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    host: '0.0.0.0',
    // Allow Even Hub prototype-mode requests from iPhone via Tailscale-resolved hostname.
    // Default Vite 8 setting blocks any Host header outside localhost; iPhone hits Host: morrillhouse:<port>.
    allowedHosts: ['morrillhouse', 'morrillhouse.tail9abb1e.ts.net', '.tail9abb1e.ts.net', '.local'],
  },
})
