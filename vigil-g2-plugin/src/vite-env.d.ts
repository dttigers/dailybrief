/// <reference types="vite/client" />

// Phase 106 G2-01: VITE_SCREENSHOT_MODE short-circuits api.ts to deterministic demo data.
// DO NOT set this in .env.production — demo data would ship to store users (T8-leak-1).

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_API_KEY?: string
  readonly VITE_SCREENSHOT_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
