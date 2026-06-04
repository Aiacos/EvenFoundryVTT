---
"@evf/bridge": patch
"@evf/g2-app": patch
---

feat(dev): DEV-ONLY no-token mode — skip the wizard access-token step + bridge bearer bypass

A flag-gated developer convenience so the pairing flow can be exercised without a
real bearer token (and without Foundry).

- **bridge** (`EVF_DEV_NO_AUTH=true`, honored only when `NODE_ENV !== 'production'`,
  with the same prod double-opt-in as the debug harness): `TokenCache.validate`
  short-circuits to a synthetic 24h dev session, an `onRequest` hook injects a
  sentinel bearer for token-less requests so per-route 401 guards pass, CORS reflects
  any origin (so a local Vite/simulator can reach it), and `GET /v1/characters`
  serves a small mock roster when no Foundry world is connected.
- **g2-app** (`VITE_EVF_NO_AUTH=true`): the wizard skips Step 2 (token entry) —
  Step 1 advances straight to Step 3 — and `VITE_EVF_DEV_BRIDGE_URL`
  (default `http://localhost:8910` when no-auth is on) pre-fills the bridge URL so the
  tester never types it. Gated on the explicit flag (NOT `import.meta.env.DEV`) so
  Vitest keeps exercising the real token flow; absent in production builds.
