# Plan: Deploy `beacon-detector` (app + WebSocket bridge) with CI/CD

## Context

`beacon-detector` is a standalone Vite + React + TS SPA plus a local Node Bluetooth bridge
(`server/`, `@stoprocent/noble` + `ws`). The goal is to make **both the app and the WebSocket bridge
reachable over the internet**, with CI/CD, for the repo **`smartoryu/beacon-detector`**.

This project has **no relationship** with `api-ble-attendance` or `ble-attendance`. This plan deliberately
does **not** reuse their moon/GitLab/SWS conventions — it is shaped only by this app's stack.

## The hard constraint that shapes the design

The bridge is **not** a generic WebSocket service: `@stoprocent/noble` talks to a **physical Bluetooth
radio**, and BLE range is ~10–30 m. So:

- The bridge **cannot** run on Pages, Vercel, Netlify, Render, Railway or an ordinary cloud VM — none have a
  Bluetooth adapter. It stays on the **macOS machine** (chosen by the operator), running natively.
- "Reachable over the internet" is solved with a **Cloudflare Tunnel** dialing out from that Mac.
- The app is served over **HTTPS**, so the browser must reach the bridge over **`wss://`**. A tunnel provides
  TLS, which also fixes the mixed-content block on `ws://` from an `https://` page.

## Decisions locked with the operator

| # | Decision |
| :-- | :--- |
| D1 | **Repo**: new standalone GitHub repo `smartoryu/beacon-detector`. |
| D2 | **BLE host**: the **macOS machine**, bridge run **natively** (no Docker). |
| D3 | **Exposure**: **Cloudflare Tunnel**; **no custom domain** → use a **quick tunnel** (`*.trycloudflare.com`). |
| D4 | **App hosting**: **Cloudflare Pages** (free `*.pages.dev`), GitHub **Git integration**. |
| D5 | **Bridge supervision**: **manual** — no daemon. The operator runs the bridge when scanning. |
| D6 | **Auth**: shared **token entered in the UI** + **Origin allowlist** on the bridge. |
| D7 | Deliver **TODO/runbook docs** for the Cloudflare Tunnel and Cloudflare Pages setup. |

### Consequence of D3 + D5 (drives the frontend design)

A quick tunnel prints a **random `*.trycloudflare.com` hostname that changes on every restart**, and the
bridge is started manually. A build-time bridge URL is therefore useless. The app must expose a **runtime
bridge URL + token** settings panel (persisted in `localStorage`), with `VITE_BRIDGE_URL` / `VITE_BRIDGE_TOKEN`
as optional build-time defaults only.

## Architecture

```
  Cloudflare Pages (free)                Cloudflare quick tunnel (free)
  https://beacon-detector.pages.dev      wss://<random-words>.trycloudflare.com
        │  static Vite build                    ▲
        │                                       │ outbound only, TLS
        ▼                                       │
   Browser (Chrome)                        ┌────┴──────────────────────────┐
     • Web Bluetooth transport  ──────────►│  macOS machine (manual run)   │
     • Bridge transport (url+token)        │  pnpm bridge → :8787          │
                                           │  cloudflared tunnel --url …   │
                                           │  └─► CoreBluetooth radio      │
                                           └───────────────────────────────┘
```

The Web Bluetooth transport keeps working **without** the bridge, so the deployed app is useful on its own.

## Approach

1. **Harden the bridge for public exposure** (`server/src/index.ts`): configurable bind, token auth on the
   WS upgrade, Origin allowlist with `*.pages.dev` wildcard support, and a minimal public `/health`.
2. **Make the frontend transport configurable** (`src/lib/transports/bridge.ts`): runtime
   bridge URL + token, `wss://`, falling back to same-origin `/ble-ws` for local dev.
3. **Add a small Bridge settings UI** so the operator can paste the tunnel URL + token after starting it.
4. **Cloudflare Pages** serves the static build (Git integration); **GitHub Actions** runs the CI gates.
5. **Ship deploy docs** (the requested TODO/runbooks) and bootstrap the git repo.

## Files to modify / add

### Bridge (`server/`)
- **`server/src/index.ts`** (modify) — add `HOST` (default `127.0.0.1`), `BRIDGE_AUTH_TOKEN`,
  `BRIDGE_ALLOWED_ORIGINS`; first-message auth handshake; gate `broadcast`/`sendStatus` on authenticated
  clients; keep the existing `startScan`/`stopScan`/`looksLikeIBeacon` logic untouched.
- **`server/.env.example`** (new) — documents `PORT`, `HOST`, `BRIDGE_AUTH_TOKEN`, `BRIDGE_ALLOWED_ORIGINS`.
- **`server/README.md`** (new) — short bridge run/auth reference.

### Frontend
- **`src/lib/transports/bridge.ts`** (modify) — replace the hardcoded `bridgeUrl()` with resolution order:
  runtime override (`localStorage`) → `import.meta.env.VITE_BRIDGE_URL` → same-origin `/ble-ws`; send the
  `auth` frame after `hello`; handle close code `4401` as `unauthorized`.
- **`src/types.ts`** (modify) — add `auth` to `BridgeClientMessage`; add `authRequired` to the hello message.
- **`src/lib/bridgeSettings.ts`** (new) — load/save `{ url, token }` in `localStorage`.
- **`src/components/BridgeSettings.tsx`** (new) — URL + token inputs, connection hint, "use tunnel URL" helper.
- **`src/App.tsx`** (modify) — render `BridgeSettings` when the bridge transport is selected.
- **`src/vite-env.d.ts`** (new) — type `ImportMetaEnv` for `VITE_BRIDGE_URL` / `VITE_BRIDGE_TOKEN`.

### CI/CD + repo
- **`.github/workflows/ci.yml`** (new) — install → lint → typecheck (web + bridge) → test → build, on push/PR.
- **`wrangler.toml`** (new) — `pages_build_output_dir = "dist"` for the Pages Git integration.
- **`.node-version`** (new) — `22`, so Pages and Actions agree on Node.
- **`package.json`** (modify) — add `"bridge": "pnpm --dir server start"` and `"tunnel": "cloudflared tunnel --url http://127.0.0.1:8787"`; add `"engines": { "node": ">=22" }`.
- **`.gitignore`** (modify) — add `.env`, `.env.*` (keep `!.env.example`), `.cloudflared/`.
- **`README.md`** (modify) — add a "Deploy" section linking the docs below.

### Docs (the requested TODO docs)
- **`docs/deploy-cloudflare-pages.md`** (new) — step-by-step Pages setup TODO.
- **`docs/deploy-cloudflare-tunnel.md`** (new) — quick-tunnel TODO + named-tunnel upgrade path.
- **`docs/runbook-bridge-macos.md`** (new) — run the bridge, grant Bluetooth (TCC), set/rotate the token.

## Reuse (existing code, extended not rewritten)

- `server/src/index.ts`: `broadcast()`, `sendStatus()`, `statusMessage()`, `startScan()`, `stopScan()`,
  `looksLikeIBeacon()`, the `/health` route and `shutdown()` — the auth layer wraps these.
- `src/lib/transports/bridge.ts`: existing `connect()`/`scheduleReconnect()`/`probe()`/`mapAdapterState()`
  and the `createEmitter` + `BleTransport` contract in `src/lib/transports/types.ts` — only URL resolution
  and the auth frame change.
- `src/hooks/useBeaconScanner.ts`: `availability` probe already drives the transport switch; no change beyond
  re-probing when settings change.
- Existing scripts `pnpm dev`, `dev:server`, `dev:all`, `typecheck`, `test`, `build`, `lint`.

## Bridge protocol changes (auth)

```
server → client  {type:'hello',version, authRequired:boolean}
client → server  {type:'auth', token}
  ✔ valid   → {type:'status',…} and normal beacon flow
  ✘ invalid → close 4401 "unauthorized"
```
If `BRIDGE_AUTH_TOKEN` is unset, `authRequired:false` and the bridge proceeds (local dev only; documented as
unsafe). `GET /health` returns `{ok:true,version}` only — no adapter state on the public route.

Origin allowlist matches exact origins plus wildcard patterns (e.g. `https://*.beacon-detector.pages.dev`)
so Pages **preview** deployments also work.

## Steps

- [ ] Bootstrap the repo: `git init -b main`, extend `.gitignore`, `.node-version`, initial commit.
- [ ] Add bridge auth + origin allowlist + configurable bind in `server/src/index.ts`; add `server/.env.example`.
- [ ] Add runtime bridge URL/token resolution in `src/lib/transports/bridge.ts` + `src/types.ts`.
- [ ] Add `src/lib/bridgeSettings.ts`, `src/components/BridgeSettings.tsx`, wire into `App.tsx`, add `vite-env.d.ts`.
- [ ] Add root `bridge` / `tunnel` scripts and `engines`.
- [ ] Add `.github/workflows/ci.yml` and `wrangler.toml`.
- [ ] Write `docs/deploy-cloudflare-pages.md`, `docs/deploy-cloudflare-tunnel.md`, `docs/runbook-bridge-macos.md`.
- [ ] Update `README.md` with the Deploy section.
- [ ] Create `smartoryu/beacon-detector` on GitHub and push; let CI run green.
- [ ] Connect the repo in Cloudflare Pages (build `pnpm build`, output `dist`).
- [ ] On the Mac: run `pnpm bridge`, start the quick tunnel, paste URL + token into the deployed app, verify.

## Verification

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green locally **and** in GitHub Actions.
2. `pnpm dev:all` still works: bridge via same-origin `/ble-ws`, no token, no regression to local dev.
3. Pages URL (`https://beacon-detector.pages.dev`) loads over HTTPS; **Web Bluetooth** transport scans in Chrome.
4. `cloudflared tunnel --url http://127.0.0.1:8787` → paste `wss://<…>.trycloudflare.com` + token into the app →
   devtools shows **101 Switching Protocols**; banner goes `idle` → `searching`.
5. Negative tests: wrong token → close `4401`; a disallowed `Origin` → rejected; `/health` still returns 200.
6. Turn the Mac's Bluetooth **off** while connected → the banner flips to `off` live through the tunnel.
7. Kill the bridge → the UI shows the reconnect/offline state (existing backoff path).

## Risks / notes

- **Quick tunnels are explicitly not for production**: random hostname each restart, no SLA. The runbook
  documents the one-step upgrade to a **named tunnel** once a domain exists (only the tunnel command and DNS
  route change; the app already accepts any `wss://` URL at runtime).
- **macOS Bluetooth (TCC)**: the process running Node must be granted Bluetooth permission once; if launched
  from a new context, re-grant. Documented in the runbook.
- **Public exposure**: a strong `BRIDGE_AUTH_TOKEN` is mandatory (documented); the app prompts for it and does
  not ship it in the bundle. Optional hardening noted: Cloudflare Access in front of the tunnel.
- **Cloudflare Pages Git integration** deploys on push; GitHub Actions intentionally does **CI only** to avoid
  double deploys.
- A `*.trycloudflare.com` origin is unpredictable, so the allowlist must cover the quick-tunnel hostname being
  used (documented as an env value to update), and Pages origins via wildcard.
