---
phase: quick-260604-pai
plan: 01
subsystem: g2-app boot engine
tags: [websocket, url-derivation, bugfix, boot-engine]
requires:
  - "@evf/g2-app boot engine (boot-engine-core.ts)"
  - "bridge /ws route (server.ts:571 — app.get('/ws', { websocket: true }))"
provides:
  - "toWsConnectUrl pure helper (engine/ws-url.ts) — REST base -> ws(s)://.../ws"
  - "bootEngine initial WS + WsReconnectController now target the live /ws route"
affects:
  - "packages/g2-app/src/internal/boot-engine-core.ts (two WS-open sites + bridgeUrl doc)"
tech-stack:
  added: []
  patterns:
    - "Pure idempotent URL-derivation helper, unit-tested in isolation"
key-files:
  created:
    - packages/g2-app/src/engine/ws-url.ts
    - packages/g2-app/src/engine/__tests__/ws-url.test.ts
    - .changeset/fix-engine-ws-url-derivation.md
  modified:
    - packages/g2-app/src/internal/boot-engine-core.ts
    - packages/g2-app/package.json
decisions:
  - "Used `.js` extension on the new import to match boot-engine-core's existing ESM import convention (plan suggested extensionless; .js is the in-file standard)."
  - "Already-ws-scheme inputs are left path-as-is (no force /ws append) so existing boot-engine fixtures like 'ws://test/bridge' stay byte-stable and the ws-reconnect.test.ts 'wss://test.local/ws' contract is preserved."
metrics:
  duration: ~6 min
  completed: 2026-06-04
---

# Phase quick-260604-pai Plan 01: Fix Engine WebSocket URL Derivation Summary

A pure `toWsConnectUrl` helper now derives the bridge `ws(s)://host/ws` connect URL from the REST base URL at both WS-open sites in `boot-engine-core.ts`, so the boot WebSocket actually connects instead of throwing at step 5.

## What Was Built

- **`engine/ws-url.ts`** — pure `toWsConnectUrl(baseUrl)`: `http→ws` / `https→wss`, trailing-slash collapse, idempotent `/ws` append. An input already on a `ws`/`wss` scheme is treated as an already-derived connect URL (no scheme conversion, no force `/ws`), keeping it safe to apply twice and preserving existing fixtures. TSDoc per INV-4; no `window`/global access.
- **`engine/__tests__/ws-url.test.ts`** — 9 unit tests: every behavior-block row + explicit double-application idempotency + the `ws://test/bridge` fixture-stability case + the `wss://test.local/ws` ws-reconnect contract string.
- **`boot-engine-core.ts`** — initial connect (line 374) and the `WsReconnectController` `url:` (line 783) now call `toWsConnectUrl(opts.bridgeUrl)`. `BootEngineOpts.bridgeUrl` TSDoc corrected from "Bridge WebSocket URL" to "Bridge REST base URL" with a note that the engine derives the ws(s)://…/ws connect URL internally. The displayop URL (line 397) and audio `startAudioCapture` `bridgeUrl` (line 1081) were left unchanged — both still resolve correct HTTP(S) URLs from the REST base.
- Version bump `@evf/g2-app` 0.2.3 → 0.2.4 + `.changeset/fix-engine-ws-url-derivation.md` (patch).

## Verification

- `grep "toWsConnectUrl(opts.bridgeUrl)"` → exactly 2 matches (line 374 + line 783). ✓
- `/debug/displayop` URL still built from `opts.bridgeUrl` (`^ws`→http no-op on https base), unchanged. ✓
- Audio consumer `bridgeUrl: opts.bridgeUrl` unchanged (line 1081). ✓
- `tsc --noEmit -p tsconfig.base.json` → exit 0. ✓
- File-scoped `biome check` on the 3 touched/new files → clean. ✓
- Full `@evf/g2-app` vitest → **1411 passed** (was 1402 pre-change; +9 new ws-url tests, 0 regressions — ws-reconnect.test.ts and boot-engine fixtures all green). ✓
- `pnpm changeset:status` shows a declared `@evf/g2-app` bump. ✓

## Deviations from Plan

- **[Rule 3 — minor convention fix]** The plan's import line was `import { toWsConnectUrl } from '../engine/ws-url';` (extensionless). `boot-engine-core.ts` uses `.js` extensions on every relative import (ESM), so the import was written as `'../engine/ws-url.js'` to match the file's standard and keep tsc/biome clean. No behavioral difference.
- Test file uses `import { toWsConnectUrl } from '../ws-url.js'` for the same ESM reason.

## Tooling Note (environment substitution)

Per the dispatch environment note, the repo-wide husky `biome ci .` pre-commit hook surfaces ~300 pre-existing dev-harness warnings unrelated to this task. Commits used `git commit --no-verify`; the equivalent file-scoped gates were run manually instead and all passed: `corepack pnpm exec biome check <touched files>` + `corepack pnpm exec tsc --noEmit -p tsconfig.base.json` + `corepack pnpm --filter @evf/g2-app exec vitest --run`. `corepack pnpm` used throughout (pnpm not on PATH).

## Commits

- `bd95d45` feat(260604-pai-01): add pure toWsConnectUrl WS-URL derivation helper + tests (TDD: RED then GREEN combined)
- `18c3d92` fix(260604-pai-01): wire toWsConnectUrl into both WS-open sites + doc + bump

## Out of Scope (untouched, as planned)

bridge, `launch.ts`, `index.ts`, `ws-reconnect.ts`, the WS DATA path that fills the StatusHUD, `.ehpk` packaging/deploy.

## Self-Check: PASSED

- FOUND: packages/g2-app/src/engine/ws-url.ts
- FOUND: packages/g2-app/src/engine/__tests__/ws-url.test.ts
- FOUND: .changeset/fix-engine-ws-url-derivation.md
- FOUND commit: bd95d45
- FOUND commit: 18c3d92
