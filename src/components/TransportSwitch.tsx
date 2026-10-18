import type { TransportId } from '../types'

interface TransportSwitchProps {
  value: TransportId
  onChange: (id: TransportId) => void
  /** `null` = still probing. */
  availability: Record<TransportId, boolean | null>
  options: { id: TransportId; label: string; hint: string }[]
}

function AvailabilityDot({ available }: { available: boolean | null }) {
  if (available === null) {
    return <span className="size-1.5 animate-pulse rounded-full bg-slate-500" />
  }
  return (
    <span
      className={`size-1.5 rounded-full ${available ? 'bg-emerald-400' : 'bg-rose-500'}`}
    />
  )
}

export function TransportSwitch({
  value,
  onChange,
  availability,
  options,
}: TransportSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Bluetooth transport"
      className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1"
    >
      {options.map((option) => {
        const available = availability[option.id]
        const active = value === option.id
        const disabled = available === false

        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={disabled ? option.hint : option.label}
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            } ${disabled ? 'cursor-not-allowed opacity-40 hover:text-slate-400' : ''}`}
          >
            <AvailabilityDot available={available} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
