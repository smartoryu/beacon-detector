import { describe, expect, it } from 'vitest'
import { normalizeBridgeUrl } from './bridgeSettings'

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
