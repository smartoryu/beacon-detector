import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Beacon } from '../types'
import { loadBeacons, saveBeacons } from './store'

function createStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

function makeBeacon(overrides: Partial<Beacon> = {}): Beacon {
  return {
    key: 'uuid-a:1:1',
    uuid: 'uuid-a',
    major: 1,
    minor: 1,
    txPower: -59,
    rssi: -70,
    bestRssi: -65,
    firstSeen: 1_000,
    lastSeen: 2_000,
    sightings: 3,
    sourceId: 'dev-1',
    rawHex: '4c 00 02 15',
    isNew: true,
    ...overrides,
  }
}

describe('beacon store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('round-trips a list and clears the flash flag on hydrate', () => {
    saveBeacons('web', [makeBeacon()])
    const loaded = loadBeacons('web')
    expect(loaded).toHaveLength(1)
    expect(loaded[0]).toMatchObject({ uuid: 'uuid-a', isNew: false })
  })

  it('keeps transports isolated', () => {
    saveBeacons('web', [makeBeacon({ key: 'web-1', uuid: 'web-1' })])
    expect(loadBeacons('bridge')).toEqual([])
  })

  it('returns an empty list for missing, corrupt or stale data', () => {
    expect(loadBeacons('web')).toEqual([])

    localStorage.setItem('beacon-detector:beacons:web', '{not json')
    expect(loadBeacons('web')).toEqual([])

    localStorage.setItem(
      'beacon-detector:beacons:web',
      JSON.stringify({ version: 99, beacons: [makeBeacon()] }),
    )
    expect(loadBeacons('web')).toEqual([])
  })

  it('drops malformed rows but keeps valid ones', () => {
    localStorage.setItem(
      'beacon-detector:beacons:web',
      JSON.stringify({ version: 1, beacons: [makeBeacon(), { nope: true }] }),
    )
    expect(loadBeacons('web')).toHaveLength(1)
  })

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => saveBeacons('web', [makeBeacon()])).not.toThrow()
    expect(loadBeacons('web')).toEqual([])
  })
})
