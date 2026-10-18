import { Play, Square } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BeaconList } from './components/BeaconList'
import { BeaconToolbar } from './components/BeaconToolbar'
import { BluetoothStatusBanner } from './components/BluetoothStatusBanner'
import { EmptyState } from './components/EmptyState'
import { TransportSwitch } from './components/TransportSwitch'
import { useBeaconScanner } from './hooks/useBeaconScanner'
import { useNow } from './hooks/useNow'
import { downloadCsv, downloadJson } from './lib/export'
import { sortBeacons } from './lib/sort'
import type { SortKey, TransportId } from './types'

const TRANSPORT_OPTIONS: { id: TransportId; label: string; hint: string }[] = [
  {
    id: 'web',
    label: 'Browser',
    hint: 'Chrome/Edge with the experimental Web Bluetooth scanning flag.',
  },
  {
    id: 'bridge',
    label: 'Node bridge',
    hint: 'Not reachable. Start it with `pnpm dev:server`.',
  },
]

export default function App() {
  const scanner = useBeaconScanner()
  const now = useNow(1000)
  const [sortKey, setSortKey] = useState<SortKey>('rssi')

  const sorted = useMemo(() => sortBeacons(scanner.beacons, sortKey), [scanner.beacons, sortKey])

  const activeOption = TRANSPORT_OPTIONS.find((option) => option.id === scanner.transportId)
  const transportLabel = activeOption?.label ?? 'unknown'
  const canScan =
    scanner.availability[scanner.transportId] !== false && scanner.status.status !== 'unsupported'

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Beacon Detector</h1>
        <p className="mt-1 text-sm text-slate-400">
          Find every iBeacon-compatible BLE beacon in range and inspect its metadata.
        </p>
      </header>

      <BluetoothStatusBanner status={scanner.status} transportLabel={transportLabel} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TransportSwitch
          value={scanner.transportId}
          onChange={scanner.selectTransport}
          availability={scanner.availability}
          options={TRANSPORT_OPTIONS}
        />

        <button
          type="button"
          onClick={scanner.toggle}
          disabled={!canScan}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            scanner.scanning
              ? 'bg-rose-600 text-white hover:bg-rose-500'
              : 'bg-sky-600 text-white hover:bg-sky-500'
          }`}
        >
          {scanner.scanning ? (
            <>
              <Square className="size-4" aria-hidden />
              Stop
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden />
              Scan
            </>
          )}
        </button>
      </div>

      <BeaconToolbar
        count={sorted.length}
        sortKey={sortKey}
        onSortChange={setSortKey}
        onExportJson={() => downloadJson(sorted)}
        onExportCsv={() => downloadCsv(sorted)}
        onClearAll={scanner.clearAll}
      />

      {sorted.length === 0 ? (
        <EmptyState scanning={scanner.scanning} transportLabel={transportLabel} />
      ) : (
        <BeaconList beacons={sorted} now={now} onRemove={scanner.removeBeacon} />
      )}

      <footer className="mt-auto border-t border-slate-900 pt-4 text-[11px] leading-relaxed text-slate-600">
        <p>
          Web Bluetooth scanning is experimental and Chrome/Edge-only: enable{' '}
          <code className="font-mono text-slate-500">
            chrome://flags/#enable-experimental-web-platform-features
          </code>
          . For a passive scan of every advertiser plus a true adapter on/off state, run the Node
          bridge (<code className="font-mono text-slate-500">pnpm dev:server</code>).
        </p>
        <p className="mt-1">
          iBeacon advertisements are anonymous — the app cannot identify their owner.
        </p>
      </footer>
    </div>
  )
}
