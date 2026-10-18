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
 *   server -> client: {type:'hello',version} | {type:'status',state,scanning} |
 *                     {type:'beacon',payload:{sourceId,rssi,localName?,address?,
 *                     addressType?,manufacturerData:number[]}}
 *   client -> server: {type:'start'} | {type:'stop'} | {type:'ping'}
 */
import { createServer } from 'node:http'
import noble from '@stoprocent/noble'
import { WebSocketServer, type WebSocket } from 'ws'

const PORT = Number(process.env.BRIDGE_PORT ?? 8787)
const PROTOCOL_VERSION = 1

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

let scanning = false
const clients = new Set<WebSocket>()

function broadcast(message: unknown): void {
  const data = JSON.stringify(message)
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(data)
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
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    })
    res.end(JSON.stringify({ ok: true, version: PROTOCOL_VERSION, ...statusMessage() }))
    return
  }
  res.writeHead(404, { 'access-control-allow-origin': '*' })
  res.end('not found')
})

const wss = new WebSocketServer({ server: http, path: '/ble-ws' })

wss.on('connection', (socket) => {
  clients.add(socket)
  socket.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION }))
  socket.send(JSON.stringify(statusMessage()))

  socket.on('message', (raw) => {
    let message: { type?: string }
    try {
      message = JSON.parse(raw.toString()) as { type?: string }
    } catch {
      return
    }

    switch (message.type) {
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
  socket.on('close', () => clients.delete(socket))
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

http.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] listening on ws://127.0.0.1:${PORT}/ble-ws`)
  console.log(`[bridge] adapter state: ${noble.state}`)
  console.log('[bridge] if macOS prompts for Bluetooth access, allow it once.')
})

async function shutdown(): Promise<void> {
  console.log('\n[bridge] shutting down…')
  await stopScan()
  for (const client of clients) client.close()
  wss.close()
  http.close()
  noble.stop()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
