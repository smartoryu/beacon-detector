import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Node BLE bridge (server/) — see src/lib/transports/bridge.ts
const bleBridgeProxy = {
  '/ble-ws': {
    target: 'ws://127.0.0.1:8787',
    ws: true,
    rewriteWsOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: bleBridgeProxy,
  },
  preview: {
    proxy: bleBridgeProxy,
  },
})
