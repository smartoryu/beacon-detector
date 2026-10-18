# beacon-detector-bridge

The local BLE half of Beacon Detector. A small Node service that talks to the machine's Bluetooth
adapter with [`@stoprocent/noble`](https://www.npmjs.com/package/@stoprocent/noble) and streams iBeacon
sightings to the browser over a WebSocket.

It must run on a machine that **has a Bluetooth radio** and is within BLE range of the beacons. It can run
in the cloud in name only — a datacentre has no radio, so it will report `unsupported` and see nothing.

## Run

```bash
# from the repo root
pnpm bridge          # production-ish, no watch
pnpm dev:server      # watch mode
```

See [`../docs/runbook-bridge-macos.md`](../docs/runbook-bridge-macos.md) for the full macOS runbook and
[`../docs/deploy-cloudflare-tunnel.md`](../docs/deploy-cloudflare-tunnel.md) for exposure.

## Configuration

Copy `server/.env.example` to `.env` at the repo root and load it before starting.

| Variable | Default | Purpose |
| :-- | :-- | :-- |
| `BRIDGE_HOST` / `HOST` | `127.0.0.1` | Bind address. Keep localhost when a tunnel dials it. |
| `BRIDGE_PORT` / `PORT` | `8787` | Listen port. |
| `BRIDGE_AUTH_TOKEN` | unset | Shared secret. **Required in production.** Unset = no auth (local dev only). |
| `BRIDGE_ALLOWED_ORIGINS` | unset (any) | Comma-separated allowed `Origin`s. Supports `*` per host segment, e.g. `https://*.example.pages.dev`. |

`NOBLE_HCI_DEVICE_ID` is honoured by noble for multi-adapter Linux hosts.

## Protocol

`ws(s)://<host>:8787/ble-ws`, one JSON object per message.

```
server → client   {type:'hello', version, authRequired}
                  {type:'status', state, scanning}
                  {type:'beacon', payload:{sourceId, rssi, localName?, address?, addressType?, manufacturerData:number[]}}
client → server   {type:'auth', token}     # first frame when authRequired
                  {type:'start'} | {type:'stop'} | {type:'ping'}
```

- `GET /health` → `{ "ok": true, "version": 1 }` (no adapter detail).
- Auth failures and disallowed origins are rejected; a bad token closes the socket with code **4401**.
- `manufacturerData` includes the 2-byte company ID; the browser re-parses it with its own
  `parseIBeacon()`, so both transports decode identically.

## Security posture

- Read-only: the bridge only scans; it never connects, reads, or writes GATT.
- Origin allowlist on the WebSocket upgrade (`verifyClient`).
- Constant-time token comparison; the token is sent in a frame, not a URL query, so it is not logged.
- Never log the token.
