import { describe, expect, it } from 'vitest'
import {
  appleManufacturerData,
  beaconKey,
  formatUuid,
  parseIBeacon,
  toHex,
} from './ibeacon'
import { estimateDistance, proximityLabel, rssiBars, smoothRssi } from './rssi'

const UUID_BYTES = [
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
  0x0e, 0x0f, 0x10,
]
const UUID = '01020304-0506-0708-090a-0b0c0d0e0f10'

const beacon = () =>
  new Uint8Array([0x4c, 0x00, 0x02, 0x15, ...UUID_BYTES, 0x00, 0x01, 0x00, 0x02, 0xc5])

describe('parseIBeacon', () => {
  it('decodes a canonical iBeacon', () => {
    const parsed = parseIBeacon(beacon())
    expect(parsed).not.toBeNull()
    expect(parsed).toMatchObject({ uuid: UUID, major: 1, minor: 2, txPower: -59 })
    expect(parsed!.raw).toHaveLength(25)
  })

  it('finds the signature when preceded by other AD structures', () => {
    const framed = new Uint8Array([0x02, 0x01, 0x06, ...beacon()])
    expect(parseIBeacon(framed)?.uuid).toBe(UUID)
  })

  it('accepts the Web Bluetooth shape (no company ID)', () => {
    const full = beacon()
    const view = new DataView(full.buffer, full.byteOffset + 2, full.byteLength - 2)
    expect(parseIBeacon(appleManufacturerData(view))?.uuid).toBe(UUID)
  })

  it('rejects a non-Apple company ID', () => {
    const other = beacon()
    other[0] = 0xff
    other[1] = 0xff
    expect(parseIBeacon(other)).toBeNull()
  })

  it('rejects a wrong AD length byte', () => {
    const bad = beacon()
    bad[3] = 0x10
    expect(parseIBeacon(bad)).toBeNull()
  })

  it('rejects a wrong subtype', () => {
    const bad = beacon()
    bad[2] = 0x03
    expect(parseIBeacon(bad)).toBeNull()
  })

  it('rejects truncated buffers', () => {
    expect(parseIBeacon(beacon().subarray(0, 20))).toBeNull()
    expect(parseIBeacon(new Uint8Array(0))).toBeNull()
  })

  it('decodes unsigned major/minor and zero tx power', () => {
    const b = beacon()
    b[20] = 0xff
    b[21] = 0xfe // major 65534
    b[22] = 0x80
    b[23] = 0x00 // minor 32768
    b[24] = 0x00 // 0 dBm
    expect(parseIBeacon(b)).toMatchObject({
      major: 65534,
      minor: 32768,
      txPower: 0,
    })
  })

  it('decodes positive int8 tx power', () => {
    const b = beacon()
    b[24] = 0x04 // +4 dBm
    expect(parseIBeacon(b)?.txPower).toBe(4)
  })

  it('accepts a plain number array', () => {
    expect(parseIBeacon([...beacon()])?.uuid).toBe(UUID)
  })
})

describe('formatUuid / beaconKey / toHex', () => {
  it('formats canonical lowercase UUIDs', () => {
    expect(formatUuid(new Uint8Array(UUID_BYTES))).toBe(UUID)
  })

  it('builds the identity key from uuid:major:minor', () => {
    expect(beaconKey(UUID, 1, 2)).toBe(`${UUID}:1:2`)
  })

  it('renders space-separated hex', () => {
    expect(toHex(new Uint8Array([0x4c, 0x00, 0x0f]))).toBe('4c 00 0f')
  })
})

describe('estimateDistance', () => {
  it('returns ~1 m when rssi equals txPower', () => {
    expect(estimateDistance(-59, -59)).toBe(1)
  })

  it('grows as the signal weakens', () => {
    const near = estimateDistance(-70, -59)!
    const far = estimateDistance(-90, -59)!
    expect(far).toBeGreaterThan(near)
  })

  it('is null without both inputs', () => {
    expect(estimateDistance(null, -59)).toBeNull()
    expect(estimateDistance(-59, null)).toBeNull()
  })

  it('clamps to a sane range', () => {
    expect(estimateDistance(-5, -100)).toBe(0.05)
    expect(estimateDistance(-120, -40)).toBe(100)
  })
})

describe('proximityLabel', () => {
  it('labels the bands', () => {
    expect(proximityLabel(null)).toBe('unknown')
    expect(proximityLabel(0.2)).toBe('immediate')
    expect(proximityLabel(2)).toBe('near')
    expect(proximityLabel(8)).toBe('far')
  })
})

describe('rssiBars', () => {
  it('maps rssi to 0–4 bars', () => {
    expect(rssiBars(null)).toBe(0)
    expect(rssiBars(-90)).toBe(0)
    expect(rssiBars(-80)).toBe(1)
    expect(rssiBars(-70)).toBe(2)
    expect(rssiBars(-60)).toBe(3)
    expect(rssiBars(-40)).toBe(4)
  })
})

describe('smoothRssi', () => {
  it('seeds on the first reading', () => {
    expect(smoothRssi(null, -60)).toBe(-60)
  })

  it('moves toward the new reading by alpha', () => {
    expect(smoothRssi(-60, -80)).toBeCloseTo(-66)
  })
})
