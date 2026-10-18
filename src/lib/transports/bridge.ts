import type {
  AdapterStatus,
  BridgeClientMessage,
  BridgeServerMessage,
  RawBeaconEvent,
} from '../../types'
import { loadBridgeSettings, resolveBridgeUrl } from '../bridgeSettings'
import { parseIBeacon } from '../ibeacon'
import { createEmitter, type BleTransport, type TransportStatus } from './types'

const PROBE_TIMEOUT_MS = 900
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 10_000

/** WebSocket close code used by the bridge for a failed/invalid auth frame. */
const CLOSE_UNAUTHORIZED = 4401

const OFF_MESSAGE = 'Bluetooth is turned off.'
const UNAUTHORIZED_MESSAGE =
  'Bluetooth permission was denied for the Node process. Allow it in System Settings → Privacy & Security → Bluetooth, then restart the bridge.'
const BAD_TOKEN_MESSAGE =
  'The bridge rejected the token. Update it in Bridge settings and try again.'
const OFFLINE_MESSAGE = 'The Node bridge is not connected.'

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
 * re-issues the last requested scan intent after the auth handshake. The
 * endpoint and token are read from {@link loadBridgeSettings} on every connect,
 * because a Cloudflare quick-tunnel URL changes on each restart.
 */
export function createBridgeTransport(): BleTransport {
  const statusEmitter = createEmitter<TransportStatus>()
  const beaconEmitter = createEmitter<RawBeaconEvent>()

  let socket: WebSocket | null = null
  let connecting: Promise<boolean> | null = null
  let reconnectTimer: number | null = null
  let reconnectDelay = RECONNECT_BASE_MS
  let wantScanning = false
  let startRequested = false
  let authed = false
  let authToken = ''
  let disposed = false
  let last: TransportStatus = {
    status: 'off',
    scanning: false,
    message: OFFLINE_MESSAGE,
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

  const maybeStart = () => {
    if (!authed || !wantScanning || startRequested) return
    startRequested = true
    send({ type: 'start' })
  }

  const handleMessage = (event: MessageEvent<string>) => {
    let message: BridgeServerMessage
    try {
      message = JSON.parse(event.data) as BridgeServerMessage
    } catch {
      return
    }

    if (message.type === 'hello') {
      if (message.authRequired) {
        send({ type: 'auth', token: authToken })
      } else {
        authed = true
        maybeStart()
      }
      return
    }

    if (message.type === 'status') {
      // The server only sends status after a successful handshake.
      if (!authed) {
        authed = true
        maybeStart()
      }
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

  const teardownSocket = () => {
    if (!socket) return
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    socket.onopen = null
    try {
      socket.close()
    } catch {
      /* already closed */
    }
    socket = null
  }

  /** Open a socket (shared by `probe()`, `start()` and `reconnect()`). */
  const connect = (): Promise<boolean> => {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(true)
    if (connecting) return connecting

    const settings = loadBridgeSettings()
    authToken = settings.token
    authed = false
    startRequested = false

    connecting = new Promise<boolean>((resolve) => {
      let settled = false
      const done = (ok: boolean) => {
        if (settled) return
        settled = true
        resolve(ok)
      }

      try {
        const ws = new WebSocket(resolveBridgeUrl(settings))
        socket = ws

        ws.onopen = () => {
          reconnectDelay = RECONNECT_BASE_MS
          setStatus({ status: 'idle', scanning: wantScanning })
          done(true)
        }

        ws.onmessage = handleMessage

        ws.onerror = () => {
          done(false)
        }

        ws.onclose = (event) => {
          if (socket === ws) socket = null
          authed = false
          startRequested = false
          done(false)

          if (event.code === CLOSE_UNAUTHORIZED) {
            // A wrong token is not transient — don't loop on reconnect.
            setStatus({
              status: 'unauthorized',
              scanning: false,
              message: BAD_TOKEN_MESSAGE,
            })
            return
          }

          setStatus({ status: 'off', scanning: false, message: OFFLINE_MESSAGE })
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
    hint: 'Runs @stoprocent/noble locally. Start it with `pnpm bridge`.',

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
          message:
            'Could not reach the Node bridge. Is `pnpm bridge` running, and is the bridge URL correct?',
        })
        return
      }
      maybeStart()
      setStatus({ status: 'searching', scanning: true })
    },

    async stop() {
      wantScanning = false
      startRequested = false
      send({ type: 'stop' })
      setStatus({ status: 'idle', scanning: false })
    },

    async reconnect() {
      clearReconnect()
      if (connecting) {
        try {
          await connecting
        } catch {
          /* ignore — we are replacing the socket anyway */
        }
      }
      teardownSocket()
      authed = false
      startRequested = false
      const opened = await connect()
      if (opened) maybeStart()
    },

    dispose() {
      disposed = true
      wantScanning = false
      clearReconnect()
      teardownSocket()
      statusEmitter.clear()
      beaconEmitter.clear()
    },
  }
}
