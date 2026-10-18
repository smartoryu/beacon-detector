import type { Beacon } from '../types'
import { estimateDistance, proximityLabel } from './rssi'

/** Flattened beacon record for JSON/CSV export. */
export interface BeaconExportRow {
  uuid: string
  major: number
  minor: number
  rssi: number | null
  bestRssi: number | null
  txPower: number | null
  distanceMetres: number | null
  proximity: string
  localName: string
  sightings: number
  firstSeen: string
  lastSeen: string
  sourceId: string
  address: string
  addressType: string
  manufacturerData: string
}

export function toExportRows(beacons: Beacon[]): BeaconExportRow[] {
  return beacons.map((beacon) => {
    const distance = estimateDistance(beacon.rssi, beacon.txPower)
    return {
      uuid: beacon.uuid,
      major: beacon.major,
      minor: beacon.minor,
      rssi: beacon.rssi,
      bestRssi: beacon.bestRssi,
      txPower: beacon.txPower,
      distanceMetres: distance,
      proximity: proximityLabel(distance),
      localName: beacon.localName ?? '',
      sightings: beacon.sightings,
      firstSeen: new Date(beacon.firstSeen).toISOString(),
      lastSeen: new Date(beacon.lastSeen).toISOString(),
      sourceId: beacon.sourceId,
      address: beacon.address ?? '',
      addressType: beacon.addressType ?? '',
      manufacturerData: beacon.rawHex,
    }
  })
}

const CSV_HEADERS: (keyof BeaconExportRow)[] = [
  'uuid',
  'major',
  'minor',
  'rssi',
  'bestRssi',
  'txPower',
  'distanceMetres',
  'proximity',
  'localName',
  'sightings',
  'firstSeen',
  'lastSeen',
  'sourceId',
  'address',
  'addressType',
  'manufacturerData',
]

export function toJson(beacons: Beacon[]): string {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), count: beacons.length, beacons: toExportRows(beacons) },
    null,
    2,
  )
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(beacons: Beacon[]): string {
  const rows = toExportRows(beacons)
  const lines = [CSV_HEADERS.join(',')]
  for (const row of rows) {
    lines.push(CSV_HEADERS.map((header) => escapeCsv(row[header])).join(','))
  }
  return lines.join('\r\n')
}

/** Trigger a client-side file download. */
export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** `beacons-2026-01-31T12-00-00.json` */
export function exportFilename(extension: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `beacons-${stamp}.${extension}`
}

export function downloadJson(beacons: Beacon[]): void {
  download(exportFilename('json'), toJson(beacons), 'application/json')
}

export function downloadCsv(beacons: Beacon[]): void {
  download(exportFilename('csv'), toCsv(beacons), 'text/csv')
}
