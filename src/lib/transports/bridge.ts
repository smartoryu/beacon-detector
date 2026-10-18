import type {
  AdapterStatus,
  BridgeClientMessage,
  BridgeServerMessage,
  RawBeaconEvent,
} from '../../types'
import { parseIBeacon } from '../ibeacon'
import { createEmitter, type BleTransport, type TransportStatus } from './types'

const PROBE_TIMEOUT_MS = 900
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 10_000

/** Websocket endpoint, proxied by Vite (`/ble-ws` → 127.0.0.1:8787). */
function bridgeUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ble-ws`
}

const OFF_MESSAGE = 'Bluetooth is turned off.'
const UNAUTHORIZED_MESSAGE =
  'Bluetooth permission was denied for the Node process. Allow it in System Settings → Privacy & Security → Bluetooth, then restart the bridge.'

/** Map a raw noble adapter state to the normalized banner status. */
function mapAdapterState(
  state: string,
  scanning: boolean,
  message?: string,
): TransportStatus {
  switch (state) {
    case 'poweredOn':
      return { status: scanning ? 'searching' : 'idle', scanning }
    case 'poweredOff':
      return { status: 'off', scanning: false, message: OFF_MESSAGE }
    case 'unauthorized':
      return { status: 'unauthorized', scanning: false, message: UNAUTHORIZED_MESSAGE }
    case 'unsupported':
      return {
        status: 'unsupported',
        scanning: false,
        message: 'The Node bridge found no Bluetooth adapter.',
      }
    default:
      return {
        status: 'error' as AdapterStatus,
        scanning: false,
        message: message ?? `Adapter state: ${state}`,
      }
  }
}

/**
 * Node bridge transport: talks to `server/` over WebSocket.
 *
 * Keeps one socket alive, reconnects with capped exponential backoff, and
 * re-issues the last requested scan intent on reconnect.
 */
export function createBridgeTransport(): BleTransport {
  const statusEmitter = createEmitter<TransportStatus>()
  const beaconEmitter = createEmitter<RawBeaconEvent>()

  let socket: WebSocket | null = null
  let connecting: Promise<boolean> | null = null
  let reconnectTimer: number | null = null
  let reconnectDelay = RECONNECT_BASE_MS
  let wantScanning = false
  let disposed = false
  let last: TransportStatus = {
    status: 'off',
    scanning: false,
    message: 'The Node bridge is not connected.',
  }

  const setStatus = (next: TransportStatus) => {
    last = next
    statusEmitter.emit(next)
  }

  const send = (message: BridgeClientMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
    }
  }

  const handleMessage = (event: MessageEvent<string>) => {
    let message: BridgeServerMessage
    try {
      message = JSON.parse(event.data) as BridgeServerMessage
    } catch {
      return
    }

    if (message.type === 'status') {
      setStatus(mapAdapterState(message.state, message.scanning))
      return
    }

    if (message.type === 'beacon') {
      const payload = parseIBeacon(Uint8Array.from(message.payload.manufacturerData))
      if (!payload) return
      beaconEmitter.emit({
        payload,
        rssi: message.payload.rssi,
        sourceId: message.payload.sourceId,
        localName: message.payload.localName,
        address: message.payload.address,
        addressType: message.payload.addressType,
      })
    }
  }

  const clearReconnect = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer !== null) return
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS)
  }

  /** Open a socket (shared by `probe()` and `start()`). Resolves on open. */
  const connect = (): Promise<boolean> => {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(true)
    if (connecting) return connecting

    connecting = new Promise<boolean>((resolve) => {
      let settled = false
      const done = (ok: boolean) => {
        if (settled) return
        settled = true
        resolve(ok)
      }

      try {
        const ws = new WebSocket(bridgeUrl())
        socket = ws

        ws.onopen = () => {
          reconnectDelay = RECONNECT_BASE_MS
          setStatus({ status: 'idle', scanning: wantScanning })
          if (wantScanning) send({ type: 'start' })
          done(true)
        }

        ws.onmessage = handleMessage

        ws.onerror = () => {
          done(false)
        }

        ws.onclose = () => {
          if (socket === ws) socket = null
          setStatus({
            status: 'off',
            scanning: false,
            message: 'The Node bridge is not connected.',
          })
          done(false)
          scheduleReconnect()
        }
      } catch {
        connecting = null
        done(false)
      }
    }).finally(() => {
      connecting = null
    })

    return connecting
  }

  return {
    id: 'bridge',
    label: 'Node bridge',
    hint: 'Runs @stoprocent/noble locally. Start it with `pnpm dev:server`.',

    async probe() {
      const opened = await Promise.race([
        connect(),
        new Promise<boolean>((resolve) =>
          window.setTimeout(() => resolve(false), PROBE_TIMEOUT_MS),
        ),
      ])
      return opened
    },

    getStatus: () => last,
    onStatus: statusEmitter.subscribe,
    onBeacon: beaconEmitter.subscribe,

    async start() {
      wantScanning = true
      const opened = await connect()
      if (!opened) {
        setStatus({
          status: 'error',
          scanning: false,
          message: 'Could not reach the Node bridge. Is `pnpm dev:server` running?',
        })
        return
      }
      send({ type: 'start' })
      setStatus({ status: 'searching', scanning: true })
    },

    async stop() {
      wantScanning = false
      send({ type: 'stop' })
      setStatus({ status: 'idle', scanning: false })
    },

    dispose() {
      disposed = true
      wantScanning = false
      clearReconnect()
      if (socket) {
        socket.onclose = null
        socket.onerror = null
        socket.onmessage = null
        socket.onopen = null
        socket.close()
        socket = null
      }
      statusEmitter.clear()
      beaconEmitter.clear()
    },
  }
}
