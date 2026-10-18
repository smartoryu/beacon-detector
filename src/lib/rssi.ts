/** RSSI → distance / proximity helpers (shared by both transports). */

/** Path-loss exponent. 2.0 = free space; indoor environments run 2–4. */
export const DEFAULT_PATH_LOSS_EXPONENT = 2

export type ProximityLabel = 'immediate' | 'near' | 'far' | 'unknown'

/**
 * Log-distance path-loss estimate of the distance to a beacon, in metres.
 *
 * `txPower` is the calibrated RSSI measured at 1 m.
 */
export function estimateDistance(
  rssi: number | null,
  txPower: number | null,
  pathLossExponent: number = DEFAULT_PATH_LOSS_EXPONENT,
): number | null {
  if (rssi === null || txPower === null) return null
  if (pathLossExponent <= 0) return null

  const metres = 10 ** ((txPower - rssi) / (10 * pathLossExponent))
  if (!Number.isFinite(metres)) return null

  return Math.round(Math.min(Math.max(metres, 0.05), 100) * 100) / 100
}

export function proximityLabel(distance: number | null): ProximityLabel {
  if (distance === null) return 'unknown'
  if (distance < 0.5) return 'immediate'
  if (distance <= 3) return 'near'
  return 'far'
}

/** Coarse 0–4 signal bars from RSSI. */
export function rssiBars(rssi: number | null): 0 | 1 | 2 | 3 | 4 {
  if (rssi === null) return 0
  if (rssi >= -55) return 4
  if (rssi >= -65) return 3
  if (rssi >= -75) return 2
  if (rssi >= -85) return 1
  return 0
}

/** EMA smoothing factor for successive RSSI readings. */
export const RSSI_SMOOTHING_ALPHA = 0.3

/** Blend a new RSSI reading into the smoothed value. */
export function smoothRssi(previous: number | null, next: number): number {
  if (previous === null) return next
  return previous + RSSI_SMOOTHING_ALPHA * (next - previous)
}
