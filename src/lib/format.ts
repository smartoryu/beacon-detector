/** Small display formatters shared by the beacon UI. */

export function formatRelative(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 2) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

export function formatRssi(rssi: number | null): string {
  return rssi === null ? '—' : `${rssi} dBm`
}

export function formatDistance(metres: number | null): string {
  return metres === null ? '—' : `${metres.toFixed(2)} m`
}

export function formatTxPower(txPower: number | null): string {
  return txPower === null ? '—' : `${txPower} dBm`
}

export function formatNumber(value: number): string {
  return value.toLocaleString()
}
