import type { Beacon } from '../types'
import { BeaconCard } from './BeaconCard'

interface BeaconListProps {
  beacons: Beacon[]
  now: number
  onRemove: (key: string) => void
}

export function BeaconList({ beacons, now, onRemove }: BeaconListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {beacons.map((beacon) => (
        <li key={beacon.key}>
          <BeaconCard beacon={beacon} now={now} onRemove={onRemove} />
        </li>
      ))}
    </ul>
  )
}
