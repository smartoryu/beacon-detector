#!/usr/bin/env node
/**
 * Run the Vite dev server and the Node BLE bridge together (`pnpm dev:all`).
 *
 * Kept dependency-free so `pnpm dev` / `pnpm dev:server` still work on their own.
 */
import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'

const children = [
  spawn('pnpm', ['exec', 'vite'], { stdio: 'inherit', shell: isWindows }),
  spawn('pnpm', ['--dir', 'server', 'dev'], { stdio: 'inherit', shell: isWindows }),
]

let shuttingDown = false

function shutdown(signal = 'SIGINT') {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill(signal)
  }
}

for (const child of children) {
  child.on('exit', (code) => {
    if (shuttingDown) return
    console.error(`\n[dev] a process exited (code ${code}); shutting the other down.`)
    shutdown()
    process.exitCode = typeof code === 'number' ? code : 1
  })
  child.on('error', (error) => {
    console.error('[dev] failed to spawn a process:', error.message)
    shutdown()
    process.exitCode = 1
  })
}

process.on('SIGINT', () => {
  shutdown('SIGINT')
  process.exit(0)
})
process.on('SIGTERM', () => {
  shutdown('SIGTERM')
  process.exit(0)
})
