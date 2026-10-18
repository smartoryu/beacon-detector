import type { Beacon, TransportId } from '../types'

/**
 * Local persistence for the "keep forever" beacon list.
 *
 * The list is stored **per transport** so switching between the browser and
 * the bridge shows each backend's own history instead of wiping the other's.
 * Rows are hydrated with `isNew: false` so nothing flashes on reload.
 */
const STORAGE_VERSION = 1

const storageKey = (transportId: TransportId) => `beacon-detector:beacons:${transportId}`

interface PersistedBeacons {
  version: number
  beacons: Beacon[]
}

function isBeacon(value: unknown): value is Beacon {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Beacon>
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.uuid === 'string' &&
    typeof candidate.major === 'number' &&
    typeof candidate.minor === 'number' &&
    typeof candidate.lastSeen === 'number'
  )
}

export function loadBeacons(transportId: TransportId): Beacon[] {
  try {
    const raw = localStorage.getItem(storageKey(transportId))
    if (!raw) return []

    const parsed = JSON.parse(raw) as PersistedBeacons
    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.beacons)) {
      return []
    }

    return parsed.beacons.filter(isBeacon).map((beacon) => ({ ...beacon, isNew: false }))
  } catch {
    // Corrupt JSON or storage disabled (private mode) — start empty.
    return []
  }
}

export function saveBeacons(transportId: TransportId, beacons: Beacon[]): void {
  try {
    const payload: PersistedBeacons = { version: STORAGE_VERSION, beacons }
    localStorage.setItem(storageKey(transportId), JSON.stringify(payload))
  } catch {
    // Quota or storage disabled — the in-memory list still works.
  }
}
