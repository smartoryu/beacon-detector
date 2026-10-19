import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyBridgeDeepLink,
  loadBridgeSettings,
  normalizeBridgeUrl,
  saveBridgeSettings,
} from './bridgeSettings'
import { TRANSPORT_STORAGE_KEY } from './storageKeys'

function createStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

describe('normalizeBridgeUrl', () => {
  it('turns a quick-tunnel https URL into wss + /ble-ws', () => {
    expect(normalizeBridgeUrl('https://calm-words.trycloudflare.com')).toBe(
      'wss://calm-words.trycloudflare.com/ble-ws',
    )
  })

  it('turns a localhost http URL into ws + /ble-ws', () => {
    expect(normalizeBridgeUrl('http://localhost:8787')).toBe('ws://localhost:8787/ble-ws')
  })

  it('defaults a bare host to wss', () => {
    expect(normalizeBridgeUrl('calm-words.trycloudflare.com')).toBe(
      'wss://calm-words.trycloudflare.com/ble-ws',
    )
  })

  it('keeps an explicit ws(s) URL and path', () => {
    expect(normalizeBridgeUrl('wss://bridge.example.com/ble-ws')).toBe(
      'wss://bridge.example.com/ble-ws',
    )
  })

  it('accepts a custom path', () => {
    expect(normalizeBridgeUrl('https://bridge.example.com/custom')).toBe(
      'wss://bridge.example.com/custom',
    )
  })

  it('rejects empty and non-websocket schemes', () => {
    expect(normalizeBridgeUrl('')).toBe('')
    expect(normalizeBridgeUrl('   ')).toBe('')
    expect(normalizeBridgeUrl('ftp://example.com')).toBe('')
  })
})

describe('applyBridgeDeepLink', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage())
  })

  it('saves the url and token, and selects the bridge transport', () => {
    const applied = applyBridgeDeepLink(
      'https://app.pages.dev/#bridge=wss://calm-words.trycloudflare.com/ble-ws&token=s3cret',
    )

    expect(applied).toBe(true)
    expect(loadBridgeSettings()).toEqual({
      url: 'wss://calm-words.trycloudflare.com/ble-ws',
      token: 's3cret',
    })
    expect(localStorage.getItem(TRANSPORT_STORAGE_KEY)).toBe('bridge')
  })

  it('accepts a bare tunnel host and percent-encoded values', () => {
    applyBridgeDeepLink('https://app.pages.dev/#bridge=calm-words.trycloudflare.com')

    const settings = loadBridgeSettings()
    expect(normalizeBridgeUrl(settings.url)).toBe(
      'wss://calm-words.trycloudflare.com/ble-ws',
    )
  })

  it('updates only the provided field', () => {
    saveBridgeSettings({ url: 'wss://old.example.com/ble-ws', token: 'old' })

    expect(applyBridgeDeepLink('https://app/#token=new-token')).toBe(true)
    expect(loadBridgeSettings()).toEqual({
      url: 'wss://old.example.com/ble-ws',
      token: 'new-token',
    })
  })

  it('ignores links without a profile', () => {
    expect(applyBridgeDeepLink('https://app.pages.dev/')).toBe(false)
    expect(applyBridgeDeepLink('https://app.pages.dev/#')).toBe(false)
    expect(applyBridgeDeepLink('https://app.pages.dev/#other=1')).toBe(false)
    expect(localStorage.getItem(TRANSPORT_STORAGE_KEY)).toBeNull()
  })
})
