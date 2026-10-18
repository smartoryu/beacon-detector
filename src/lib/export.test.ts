import { describe, expect, it } from 'vitest'
import type { Beacon } from '../types'
import { toCsv, toJson } from './export'
import { sortBeacons } from './sort'

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
    isNew: false,
    ...overrides,
  }
}

describe('sortBeacons', () => {
  const near = makeBeacon({ key: 'a', uuid: 'a', rssi: -50, lastSeen: 100 })
  const far = makeBeacon({ key: 'b', uuid: 'b', rssi: -90, lastSeen: 300 })
  const unknown = makeBeacon({ key: 'c', uuid: 'c', rssi: null, lastSeen: 200 })

  it('sorts strongest signal first and sinks null RSSI last', () => {
    expect(sortBeacons([far, unknown, near], 'rssi').map((b) => b.key)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('sorts most recently seen first', () => {
    expect(sortBeacons([near, far, unknown], 'lastSeen').map((b) => b.key)).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  it('sorts by uuid then major/minor', () => {
    const list = [makeBeacon({ key: 'z', uuid: 'z' }), makeBeacon({ key: 'a', uuid: 'a' })]
    expect(sortBeacons(list, 'uuid').map((b) => b.uuid)).toEqual(['a', 'z'])
  })

  it('does not mutate the input', () => {
    const list = [far, near]
    sortBeacons(list, 'rssi')
    expect(list.map((b) => b.key)).toEqual(['b', 'a'])
  })
})

describe('exports', () => {
  it('serialises JSON with metadata and a count', () => {
    const parsed = JSON.parse(toJson([makeBeacon()]))
    expect(parsed.count).toBe(1)
    expect(parsed.beacons[0]).toMatchObject({
      uuid: 'uuid-a',
      major: 1,
      minor: 1,
      rssi: -70,
      proximity: 'far',
    })
    expect(typeof parsed.exportedAt).toBe('string')
  })

  it('writes a CSV header and one row per beacon', () => {
    const rows = toCsv([makeBeacon(), makeBeacon({ key: 'x', uuid: 'x' })]).split('\r\n')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('uuid,major,minor')
  })

  it('escapes commas and quotes in CSV fields', () => {
    const csv = toCsv([makeBeacon({ localName: 'Desk, "corner"' })])
    expect(csv).toContain('"Desk, ""corner"""')
  })
})
