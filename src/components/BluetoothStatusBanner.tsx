import {
  Bluetooth,
  BluetoothOff,
  CircleSlash,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { TransportStatus } from '../lib/transports/types'
import type { AdapterStatus } from '../types'

interface Presentation {
  icon: LucideIcon
  iconClass: string
  title: string
  container: string
}

const PRESENTATION: Record<AdapterStatus, Presentation> = {
  searching: {
    icon: LoaderCircle,
    iconClass: 'animate-spin text-sky-400',
    title: 'Searching for iBeacons…',
    container: 'border-sky-500/40 bg-sky-500/10',
  },
  idle: {
    icon: Bluetooth,
    iconClass: 'text-slate-400',
    title: 'Bluetooth ready',
    container: 'border-slate-700 bg-slate-900/60',
  },
  off: {
    icon: BluetoothOff,
    iconClass: 'text-amber-400',
    title: 'Bluetooth is turned off',
    container: 'border-amber-500/40 bg-amber-500/10',
  },
  unauthorized: {
    icon: ShieldAlert,
    iconClass: 'text-rose-400',
    title: 'Bluetooth permission denied',
    container: 'border-rose-500/40 bg-rose-500/10',
  },
  unsupported: {
    icon: CircleSlash,
    iconClass: 'text-rose-400',
    title: 'Bluetooth unavailable',
    container: 'border-rose-500/40 bg-rose-500/10',
  },
  error: {
    icon: TriangleAlert,
    iconClass: 'text-rose-400',
    title: 'Bluetooth error',
    container: 'border-rose-500/40 bg-rose-500/10',
  },
}

interface BluetoothStatusBannerProps {
  status: TransportStatus
  transportLabel: string
}

export function BluetoothStatusBanner({
  status,
  transportLabel,
}: BluetoothStatusBannerProps) {
  const presentation = PRESENTATION[status.status]
  const Icon = presentation.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${presentation.container}`}
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${presentation.iconClass}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-100">{presentation.title}</p>
        {status.message ? (
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{status.message}</p>
        ) : (
          <p className="mt-0.5 text-xs text-slate-400">
            {status.scanning ? 'Listening for iBeacon advertisements.' : 'Not scanning.'}
          </p>
        )}
      </div>
      <span className="shrink-0 rounded-full border border-slate-700 bg-slate-950/60 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-slate-400">
        {transportLabel}
      </span>
    </div>
  )
}
