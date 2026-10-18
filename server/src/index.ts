/**
 * Beacon Detector — local BLE bridge.
 *
 * A tiny WebSocket server that exposes the machine's Bluetooth adapter to the
 * browser via @stoprocent/noble:
 *   - broadcasts the raw adapter state (so the UI can show a true on/off banner)
 *   - starts/stops a passive LE scan on request
 *   - forwards iBeacon-shaped manufacturer data as it is discovered
 *
 * The browser re-parses the raw bytes with its own `parseIBeacon()`, so the
 * filter here is only an optimization to keep the socket quiet.
 *
 * Wire protocol (JSON per message):
 *   server -> client: {type:'hello',version,authRequired} |
 *                     {type:'status',state,scanning} |
 *                     {type:'beacon',payload:{sourceId,rssi,localName?,address?,
 *                     addressType?,manufacturerData:number[]}}
 *   client -> server: {type:'auth',token} (first frame, when authRequired) |
 *                     {type:'start'} | {type:'stop'} | {type:'ping'}
 *
 * Public exposure is gated by:
 *   - BRIDGE_ALLOWED_ORIGINS: comma-separated exact origins and/or wildcard
 *     patterns (e.g. `https://*.beacon-detector.pages.dev`).
 *   - BRIDGE_AUTH_TOKEN: shared token sent in the first `auth` frame. When
 *     unset the bridge runs unauthenticated — local development only.
 */
import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import noble from '@stoprocent/noble'
import { WebSocketServer, type WebSocket } from 'ws'

const PORT = Number(process.env.BRIDGE_PORT ?? process.env.PORT ?? 8787)
const HOST = process.env.BRIDGE_HOST ?? process.env.HOST ?? '127.0.0.1'
const PROTOCOL_VERSION = 1
const AUTH_TIMEOUT_MS = 10_000

const AUTH_TOKEN = process.env.BRIDGE_AUTH_TOKEN?.trim() || null
const ALLOWED_ORIGINS = (process.env.BRIDGE_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

/** Apple company ID + iBeacon AD type/length signature. */
const IBEACON_SIGNATURE = [0x4c, 0x00, 0x02, 0x15]
const IBEACON_TOTAL_BYTES = 25

/** Minimal iBeacon filter (the browser is the authoritative decoder). */
function looksLikeIBeacon(bytes: Uint8Array): boolean {
  if (bytes.length < IBEACON_TOTAL_BYTES) return false
  outer: for (let i = 0; i <= bytes.length - IBEACON_TOTAL_BYTES; i++) {
    for (let j = 0; j < IBEACON_SIGNATURE.length; j++) {
      if (bytes[i + j] !== IBEACON_SIGNATURE[j]) continue outer
    }
    return true
  }
  return false
}

/* --------------------------- auth / origin gate -------------------------- */

/** Compare the presented token without leaking length/timing information. */
function tokenMatches(candidate: string): boolean {
  if (!AUTH_TOKEN) return true
  const presented = Buffer.from(candidate)
  const expected = Buffer.from(AUTH_TOKEN)
  if (presented.length !== expected.length) return false
  return timingSafeEqual(presented, expected)
}

/** `https://*.example.pages.dev` → anchored regex, `*` stays within a path segment. */
function originMatches(pattern: string, origin: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern === origin
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`).test(origin)
}

function isOriginAllowed(origin: string | undefined): boolean {
  // Browsers always send Origin on a WS handshake; native clients may not.
  if (!origin) return true
  if (ALLOWED_ORIGINS.length === 0) return true
  return ALLOWED_ORIGINS.some((pattern) => originMatches(pattern, origin))
}

/* ------------------------------ scan state ------------------------------- */

interface ClientState {
  authenticated: boolean
  authTimer: ReturnType<typeof setTimeout> | null
}

let scanning = false
const clients = new Map<WebSocket, ClientState>()

function broadcast(message: unknown): void {
  const data = JSON.stringify(message)
  for (const [socket, state] of clients) {
    if (!state.authenticated) continue
    if (socket.readyState === socket.OPEN) socket.send(data)
  }
}

function statusMessage() {
  return { type: 'status' as const, state: String(noble.state), scanning }
}

function sendStatus(): void {
  broadcast(statusMessage())
}

async function startScan(): Promise<void> {
  if (scanning) return
  if (noble.state !== 'poweredOn') {
    sendStatus()
    return
  }
  try {
    await noble.startScanningAsync([], true) // allowDuplicates → live RSSI
    scanning = true
  } catch (error) {
    scanning = false
    console.error('[bridge] failed to start scanning:', error)
  }
  sendStatus()
}

async function stopScan(): Promise<void> {
  if (!scanning) return
  try {
    await noble.stopScanningAsync()
  } catch (error) {
    console.error('[bridge] failed to stop scanning:', error)
  }
  scanning = false
  sendStatus()
}

/* ------------------------------- HTTP + WS ------------------------------- */

const http = createServer((req, res) => {
  if (req.url === '/health') {
    // Deliberately minimal: no adapter detail on the public route.
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, version: PROTOCOL_VERSION }))
    return
  }
  res.writeHead(404)
  res.end('not found')
})

const wss = new WebSocketServer({
  server: http,
  path: '/ble-ws',
  verifyClient: (info, done) => {
    if (!isOriginAllowed(info.origin)) {
      console.warn(`[bridge] rejected origin: ${info.origin}`)
      done(false, 403, 'Forbidden origin')
      return
    }
    done(true)
  },
})

wss.on('connection', (socket) => {
  const authRequired = AUTH_TOKEN !== null
  const state: ClientState = { authenticated: !authRequired, authTimer: null }
  clients.set(socket, state)

  socket.send(
    JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, authRequired }),
  )

  if (authRequired) {
    state.authTimer = setTimeout(() => {
      if (!state.authenticated) socket.close(4401, 'unauthorized')
    }, AUTH_TIMEOUT_MS)
  } else {
    socket.send(JSON.stringify(statusMessage()))
  }

  socket.on('message', (raw) => {
    let message: { type?: string; token?: string }
    try {
      message = JSON.parse(raw.toString()) as { type?: string; token?: string }
    } catch {
      return
    }

    if (!state.authenticated) {
      if (message.type === 'auth' && tokenMatches(message.token ?? '')) {
        state.authenticated = true
        if (state.authTimer) {
          clearTimeout(state.authTimer)
          state.authTimer = null
        }
        socket.send(JSON.stringify(statusMessage()))
      } else {
        socket.close(4401, 'unauthorized')
      }
      return
    }

    switch (message.type) {
      case 'auth':
        break // already authenticated
      case 'start':
        void startScan()
        break
      case 'stop':
        void stopScan()
        break
      case 'ping':
        socket.send(JSON.stringify(statusMessage()))
        break
      default:
        break
    }
  })

  socket.on('error', () => socket.close())
  socket.on('close', () => {
    if (state.authTimer) clearTimeout(state.authTimer)
    clients.delete(socket)
  })
})

/* ------------------------------ noble events ----------------------------- */

noble.on('stateChange', (state) => {
  console.log(`[bridge] adapter state: ${state}`)
  // Losing power invalidates the scan without emitting anything else.
  if (state !== 'poweredOn') scanning = false
  sendStatus()
})

noble.on('discover', (peripheral) => {
  const manufacturerData = peripheral.advertisement?.manufacturerData
  if (!manufacturerData || !looksLikeIBeacon(manufacturerData)) return

  broadcast({
    type: 'beacon',
    payload: {
      sourceId: peripheral.id ?? peripheral.address,
      rssi: typeof peripheral.rssi === 'number' ? peripheral.rssi : null,
      localName: peripheral.advertisement.localName || undefined,
      address: peripheral.address || undefined,
      addressType: peripheral.addressType || undefined,
      manufacturerData: Array.from(manufacturerData),
    },
  })
})

/* --------------------------------- boot ---------------------------------- */

http.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on ws://${HOST}:${PORT}/ble-ws`)
  console.log(`[bridge] adapter state: ${noble.state}`)
  console.log(
    `[bridge] auth: ${AUTH_TOKEN ? 'required' : 'DISABLED (local development only)'}`,
  )
  console.log(
    ALLOWED_ORIGINS.length > 0
      ? `[bridge] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`
      : '[bridge] allowed origins: any (set BRIDGE_ALLOWED_ORIGINS to restrict)',
  )
  console.log('[bridge] if macOS prompts for Bluetooth access, allow it once.')
})

async function shutdown(): Promise<void> {
  console.log('\n[bridge] shutting down…')
  await stopScan()
  for (const [socket, state] of clients) {
    if (state.authTimer) clearTimeout(state.authTimer)
    socket.close()
  }
  wss.close()
  http.close()
  noble.stop()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
