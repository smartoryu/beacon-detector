/// <reference types="vite/client" />

/**
 * Build-time defaults for the Node bridge. A Cloudflare quick tunnel gives a
 * random hostname on every restart, so these are optional — the runtime
 * Bridge settings panel overrides them.
 */
interface ImportMetaEnv {
  readonly VITE_BRIDGE_URL?: string
  readonly VITE_BRIDGE_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
