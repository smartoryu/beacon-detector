/**
 * Runtime bridge connection settings.
 *
 * A Cloudflare quick tunnel hands out a random `*.trycloudflare.com` hostname
 * on every restart, so the URL cannot be baked into the build. The operator
 * pastes the tunnel URL (and token) into the UI; values persist in
 * `localStorage` and override any build-time defaults.
 */

export interface BridgeSettings {
  /** Full ws(s):// URL, or empty to fall back to env / same-origin. */
  url: string
  /** Shared token sent in the first `auth` frame. Empty when unused. */
  token: string
}

const STORAGE_KEY = 'beacon-detector:bridge-settings'

const ENV_URL = (import.meta.env.VITE_BRIDGE_URL ?? '').trim()
const ENV_TOKEN = (import.meta.env.VITE_BRIDGE_TOKEN ?? '').trim()

/** Build-time defaults, used when nothing has been saved in the UI. */
export const DEFAULT_BRIDGE_SETTINGS: BridgeSettings = {
  url: ENV_URL,
  token: ENV_TOKEN,
}

export function loadBridgeSettings(): BridgeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_BRIDGE_SETTINGS }

    const parsed = JSON.parse(raw) as Partial<BridgeSettings>
    return {
      url: typeof parsed.url === 'string' ? parsed.url : DEFAULT_BRIDGE_SETTINGS.url,
      token: typeof parsed.token === 'string' ? parsed.token : DEFAULT_BRIDGE_SETTINGS.token,
    }
  } catch {
    return { ...DEFAULT_BRIDGE_SETTINGS }
  }
}

export function saveBridgeSettings(settings: BridgeSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url: settings.url.trim(), token: settings.token.trim() }),
    )
  } catch {
    // Private mode / quota — settings stay in memory for this session only.
  }
}

export function resetBridgeSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Turn whatever the operator pasted into a usable WebSocket URL:
 *   `https://x.trycloudflare.com` → `wss://x.trycloudflare.com/ble-ws`
 *   `http://localhost:8787`       → `ws://localhost:8787/ble-ws`
 *   `x.trycloudflare.com`         → `wss://x.trycloudflare.com/ble-ws`
 * Returns `''` for empty/invalid input.
 */
export function normalizeBridgeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  let value = trimmed
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `wss://${value}`

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return ''
  }

  if (url.protocol === 'https:') url.protocol = 'wss:'
  else if (url.protocol === 'http:') url.protocol = 'ws:'
  else if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return ''

  if (!url.pathname || url.pathname === '/') url.pathname = '/ble-ws'
  return url.toString()
}

/** The effective endpoint: saved/env URL, else the same-origin Vite proxy. */
export function resolveBridgeUrl(settings: BridgeSettings = loadBridgeSettings()): string {
  const normalized = normalizeBridgeUrl(settings.url || ENV_URL)
  if (normalized) return normalized

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ble-ws`
}
