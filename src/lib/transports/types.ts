import type { AdapterStatus, RawBeaconEvent, TransportId } from '../../types'

/** Normalized transport status, consumed by the banner. */
export interface TransportStatus {
  status: AdapterStatus
  scanning: boolean
  /** Extra detail for the `error` / `unauthorized` states. */
  message?: string
}

/**
 * A Bluetooth backend. Implementations push {@link TransportStatus} and
 * {@link RawBeaconEvent} at subscribers; the scanner owns all merging.
 */
export interface BleTransport {
  readonly id: TransportId
  readonly label: string
  /** Shown when the transport cannot be used in this environment. */
  readonly hint: string
  /** Cheap reachability check (browser support / bridge socket). */
  probe(): Promise<boolean>
  /** Latest status, for seeding the UI before the first emitted event. */
  getStatus(): TransportStatus
  onStatus(listener: (status: TransportStatus) => void): () => void
  onBeacon(listener: (beacon: RawBeaconEvent) => void): () => void
  start(): Promise<void>
  stop(): Promise<void>
  dispose(): void
}

/** Minimal typed pub/sub used by both transports. */
export function createEmitter<T>() {
  const listeners = new Set<(value: T) => void>()
  return {
    subscribe(listener: (value: T) => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(value: T): void {
      for (const listener of [...listeners]) listener(value)
    },
    clear(): void {
      listeners.clear()
    },
  }
}
