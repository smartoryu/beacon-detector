# Beacon Detector

A standalone Vite + React + TypeScript app that discovers **iBeacon-compatible BLE beacons** in range,
shows a live Bluetooth status banner, and lists every beacon with its decoded metadata
(proximity UUID, major, minor, TX power, RSSI, estimated distance, last seen).

Nothing here is shared with the sibling `ble-attendance` / `api-ble-attendance` projects.

---

## Quick start

```bash
pnpm install

# Browser-only (Web Bluetooth). Needs Chrome with an experimental flag — see below.
pnpm dev

# Node bridge only (passive scan of every advertiser + true adapter on/off state).
pnpm dev:server

# Both at once: Vite on :5173 + the bridge on :8787.
pnpm dev:all
```

Open <http://localhost:5173>, pick a transport in the switch, then press **Scan**.

---

## The two transports

Web Bluetooth **cannot passively enumerate beacons** — `requestDevice()` opens a chooser and returns one
user-picked device. The only browser API that surfaces advertisements from *every* nearby device is
`navigator.bluetooth.requestLEScan()`, which is experimental and Chrome/Edge-only. So the app ships two
backends behind one switch, and merges both into the same beacon list.

### 1. Browser (Web Bluetooth)

- Chrome or Edge, **desktop or Android only** — no Safari, no Firefox, no iOS.
- Enable `chrome://flags/#enable-experimental-web-platform-features` and restart the browser.
- Must be a **secure context** (`localhost` counts) and started from a **click** (user gesture).
- Stops receiving events when the tab is backgrounded.
- Hides device addresses and may omit TX power, so some fields show `—`.

### 2. Node bridge (`server/`)

- A local WebSocket server using [`@stoprocent/noble`](https://www.npmjs.com/package/@stoprocent/noble)
  that does a real passive scan: full manufacturer data, live RSSI, and the adapter power state.
- This is the only transport that can report a genuine **Bluetooth off** state in the banner.
- On macOS the first run triggers a one-time Bluetooth permission prompt for the terminal/Node process.
  Until it is granted (System Settings → Privacy & Security → Bluetooth), the adapter reports
  `unauthorized`.

The chosen transport is remembered in `localStorage`, and each transport keeps **its own** beacon history
so switching never wipes the other's list.

---

## Bluetooth status banner

Both transports normalize into one status enum:

| Status | Meaning |
| :-- | :-- |
| `searching` | Scanning for iBeacon advertisements |
| `idle` | Adapter ready, not scanning |
| `off` | Bluetooth is turned off |
| `unauthorized` | Permission denied (macOS bridge permission, or blocked browser access) |
| `unsupported` | No scanning API (missing flag / unsupported browser) or no adapter |
| `error` | Anything else, with the underlying message |

---

## Beacon list

- **Identity** is `uuid:major:minor` — not the MAC address, which iOS randomizes and Web Bluetooth hides.
- **RSSI** is smoothed with an exponential moving average; the strongest reading is kept as *best RSSI*.
- **Distance** uses the log-distance path-loss model (`n = 2.0`) against the beacon's calibrated TX power.
- Rows **never expire**; a new row flashes once and stops flashing when seen again.
- Clean up with the per-row delete button or **Clear all**. Export the whole list as **JSON** or **CSV**.
- Sort by strongest signal, most recent, or UUID.

---

## Scripts

| Script | What it does |
| :-- | :-- |
| `pnpm dev` | Vite dev server (browser transport only) |
| `pnpm dev:server` | Node BLE bridge with watch mode |
| `pnpm dev:all` | Both, via `scripts/dev.mjs` |
| `pnpm bridge` | Node BLE bridge, no watch (use when exposing it) |
| `pnpm tunnel` | Cloudflare quick tunnel → `http://127.0.0.1:8787` |
| `pnpm build` | Type-check + production build to `dist/` |
| `pnpm preview` | Serve the build (bridge proxying preserved) |
| `pnpm test` | Vitest unit tests (parser, RSSI, sort, export, store, bridge URL) |
| `pnpm typecheck` | `tsc -b` for the web app and the bridge |
| `pnpm lint` | oxlint |

---

## Project layout

```
src/
  types.ts                     Domain + bridge wire types
  lib/
    ibeacon.ts                 parseIBeacon(), appleManufacturerData(), UUID/hex helpers
    rssi.ts                    estimateDistance(), proximityLabel(), EMA smoothing
    export.ts                  JSON/CSV serialisation + download
    sort.ts                    Beacon sorting
    store.ts                   Per-transport localStorage persistence
    bridgeSettings.ts          Runtime bridge URL/token (localStorage + env defaults)
    transports/
      types.ts                 BleTransport contract + tiny emitter
      webBluetooth.ts          requestLEScan implementation
      bridge.ts                WebSocket client (reconnect + health probe)
  hooks/
    useBeaconScanner.ts        subscribe/merge/dedup, scan lifecycle, persistence
    useNow.ts                  ticking clock for "last seen"
  components/                  Banner, switch, bridge settings, toolbar, list, card, empty state
  vite-env.d.ts                VITE_BRIDGE_URL / VITE_BRIDGE_TOKEN typings
server/
  src/index.ts                 noble + ws bridge (auth + origin allowlist)
docs/                          Deploy guides and the macOS bridge runbook
scripts/dev.mjs                run Vite and the bridge together
.github/workflows/ci.yml       lint → typecheck → test → build
wrangler.toml                  Cloudflare Pages build output
```

### iBeacon wire format

Apple manufacturer data (`company ID 0x004C`): `02 15` · 16-byte proximity UUID · major (uint16 BE) ·
minor (uint16 BE) · TX power (int8 dBm). `parseIBeacon()` handles both the noble shape (company ID
included) and the Web Bluetooth shape (payload only) by locating the `4C 00 02 15` signature.

### Bridge protocol

JSON over `ws://127.0.0.1:8787/ble-ws` (proxied by Vite at `/ble-ws` in dev, or reached directly as
`wss://<tunnel-host>/ble-ws` in production):

```
server → client  {type:'hello',version,authRequired}
                 {type:'status',state,scanning}
                 {type:'beacon',payload:{sourceId,rssi,localName?,address?,addressType?,manufacturerData:number[]}}
client → server  {type:'auth',token}      # first frame when authRequired
                 {type:'start'} | {type:'stop'} | {type:'ping'}
```

`GET /health` returns `{ ok: true, version }`. A bad token closes the socket with code `4401`. The client
re-parses the raw bytes with its own `parseIBeacon()`, so both transports decode identically.

---

## Deploy

**App** → Cloudflare Pages (free `*.pages.dev`), built by the Pages Git integration.
**Bridge** → stays on the Mac that has the Bluetooth radio, exposed with a Cloudflare Tunnel (`wss://`).
GitHub Actions runs CI only.

| Guide | Covers |
| :-- | :-- |
| [`docs/deploy-cloudflare-pages.md`](docs/deploy-cloudflare-pages.md) | Pages project, build settings, verification |
| [`docs/deploy-cloudflare-tunnel.md`](docs/deploy-cloudflare-tunnel.md) | Quick tunnel + named-tunnel upgrade |
| [`docs/runbook-bridge-macos.md`](docs/runbook-bridge-macos.md) | Run the bridge, TCC permission, token rotation |

Why the bridge is not “deployed” to a cloud host: it needs a physical BLE radio within ~10–30 m of the
beacons. Because a quick-tunnel URL changes on every restart, the app takes the bridge URL **and token at
runtime** via the **Bridge settings** panel (persisted in `localStorage`), not at build time.

Operators hand out a **connection-profile deep link** so recipients need no setup at all:

```
https://beacon-detector.pages.dev/#bridge=wss://calm-words.trycloudflare.com/ble-ws&token=<secret>
```

The profile lives in the URL **fragment**, which is never sent to Cloudflare, so the shared token stays out
of access logs. On load the app stores it, selects the bridge transport, and clears the fragment.

---

## Known limitations

- Web Bluetooth scanning is experimental and Chrome/Edge-only, and needs a visible tab.
- `@stoprocent/noble` is a native module: Node ≥ 22 required (built and tested on Node 22).
- A Cloudflare **quick tunnel** URL changes on every restart — share a fresh deep link (or re-paste it in
  **Bridge settings**).
- Anyone with a connection-profile link can scan through that bridge; treat the token as shareable-but-rotatable
  and never commit it.
- The bridge is internet-exposed when tunneled; set `BRIDGE_AUTH_TOKEN` and `BRIDGE_ALLOWED_ORIGINS`.
- iBeacon advertisements are anonymous — the app cannot identify their owner.
- Two different beacons with the same `uuid:major:minor` intentionally collapse into one row.
