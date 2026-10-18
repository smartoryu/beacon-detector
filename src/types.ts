/**
 * Shared domain types for Beacon Detector.
 *
 * Two transports feed the same normalized stream of {@link RawBeaconEvent}s:
 * the browser's experimental Web Bluetooth LE scan and the local Node BLE
 * bridge. Everything downstream (dedup, merge, UI) is transport-agnostic.
 */

/** Which Bluetooth backend the UI is currently using. */
export type TransportId = 'web' | 'bridge'

/**
 * Normalized adapter/scan status. This is the single enum that drives the
 * status banner regardless of which transport produced it.
 */
export type AdapterStatus =
  | 'searching'
  | 'idle'
  | 'off'
  | 'unauthorized'
  | 'unsupported'
  | 'error'

/** A decoded iOS iBeacon payload. */
export interface IBeaconPayload {
  /** Canonical lowercase 8-4-4-4-12 proximity UUID. */
  uuid: string
  major: number
  minor: number
  /** Calibrated RSSI at 1 m (int8 dBm). `null` when the advertiser omits it. */
  txPower: number | null
  /** The exact manufacturer-data bytes that were decoded. */
  raw: Uint8Array
}

/**
 * One sighting of a beacon, as emitted by a transport. The scanner turns these
 * into merged {@link Beacon} rows.
 */
export interface RawBeaconEvent {
  payload: IBeaconPayload
  /** RSSI of this sighting in dBm; `null` when the transport cannot report it. */
  rssi: number | null
  /** Transport-specific device handle (opaque). */
  sourceId: string
  /** Advertised local name, when the advertiser sets one. */
  localName?: string
  /** Bridge only: hardware address or platform identifier. */
  address?: string
  /** Bridge only: noble address type (e.g. `public`, `random`). */
  addressType?: string
}

/** A merged, de-duplicated beacon row shown in the list. */
export interface Beacon {
  /** Identity key: `uuid:major:minor`. */
  key: string
  uuid: string
  major: number
  minor: number
  /** Calibrated TX power from the most recent sighting. */
  txPower: number | null
  /** Smoothed (EMA) RSSI in dBm, rounded; `null` if never reported. */
  rssi: number | null
  /** Strongest raw RSSI ever observed. */
  bestRssi: number | null
  firstSeen: number
  lastSeen: number
  /** Number of sightings since the row was created. */
  sightings: number
  localName?: string
  sourceId: string
  address?: string
  addressType?: string
  /** Hex of the raw manufacturer data (for the expandable details view). */
  rawHex: string
  /** True until the first re-sighting — drives the one-shot row flash. */
  isNew: boolean
}

/** Sort options offered by the toolbar. */
export type SortKey = 'rssi' | 'lastSeen' | 'uuid'

/** Connection state of the bridge transport. */
export type BridgeConnection = 'connecting' | 'online' | 'offline'

/* ------------------------------------------------------------------ *
 * Node bridge wire protocol (JSON over WebSocket at /ble-ws)
 * ------------------------------------------------------------------ */

export interface BridgeStatusMessage {
  type: 'status'
  /** Raw noble adapter state, or a synthetic value we derive from errors. */
  state: string
  scanning: boolean
}

export interface BridgeBeaconMessage {
  type: 'beacon'
  payload: {
    sourceId: string
    rssi: number | null
    localName?: string
    address?: string
    addressType?: string
    /** Full manufacturer data including the 2-byte company ID. */
    manufacturerData: number[]
  }
}

export interface BridgeHelloMessage {
  type: 'hello'
  version: number
  /** True when the bridge requires an `auth` frame before anything else. */
  authRequired: boolean
}

export type BridgeServerMessage =
  | BridgeStatusMessage
  | BridgeBeaconMessage
  | BridgeHelloMessage

export type BridgeClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'ping' }
