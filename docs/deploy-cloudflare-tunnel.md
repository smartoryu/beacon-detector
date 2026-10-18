# TODO — Expose the bridge with Cloudflare Tunnel

The bridge runs on the Mac (see [`runbook-bridge-macos.md`](./runbook-bridge-macos.md)) and is reachable
from the internet through a Cloudflare Tunnel. `cloudflared` dials **outbound**, so there are no open
ports, no public IP and no router changes — and Cloudflare terminates TLS, which is what lets the
HTTPS-hosted app open a `wss://` socket.

Two modes:

| Mode | Hostname | When |
| :-- | :-- | :-- |
| **Quick tunnel** | random `https://<words>.trycloudflare.com` | today (no domain needed) |
| **Named tunnel** | stable `wss://ble-bridge.<domain>` | later, once a domain exists |

---

## A. Quick tunnel (start here)

- [ ] Install `cloudflared`: `brew install cloudflared`
- [ ] Terminal 1 — start the bridge (see the runbook for env setup):
      `pnpm bridge`
- [ ] Terminal 2 — start the tunnel:
      `pnpm tunnel`  (i.e. `cloudflared tunnel --url http://127.0.0.1:8787`)
- [ ] Copy the printed URL, e.g.
      `https://calm-words-1234.trycloudflare.com`
- [ ] In the deployed app: **Bridge settings** → paste that URL into **Bridge URL**
      (it is normalized to `wss://…/ble-ws` automatically) → enter the **Token** →
      **Save & connect**.
- [ ] Confirm the banner goes `idle` → `searching`, and DevTools → Network → WS shows
      **101 Switching Protocols**.

### Quick-tunnel caveats

- The hostname is **random and changes every restart** — re-paste it into the app after each start. This
  is exactly why the app has a runtime settings panel.
- No uptime SLA; it is explicitly not intended for production.
- Anyone who knows the URL can attempt to connect; the **token is the gate**. Always set
  `BRIDGE_AUTH_TOKEN`.

---

## B. Upgrade to a named tunnel (when a domain exists)

Only the tunnel command and DNS route change; the app already accepts any `wss://` URL.

- [ ] Add a domain to Cloudflare (or transfer one in).
- [ ] `cloudflared tunnel login`
- [ ] `cloudflared tunnel create beacon-bridge`
- [ ] `cloudflared tunnel route dns beacon-bridge ble-bridge.<your-domain>`
- [ ] Create `~/.cloudflared/config.yml`:

      ```yaml
      tunnel: beacon-bridge
      credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
      ingress:
        - hostname: ble-bridge.<your-domain>
          service: http://127.0.0.1:8787
        - service: http_status:404
      ```

- [ ] Run it: `cloudflared tunnel run beacon-bridge`
- [ ] In the app, set **Bridge URL** to `wss://ble-bridge.<your-domain>` and keep the token.
- [ ] Add `https://ble-bridge.<your-domain>` to `BRIDGE_ALLOWED_ORIGINS`? **No** — the allowlist is about
      the *app's* origin (`https://<project>.pages.dev`), not the tunnel hostname.
- [ ] Optional hardening: put **Cloudflare Access** in front of `ble-bridge.<your-domain>` and use a
      service token, so only your identity provider can reach the bridge.

---

## C. Optional: keep it running automatically

The plan deliberately runs the bridge manually. If you later want it always-on:

- [ ] macOS: a **LaunchAgent** in `~/Library/LaunchAgents` (not a root LaunchDaemon — the Bluetooth
      permission prompt belongs to the logged-in GUI session).
- [ ] Linux: a `systemd` service with `AmbientCapabilities=CAP_NET_RAW`.

## D. Origin allowlist reminder

`BRIDGE_ALLOWED_ORIGINS` must contain the **app** origin(s):

```
https://beacon-detector.pages.dev
https://*.beacon-detector.pages.dev
http://localhost:5173
```

Wildcards match within a hostname segment, so preview deploys are covered by the second entry.
