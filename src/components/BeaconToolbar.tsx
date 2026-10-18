import { ArrowDownWideNarrow, Download, Trash2 } from 'lucide-react'
import type { SortKey } from '../types'

interface BeaconToolbarProps {
  count: number
  sortKey: SortKey
  onSortChange: (key: SortKey) => void
  onExportJson: () => void
  onExportCsv: () => void
  onClearAll: () => void
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'rssi', label: 'Strongest signal' },
  { value: 'lastSeen', label: 'Most recent' },
  { value: 'uuid', label: 'UUID' },
]

export function BeaconToolbar({
  count,
  sortKey,
  onSortChange,
  onExportJson,
  onExportCsv,
  onClearAll,
}: BeaconToolbarProps) {
  const empty = count === 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <ArrowDownWideNarrow className="size-4" aria-hidden />
        <label htmlFor="beacon-sort" className="sr-only">
          Sort beacons
        </label>
        <select
          id="beacon-sort"
          value={sortKey}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-500"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExportJson}
          disabled={empty}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="size-3.5" aria-hidden />
          JSON
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          disabled={empty}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="size-3.5" aria-hidden />
          CSV
        </button>
        <button
          type="button"
          onClick={onClearAll}
          disabled={empty}
          className="inline-flex items-center gap-1.5 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-sm text-rose-300 transition hover:border-rose-700 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Clear all
        </button>
      </div>
    </div>
  )
}
