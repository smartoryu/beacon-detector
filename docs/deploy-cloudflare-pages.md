# TODO — Deploy the app to Cloudflare Pages

Static Vite SPA on the free `*.pages.dev` domain. Cloudflare Pages' **Git integration** builds and
deploys; GitHub Actions only runs CI (no double deploy).

> If you pick a different Pages project name, update `BRIDGE_ALLOWED_ORIGINS` in
> `server/.env` to match the resulting `https://<project>.pages.dev` origin.

## Prerequisites

- [ ] The repo is pushed to GitHub: `smartoryu/beacon-detector` (default branch `main`).
- [ ] A Cloudflare account (free plan is enough).
- [ ] `pnpm build` succeeds locally.

## Create the Pages project

- [ ] Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
- [ ] Authorize GitHub and select **`smartoryu/beacon-detector`**.
- [ ] Project name: **`beacon-detector`** (this becomes `beacon-detector.pages.dev`).
- [ ] Production branch: **`main`**.

## Build settings

- [ ] Framework preset: **Vite**
- [ ] Build command: `pnpm build`
- [ ] Build output directory: `dist`
- [ ] Root directory: `/` (default)
- [ ] Environment variable: `NODE_VERSION` = `22`
- [ ] Optional: `VITE_BRIDGE_URL` — leave **empty**. The runtime **Bridge settings** panel overrides it,
      which is required because a Cloudflare quick tunnel URL changes on every restart.
- [ ] Optional: `VITE_BRIDGE_TOKEN` — leave **empty** for the same reason (enter it in the UI).

`wrangler.toml` in the repo already sets `pages_build_output_dir = "dist"`.

## First deploy

- [ ] Click **Save and Deploy**.
- [ ] Open `https://beacon-detector.pages.dev` and confirm the app loads over HTTPS.

## Verify

- [ ] Browser transport: in **Chrome** with
      `chrome://flags/#enable-experimental-web-platform-features` enabled, select **Browser** → **Scan**.
      (Web Bluetooth needs a secure context; Pages provides HTTPS.)
- [ ] Bridge transport: the **Node bridge** option stays disabled until a bridge is reachable — expected
      until you follow [`deploy-cloudflare-tunnel.md`](./deploy-cloudflare-tunnel.md).
- [ ] Once the tunnel is running, paste its URL + token into **Bridge settings** → **Save & connect** and
      confirm DevTools shows `101 Switching Protocols` on the `wss://` socket.

## Preview deployments (automatic)

- [ ] Open a PR: Pages builds a preview at `https://<hash>.beacon-detector.pages.dev`.
- [ ] Preview origins are covered by the wildcard `https://*.beacon-detector.pages.dev` in
      `BRIDGE_ALLOWED_ORIGINS`.

## Notes

- **No SPA rewrite is needed**: the app has no client-side router, so every path is served by
  `index.html`. If routing is added later, add `public/_redirects` with `/* /index.html 200`.
- **Custom domain** (optional): Pages → project → **Custom domains** → add one. Not required.
- **CI is separate**: `.github/workflows/ci.yml` runs lint/typecheck/test/build on every push and PR.
  Pages does the deploy; do not add a Pages deploy step to GitHub Actions.
- **Web Bluetooth permissions policy**: the default `bluetooth=(self)` allowlist is fine because the app is
  served from the same origin. If you add a `public/_headers` file later, keep `bluetooth` permitted.
