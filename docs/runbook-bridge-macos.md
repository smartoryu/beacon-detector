# Runbook — the BLE bridge on macOS

The bridge is the only part of the system that needs a **physical Bluetooth radio**, so it runs on this
Mac, natively (no container — macOS containers cannot reach the host radio). It is started **manually**
and stops when you close it.

## Prerequisites

- [ ] Node 22+ (`node -v`) and pnpm 12+ (`pnpm -v`).
- [ ] Xcode Command Line Tools for `node-gyp`: `xcode-select --install`
- [ ] Bluetooth is **on** in the menu bar.
- [ ] Repo installed: `pnpm install` (from the repo root).

## 1. Configure the token and origins

- [ ] Create the env file:

      ```bash
      cp server/.env.example .env
      ```

- [ ] Generate a strong token and put it in `.env`:

      ```bash
      openssl rand -hex 32
      ```

      ```dotenv
      BRIDGE_AUTH_TOKEN=<paste the hex here>
      BRIDGE_ALLOWED_ORIGINS=https://beacon-detector.pages.dev,https://*.beacon-detector.pages.dev,http://localhost:5173
      BRIDGE_HOST=127.0.0.1
      BRIDGE_PORT=8787
      ```

- [ ] `BRIDGE_HOST=127.0.0.1` is correct: `cloudflared` runs on this machine and dials localhost.

## 2. Run the bridge

- [ ] Load the env and start:

      ```bash
      set -a; . ./.env; set +a
      pnpm bridge
      ```

- [ ] Expect output like:

      ```
      [bridge] listening on ws://127.0.0.1:8787/ble-ws
      [bridge] adapter state: poweredOn
      [bridge] auth: required
      [bridge] allowed origins: https://beacon-detector.pages.dev, …
      ```

## 3. Grant Bluetooth permission (first run only)

- [ ] macOS shows a Bluetooth prompt for the terminal app — click **Allow**.
- [ ] If no prompt appears and the adapter stays `unknown`/`unauthorized`:
      System Settings → **Privacy & Security** → **Bluetooth** → enable your terminal
      (Terminal / iTerm / VS Code), then restart the bridge.
- [ ] A wrong TCC grant is the most common cause of a bridge that connects but never scans.

## 4. Verify locally

- [ ] Health check: `curl http://127.0.0.1:8787/health` → `{"ok":true,"version":1}`
- [ ] Local app: `pnpm dev`, open `http://localhost:5173`, choose **Node bridge**, **Scan**. The bridge URL
      field can stay empty in dev — it falls back to the same-origin Vite proxy.

## 5. Expose it to the internet

- [ ] Follow [`deploy-cloudflare-tunnel.md`](./deploy-cloudflare-tunnel.md).
- [ ] Paste the tunnel URL + token into the deployed app's **Bridge settings**.

## 6. Rotate the token

- [ ] Generate a new one (`openssl rand -hex 32`), update `.env`, restart the bridge.
- [ ] Update the token in the app's **Bridge settings** and **Save & connect**.
- [ ] Old clients are rejected with close code `4401`.

## Troubleshooting

| Symptom | Cause / fix |
| :-- | :-- |
| App shows “The bridge rejected the token.” | Token mismatch. Update **Bridge settings**; check `BRIDGE_AUTH_TOKEN`. |
| `[bridge] rejected origin: …` in the log | Add the app origin to `BRIDGE_ALLOWED_ORIGINS` (wildcard `https://*.beacon-detector.pages.dev` covers previews). |
| Banner stuck at `unauthorized` | Bluetooth TCC permission not granted (step 3). |
| Banner `off` | Bluetooth is switched off on the Mac. |
| Banner `unsupported` | No Bluetooth adapter found by noble. |
| App never connects, bridge not reachable | Bridge not running, or the quick-tunnel URL has changed since it was pasted in. |
| `EADDRINUSE` | Another process holds 8787: `lsof -i :8787` then kill it. |
| `pnpm install` fails building noble | Missing Xcode CLT: `xcode-select --install`. |

## Notes

- The bridge never performs GATT reads/writes — it only passively scans. That is deliberate: iBeacon is
  advertise-only, and it keeps the internet-facing surface read-only.
- Closing the terminal window stops the bridge and the scan. No daemon is installed by default.
