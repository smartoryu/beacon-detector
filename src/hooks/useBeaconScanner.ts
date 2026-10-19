import { useCallback, useEffect, useState } from 'react'
import { beaconKey, toHex } from '../lib/ibeacon'
import { smoothRssi } from '../lib/rssi'
import { loadBeacons, saveBeacons } from '../lib/store'
import { TRANSPORT_STORAGE_KEY } from '../lib/storageKeys'
import { createBridgeTransport } from '../lib/transports/bridge'
import type { BleTransport, TransportStatus } from '../lib/transports/types'
import { createWebBluetoothTransport } from '../lib/transports/webBluetooth'
import type { Beacon, RawBeaconEvent, TransportId } from '../types'

/**
 * Transports are module singletons so React StrictMode's double-render and
 * effect replay cannot leave duplicate global listeners behind.
 */
let transports: Record<TransportId, BleTransport> | null = null
function getTransports(): Record<TransportId, BleTransport> {
  if (!transports) {
    transports = {
      web: createWebBluetoothTransport(),
      bridge: createBridgeTransport(),
    }
  }
  return transports
}

function readStoredTransport(): TransportId {
  try {
    return localStorage.getItem(TRANSPORT_STORAGE_KEY) === 'bridge' ? 'bridge' : 'web'
  } catch {
    return 'web'
  }
}

/**
 * Fold one sighting into the (append-only) beacon list.
 *
 * Rows are keyed by `uuid:major:minor` and never expire — the operator prunes
 * the list manually. RSSI is smoothed with an EMA; `isNew` clears the first
 * time a row is seen again, which ends the one-shot row flash.
 */
function applySighting(prev: Beacon[], event: RawBeaconEvent, now: number): Beacon[] {
  const { payload } = event
  const key = beaconKey(payload.uuid, payload.major, payload.minor)
  const index = prev.findIndex((beacon) => beacon.key === key)
  const existing = index >= 0 ? prev[index] : undefined

  const rssi =
    event.rssi === null
      ? (existing?.rssi ?? null)
      : Math.round(smoothRssi(existing?.rssi ?? null, event.rssi))

  const bestRssi =
    event.rssi === null
      ? (existing?.bestRssi ?? null)
      : existing?.bestRssi != null
        ? Math.max(existing.bestRssi, event.rssi)
        : event.rssi

  const next: Beacon = {
    key,
    uuid: payload.uuid,
    major: payload.major,
    minor: payload.minor,
    txPower: payload.txPower,
    rssi,
    bestRssi,
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    sightings: (existing?.sightings ?? 0) + 1,
    localName: event.localName ?? existing?.localName,
    sourceId: event.sourceId,
    address: event.address ?? existing?.address,
    addressType: event.addressType ?? existing?.addressType,
    rawHex: toHex(payload.raw),
    isNew: existing ? false : true,
  }

  if (index < 0) return [next, ...prev]

  const copy = prev.slice()
  copy[index] = next
  return copy
}

export interface BeaconScanner {
  transportId: TransportId
  selectTransport: (id: TransportId) => void
  status: TransportStatus
  scanning: boolean
  beacons: Beacon[]
  start: () => void
  stop: () => void
  toggle: () => void
  /** Reconnect the bridge after its URL/token settings changed. */
  reconnectBridge: () => void
  removeBeacon: (key: string) => void
  clearAll: () => void
  /** `null` while the availability probe is still in flight. */
  availability: Record<TransportId, boolean | null>
}

export function useBeaconScanner(): BeaconScanner {
  const registry = getTransports()

  const [transportId, setTransportId] = useState<TransportId>(readStoredTransport)
  const [beacons, setBeacons] = useState<Beacon[]>(() => loadBeacons(readStoredTransport()))
  const [status, setStatus] = useState<TransportStatus>(() =>
    registry[readStoredTransport()].getStatus(),
  )
  const [availability, setAvailability] = useState<Record<TransportId, boolean | null>>({
    web: null,
    bridge: null,
  })

  // Persist the "keep forever" list, scoped to the active transport.
  useEffect(() => {
    saveBeacons(transportId, beacons)
  }, [transportId, beacons])

  // Subscribe to the active transport; switching tears the old one down.
  useEffect(() => {
    const active = registry[transportId]

    const offStatus = active.onStatus(setStatus)
    const offBeacon = active.onBeacon((event) => {
      const now = Date.now()
      setBeacons((prev) => applySighting(prev, event, now))
    })

    return () => {
      offStatus()
      offBeacon()
      void active.stop()
    }
  }, [registry, transportId])

  // Availability probe for the transport switch.
  useEffect(() => {
    let cancelled = false
    void registry.web.probe().then((ok) => {
      if (!cancelled) setAvailability((prev) => ({ ...prev, web: ok }))
    })
    void registry.bridge.probe().then((ok) => {
      if (!cancelled) setAvailability((prev) => ({ ...prev, bridge: ok }))
    })
    return () => {
      cancelled = true
    }
  }, [registry])

  const selectTransport = useCallback(
    (id: TransportId) => {
      setTransportId(id)
      // Swap in that transport's own persisted history and current status
      // (batched with the id change so the persist effect never sees a
      // mismatched pair).
      setBeacons(loadBeacons(id))
      setStatus(registry[id].getStatus())
      try {
        localStorage.setItem(TRANSPORT_STORAGE_KEY, id)
      } catch {
        /* private mode */
      }
    },
    [registry],
  )

  const start = useCallback(() => {
    void registry[transportId].start()
  }, [registry, transportId])

  const stop = useCallback(() => {
    void registry[transportId].stop()
  }, [registry, transportId])

  const toggle = useCallback(() => {
    const active = registry[transportId]
    if (active.getStatus().scanning) void active.stop()
    else void active.start()
  }, [registry, transportId])

  const reconnectBridge = useCallback(() => {
    const bridge = registry.bridge
    void (bridge.reconnect?.() ?? Promise.resolve()).then(async () => {
      const ok = await bridge.probe()
      setAvailability((prev) => ({ ...prev, bridge: ok }))
    })
  }, [registry])

  const removeBeacon = useCallback((key: string) => {
    setBeacons((prev) => prev.filter((beacon) => beacon.key !== key))
  }, [])

  const clearAll = useCallback(() => setBeacons([]), [])

  return {
    transportId,
    selectTransport,
    status,
    scanning: status.scanning,
    beacons,
    start,
    stop,
    toggle,
    reconnectBridge,
    removeBeacon,
    clearAll,
    availability,
  }
}
