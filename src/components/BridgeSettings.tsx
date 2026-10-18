import { CheckCircle2, Eye, EyeOff, KeyRound, Link, RefreshCw, RotateCcw, XCircle } from 'lucide-react'
import { useState } from 'react'
import {
  DEFAULT_BRIDGE_SETTINGS,
  loadBridgeSettings,
  normalizeBridgeUrl,
  resetBridgeSettings,
  saveBridgeSettings,
  type BridgeSettings as Settings,
} from '../lib/bridgeSettings'

interface BridgeSettingsProps {
  /** `null` while the reachability probe is in flight. */
  available: boolean | null
  /** Called after saving/resetting so the scanner can reconnect and re-probe. */
  onApply: () => void
}

export function BridgeSettings({ available, onApply }: BridgeSettingsProps) {
  const [settings, setSettings] = useState<Settings>(() => loadBridgeSettings())
  const [showToken, setShowToken] = useState(false)
  const [saved, setSaved] = useState(false)

  const update = (patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  const apply = () => {
    saveBridgeSettings(settings)
    setSaved(true)
    onApply()
  }

  const reset = () => {
    resetBridgeSettings()
    const defaults = { ...DEFAULT_BRIDGE_SETTINGS }
    setSettings(defaults)
    setSaved(true)
    onApply()
  }

  const effectiveUrl = normalizeBridgeUrl(settings.url) || '(same-origin /ble-ws)'

  return (
    <section
      aria-label="Bridge settings"
      className="rounded-xl border border-slate-800 bg-slate-900/40 p-4"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Link className="size-4 text-slate-500" aria-hidden />
          Bridge connection
        </h2>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          {available === null ? (
            <>
              <RefreshCw className="size-3.5 animate-spin" aria-hidden />
              probing
            </>
          ) : available ? (
            <>
              <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden />
              reachable
            </>
          ) : (
            <>
              <XCircle className="size-3.5 text-rose-400" aria-hidden />
              not reachable
            </>
          )}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr]">
        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] tracking-wide text-slate-500 uppercase">
            Bridge URL
          </span>
          <input
            type="url"
            value={settings.url}
            onChange={(event) => update({ url: event.target.value })}
            placeholder="https://random-words.trycloudflare.com"
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500"
          />
        </label>

        <label className="block min-w-0">
          <span className="mb-1 block text-[11px] tracking-wide text-slate-500 uppercase">
            Token
          </span>
          <span className="relative block">
            <input
              type={showToken ? 'text' : 'password'}
              value={settings.token}
              onChange={(event) => update({ token: event.target.value })}
              placeholder="BRIDGE_AUTH_TOKEN"
              autoComplete="off"
              className="w-full rounded-md border border-slate-800 bg-slate-950 py-1.5 pr-8 pl-2.5 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500"
            />
            <button
              type="button"
              onClick={() => setShowToken((value) => !value)}
              aria-label={showToken ? 'Hide token' : 'Show token'}
              className="absolute inset-y-0 right-1 my-auto rounded p-1 text-slate-500 hover:text-slate-300"
            >
              {showToken ? (
                <EyeOff className="size-3.5" aria-hidden />
              ) : (
                <Eye className="size-3.5" aria-hidden />
              )}
            </button>
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] text-slate-500">
          Resolves to <span className="font-mono text-slate-400">{effectiveUrl}</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-800 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </button>
          <button
            type="button"
            onClick={apply}
            className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500"
          >
            <KeyRound className="size-3.5" aria-hidden />
            {saved ? 'Reconnect' : 'Save & connect'}
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        Start the bridge with <code className="font-mono text-slate-500">pnpm bridge</code>, then
        expose it with{' '}
        <code className="font-mono text-slate-500">
          cloudflared tunnel --url http://127.0.0.1:8787
        </code>{' '}
        and paste the printed <span className="font-mono text-slate-500">https://…trycloudflare.com</span>{' '}
        URL here. The token must match <span className="font-mono text-slate-500">BRIDGE_AUTH_TOKEN</span>.
      </p>
    </section>
  )
}
