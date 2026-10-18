import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  formatClock,
  formatDistance,
  formatNumber,
  formatRelative,
  formatRssi,
  formatTxPower,
} from '../lib/format'
import { estimateDistance, proximityLabel, rssiBars, type ProximityLabel } from '../lib/rssi'
import type { Beacon } from '../types'

const PROXIMITY_STYLES: Record<ProximityLabel, string> = {
  immediate: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  near: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  far: 'border-slate-700 bg-slate-800/60 text-slate-400',
  unknown: 'border-slate-700 bg-slate-800/60 text-slate-500',
}

function SignalBars({ bars }: { bars: number }) {
  const active = bars >= 4 ? 'bg-emerald-400' : bars === 3 ? 'bg-sky-400' : bars === 2 ? 'bg-amber-400' : 'bg-rose-500'
  return (
    <span className="flex items-end gap-0.5" aria-label={`${bars} of 4 signal bars`}>
      {[1, 2, 3, 4].map((level) => (
        <span
          key={level}
          className={`w-1 rounded-sm ${level <= bars ? active : 'bg-slate-700'}`}
          style={{ height: `${4 + level * 3}px` }}
        />
      ))}
    </span>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="truncate font-mono text-xs text-slate-300" title={value}>
        {value}
      </dd>
    </div>
  )
}

interface BeaconCardProps {
  beacon: Beacon
  now: number
  onRemove: (key: string) => void
}

export function BeaconCard({ beacon, now, onRemove }: BeaconCardProps) {
  const [expanded, setExpanded] = useState(false)

  const distance = estimateDistance(beacon.rssi, beacon.txPower)
  const proximity = proximityLabel(distance)
  const bars = rssiBars(beacon.rssi)
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <article
      className={`rounded-xl border border-slate-800 bg-slate-900/50 p-4 ${
        beacon.isNew ? 'animate-flash' : ''
      }`}
    >
      <header className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <SignalBars bars={bars} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-100">{formatRssi(beacon.rssi)}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${PROXIMITY_STYLES[proximity]}`}
            >
              {proximity}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] font-mono text-slate-400">
              major {beacon.major}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] font-mono text-slate-400">
              minor {beacon.minor}
            </span>
            {beacon.localName ? (
              <span className="text-xs text-slate-400">{beacon.localName}</span>
            ) : null}
          </div>

          <p className="mt-1 truncate font-mono text-xs text-slate-400" title={beacon.uuid}>
            {beacon.uuid}
          </p>

          <p className="mt-1 text-[11px] text-slate-500">
            seen {formatRelative(beacon.lastSeen, now)} · {formatNumber(beacon.sightings)}{' '}
            sighting{beacon.sightings === 1 ? '' : 's'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRemove(beacon.key)}
          title="Remove this beacon"
          aria-label={`Remove beacon ${beacon.uuid} major ${beacon.major} minor ${beacon.minor}`}
          className="shrink-0 rounded-md border border-transparent p-1.5 text-slate-500 transition hover:border-rose-900/60 hover:bg-rose-950/40 hover:text-rose-300"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-800/70 pt-3 sm:grid-cols-4">
        <Field label="Distance" value={formatDistance(distance)} />
        <Field label="TX power" value={formatTxPower(beacon.txPower)} />
        <Field label="Best RSSI" value={formatRssi(beacon.bestRssi)} />
        <Field label="First seen" value={formatRelative(beacon.firstSeen, now)} />
      </dl>

      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition hover:text-slate-300"
      >
        <Chevron className="size-3.5" aria-hidden />
        Raw details
      </button>

      {expanded ? (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-2">
          <Field label="Source id" value={beacon.sourceId} />
          <Field label="Address" value={beacon.address ?? '—'} />
          <Field label="Address type" value={beacon.addressType ?? '—'} />
          <Field label="Last seen at" value={formatClock(beacon.lastSeen)} />
          <div className="sm:col-span-2">
            <dt className="text-[11px] tracking-wide text-slate-500 uppercase">
              Manufacturer data
            </dt>
            <dd className="mt-1 font-mono text-[11px] leading-relaxed break-all text-slate-400">
              {beacon.rawHex}
            </dd>
          </div>
        </dl>
      ) : null}
    </article>
  )
}
