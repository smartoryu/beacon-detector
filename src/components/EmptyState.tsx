import { Radar } from 'lucide-react'

interface EmptyStateProps {
  scanning: boolean
  transportLabel: string
}

export function EmptyState({ scanning, transportLabel }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-16 text-center">
      <Radar className={`size-8 ${scanning ? 'animate-pulse text-sky-400' : 'text-slate-600'}`} aria-hidden />
      <p className="text-sm font-medium text-slate-300">
        {scanning ? 'Searching for iBeacons…' : 'No beacons yet'}
      </p>
      <p className="max-w-sm text-xs leading-relaxed text-slate-500">
        {scanning ? (
          <>
            No iBeacon advertisements received yet via{' '}
            <span className="text-slate-400">{transportLabel}</span>. Move closer to a beacon or
            confirm it is advertising.
          </>
        ) : (
          <>
            Press <span className="text-slate-400">Scan</span> to start listening via{' '}
            <span className="text-slate-400">{transportLabel}</span>.
          </>
        )}
      </p>
    </div>
  )
}
