import type { RawBeaconEvent } from '../../types'
import {
  APPLE_COMPANY_ID,
  appleManufacturerData,
  parseIBeacon,
} from '../ibeacon'
import { createEmitter, type BleTransport, type TransportStatus } from './types'

/** True when this browser exposes the experimental scanning API at all. */
function getScanningApi(): Bluetooth | null {
  if (typeof navigator === 'undefined') return null
  const bluetooth = navigator.bluetooth
  if (!bluetooth) return null
  const requestLEScan = (bluetooth as { requestLEScan?: unknown }).requestLEScan
  return typeof requestLEScan === 'function' ? bluetooth : null
}

function describeError(error: unknown): TransportStatus {
  const err = error as { name?: string; message?: string }
  switch (err?.name) {
    case 'NotSupportedError':
      return {
        status: 'unsupported',
        scanning: false,
        message:
          'Experimental LE scanning is off. Enable chrome://flags/#enable-experimental-web-platform-features and restart Chrome.',
      }
    case 'SecurityError':
      return {
        status: 'unauthorized',
        scanning: false,
        message:
          'Bluetooth access was blocked. Check the site permission and start the scan from a click.',
      }
    case 'NotFoundError':
      return {
        status: 'off',
        scanning: false,
        message: 'No Bluetooth adapter was found.',
      }
    default:
      return {
        status: 'error',
        scanning: false,
        message: err?.message ?? 'Bluetooth scan failed.',
      }
  }
}

/**
 * Browser transport: `navigator.bluetooth.requestLEScan()`.
 *
 * Chrome/Edge only, behind the experimental flag, and requires a user gesture.
 * `keepRepeatedDevices` is on so repeated advertisements refresh RSSI.
 */
export function createWebBluetoothTransport(): BleTransport {
  const statusEmitter = createEmitter<TransportStatus>()
  const beaconEmitter = createEmitter<RawBeaconEvent>()

  const api = getScanningApi()
  let scan: BluetoothLEScan | null = null
  let listening = false
  let last: TransportStatus = { status: 'idle', scanning: false }

  const setStatus = (next: TransportStatus) => {
    last = next
    statusEmitter.emit(next)
  }

  const refreshAvailability = async () => {
    if (!api) {
      setStatus({ status: 'unsupported', scanning: false })
      return
    }
    try {
      const available = await api.getAvailability()
      if (last.scanning) {
        setStatus({ status: 'searching', scanning: true })
      } else {
        setStatus({ status: available ? 'idle' : 'off', scanning: false })
      }
    } catch {
      if (!last.scanning) setStatus({ status: 'error', scanning: false })
    }
  }

  const handleAdvertisement = (event: BluetoothAdvertisingEvent) => {
    const apple = event.manufacturerData?.get(APPLE_COMPANY_ID)
    if (!apple) return

    const payload = parseIBeacon(appleManufacturerData(apple))
    if (!payload) return

    beaconEmitter.emit({
      payload,
      rssi: event.rssi ?? null,
      sourceId: event.device.id,
      localName: event.name || undefined,
    })
  }

  const handleAvailabilityChanged = () => {
    void refreshAvailability()
  }

  if (api) {
    api.addEventListener('advertisementreceived', handleAdvertisement)
    api.addEventListener('availabilitychanged', handleAvailabilityChanged)
    listening = true
  }

  return {
    id: 'web',
    label: 'Browser (Web Bluetooth)',
    hint: 'Requires Chrome/Edge with the experimental Web Bluetooth scanning flag.',

    async probe() {
      // "Usable here" means the scanning API exists — adapter power is shown by
      // the banner, not used to disable the switch option.
      return api !== null
    },

    getStatus: () => last,

    onStatus: statusEmitter.subscribe,
    onBeacon: beaconEmitter.subscribe,

    async start() {
      if (!api) {
        setStatus({
          status: 'unsupported',
          scanning: false,
          message:
            'This browser has no Web Bluetooth LE scanning. Use the Node bridge, or Chrome with the experimental flag.',
        })
        return
      }

      try {
        if (!(await api.getAvailability())) {
          setStatus({
            status: 'off',
            scanning: false,
            message: 'Bluetooth is turned off.',
          })
          return
        }

        scan = await api.requestLEScan({
          acceptAllAdvertisements: true,
          keepRepeatedDevices: true,
        })
        setStatus({ status: 'searching', scanning: true })
      } catch (error) {
        setStatus(describeError(error))
      }
    },

    async stop() {
      if (scan) {
        try {
          scan.stop()
        } catch {
          /* already stopped */
        }
        scan = null
      }
      setStatus({ status: 'idle', scanning: false })
      await refreshAvailability()
    },

    dispose() {
      if (scan) {
        try {
          scan.stop()
        } catch {
          /* ignore */
        }
        scan = null
      }
      if (api && listening) {
        api.removeEventListener('advertisementreceived', handleAdvertisement)
        api.removeEventListener('availabilitychanged', handleAvailabilityChanged)
        listening = false
      }
      statusEmitter.clear()
      beaconEmitter.clear()
    },
  }
}
