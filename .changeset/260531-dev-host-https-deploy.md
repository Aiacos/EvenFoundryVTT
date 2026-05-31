---
"@evf/g2-app": patch
---

Dev/deploy ergonomics for on-glasses testing and the permanent-install (Even Hub submission) path.

- `pnpm --filter @evf/g2-app dev` now binds `--host 0.0.0.0 --port 5173` so the Even app can reach
  the dev server over the LAN (scan the `dev:qr` QR → dev mode, no trial expiry).
- Turnkey HTTPS deploy: `deploy/Caddyfile` + `deploy/docker-compose.https.yml` (Caddy reverse
  proxy with auto Let's Encrypt — fronts the bridge + serves the g2-app plugin host), and
  `deploy/sync-app-whitelist.mjs` to fill `app.json`'s network whitelist from `deploy/.env`.
  Documented in `docs/release/evenhub.md` (incl. Cloudflare/Tailscale tunnel alternatives for
  homelabs without a public IP).
