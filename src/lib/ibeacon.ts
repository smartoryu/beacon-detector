import type { IBeaconPayload } from '../types'

/** Apple, Inc. Bluetooth SIG company identifier. */
export const APPLE_COMPANY_ID = 0x004c

/** Apple's iBeacon AD type / subtype pair: `02 15`. */
const IBEACON_AD_TYPE = 0x02
const IBEACON_AD_LENGTH = 0x15

/** Bytes in the iBeacon manufacturer payload *after* the company ID. */
const IBEACON_PAYLOAD_BYTES = 1 + 1 + 16 + 2 + 2 + 1 // 23

/** Bytes in a complete iBeacon manufacturer-specific data block. */
const IBEACON_TOTAL_BYTES = 2 + IBEACON_PAYLOAD_BYTES // 25

/**
 * Find the `4C 00 02 15` signature and decode the iBeacon fields that follow.
 *
 * Accepts both real-world shapes:
 * - **Node bridge / noble**: the full manufacturer data, company ID included.
 * - **Web Bluetooth**: pass `4C 00` + the `DataView` for company `0x004C`
 *   (see {@link appleManufacturerData}).
 *
 * Returns `null` for anything that is not a well-formed iBeacon.
 */
export function parseIBeacon(
  input: Uint8Array | ArrayLike<number>,
): IBeaconPayload | null {
  const bytes =
    input instanceof Uint8Array ? input : Uint8Array.from(input as ArrayLike<number>)

  if (bytes.length < IBEACON_TOTAL_BYTES) return null

  const limit = bytes.length - IBEACON_TOTAL_BYTES
  for (let offset = 0; offset <= limit; offset++) {
    // company ID (little-endian 0x004C) + AD type/subtype (02 15)
    if (
      bytes[offset] !== 0x4c ||
      bytes[offset + 1] !== 0x00 ||
      bytes[offset + 2] !== IBEACON_AD_TYPE ||
      bytes[offset + 3] !== IBEACON_AD_LENGTH
    ) {
      continue
    }

    const uuid = formatUuid(bytes.subarray(offset + 4, offset + 20))
    const major = (bytes[offset + 20] << 8) | bytes[offset + 21]
    const minor = (bytes[offset + 22] << 8) | bytes[offset + 23]
    // int8: the calibrated RSSI at 1 m is always negative in practice.
    const txPower = ((bytes[offset + 24] << 24) >> 24) as number

    return {
      uuid,
      major,
      minor,
      txPower,
      raw: bytes.slice(offset, offset + IBEACON_TOTAL_BYTES),
    }
  }

  return null
}

/**
 * Build manufacturer data suitable for {@link parseIBeacon} from the Web
 * Bluetooth `BluetoothAdvertisingEvent.manufacturerData` entry for Apple.
 *
 * The browser hands back the payload starting at the AD type (`0x02`), so the
 * 2-byte little-endian company ID must be re-attached.
 */
export function appleManufacturerData(view: DataView): Uint8Array {
  const out = new Uint8Array(view.byteLength + 2)
  out[0] = APPLE_COMPANY_ID & 0xff
  out[1] = (APPLE_COMPANY_ID >> 8) & 0xff
  out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), 2)
  return out
}

/** Render 16 bytes as a canonical lowercase `8-4-4-4-12` UUID. */
export function formatUuid(bytes: Uint8Array): string {
  const hex: string[] = new Array(16)
  for (let i = 0; i < 16; i++) hex[i] = bytes[i].toString(16).padStart(2, '0')
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}

/** The identity key for a beacon: `uuid:major:minor`. */
export function beaconKey(uuid: string, major: number, minor: number): string {
  return `${uuid}:${major}:${minor}`
}

/** Lowercase hex, space-separated, for the raw-details view. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')
}
