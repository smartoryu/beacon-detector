import type { Beacon, SortKey } from '../types'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Sort a copy of the beacon list.
 *
 * `rssi` puts the strongest signal first and sinks rows that have never
 * reported an RSSI to the bottom (they sort among themselves by recency).
 */
export function sortBeacons(beacons: Beacon[], sortKey: SortKey): Beacon[] {
  const sorted = beacons.slice()

  switch (sortKey) {
    case 'rssi':
      sorted.sort((a, b) => {
        if (a.rssi === null && b.rssi === null) return b.lastSeen - a.lastSeen
        if (a.rssi === null) return 1
        if (b.rssi === null) return -1
        return b.rssi - a.rssi
      })
      break
    case 'lastSeen':
      sorted.sort((a, b) => b.lastSeen - a.lastSeen)
      break
    case 'uuid':
      sorted.sort(
        (a, b) =>
          collator.compare(a.uuid, b.uuid) || a.major - b.major || a.minor - b.minor,
      )
      break
  }

  return sorted
}
