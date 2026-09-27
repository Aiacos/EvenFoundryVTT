# @evf/e2e

## 🎲 Overview

Cross-package end-to-end tests of the relay pairing ([ADR-0019](../../docs/architecture/0019-relay-pairing-player-projector.md)):
the **real** Foundry projector of `@evf/foundry-module` (module `init`, «Collega occhiali G2»
window, `Projector`, `RelayConnection`) and the **real** glasses session of `@evf/g2-app` —
and, optionally, the built glasses-app bundle in headless Chromium — over a **real** relay.
It lives in its own package so that neither the module nor the app depends on the other
(the module bundle must never pull in glasses-app code).

## 🧪 Testing

Skipped unless `EVF_RELAY_URL` is set (CI: the "Relay end-to-end" step of `ci.yml`):

```bash
pnpm --filter @evf/relay exec wrangler dev --port 8799 --ip 127.0.0.1
pnpm --filter @evf/g2-app build   # the browser suite serves packages/g2-app/dist
EVF_RELAY_URL=ws://127.0.0.1:8799 \
EVF_CHROMIUM="$(node -e "console.log(require('@playwright/test').chromium.executablePath())")" \
EVF_LAN_IP="$(hostname -I | awk '{print $1}')" \
pnpm vitest --run packages/e2e/src/pairing.e2e.test.ts
```

`EVF_CHROMIUM` (a Chromium binary, e.g. from `pnpm exec playwright install chromium`) enables
the browser suite; `EVF_LAN_IP` adds BR-2 (the bundle on `http://<LAN-IP>`: no WebCrypto).
With the production relay (`EVF_RELAY_URL=wss://evf-relay.evf-relay.workers.dev`) the
deployed-page scenarios (BR-1/4/5) run too. `EVF_E2E_TRACE_DIR=<dir>` writes each
scenario's relay timeline as JSON.
