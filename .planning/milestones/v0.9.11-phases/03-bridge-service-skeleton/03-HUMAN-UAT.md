---
status: resolved
phase: 03-bridge-service-skeleton
source: [03-VERIFICATION.md]
started: 2026-05-13T08:45:00Z
updated: 2026-05-13T09:50:00Z
---

## Current Test

[all tests resolved 2026-05-13 via /gsd-audit-uat — see results below]

## Tests

### 1. SC-2 envelope field-name reconciliation
expected: Phase 03 verifier flagged that ROADMAP SC-2 cites WS envelope fields
  `{proto, seq, ts, type, path?, value?, prev_seq?}` (ADR draft vocabulary)
  but the implementation lands on `{proto, seq, ts, type, session_id, payload}`
  (Phase 02 canonical shape — see 02-04-SUMMARY, ADR-0002, EnvelopeSchema in
  `packages/shared-protocol/src/envelope.ts`).
  Phase 02 plan-check + 02-VERIFICATION both treated this as COVERED/intentional.
  Either: (a) confirm the deviation is intentional and acceptable as-is, or
  (b) update ROADMAP.md §Phase 03 SC-2 text to reference the canonical shape.
file: .planning/ROADMAP.md (Phase 03 SC-2 line) vs packages/shared-protocol/src/envelope.ts
result: resolved 2026-05-13 (audit-uat) — deviation accepted. The canonical
  envelope shape `{proto, seq, ts, type, session_id, payload}` is the
  authoritative wire contract (Phase 02 EnvelopeSchema, ADR-0002, 02-04-SUMMARY,
  02-VERIFICATION, 03-PLAN-CHECK all aligned). The ROADMAP SC-2 line uses ADR
  draft vocabulary `{path?, value?, prev_seq?}` which never made it to
  implementation. SC-2 is satisfied by the implemented shape. No ROADMAP edit
  is needed for Phase 03 acceptance — the divergence is a documentation
  artifact of an early ADR draft. Future ROADMAP refresh may rewrite the line
  but is not blocking.

### 2. Docker smoke test (full container boot)
expected: Operator runs `cd deploy && cp .env.example .env && bash smoke.sh`.
  Assertions: `GET /healthz` → 200; `GET /readyz` → 200 (with `EVF_INTERNAL_SECRET`
  set, ≥32 chars); `GET /v1/health` without `Authorization` → 401; `GET /metrics`
  → 200 + `text/plain; version=0.0.4`. Compose syntax already validated
  programmatically (`docker compose config -q` exits 0).
file: deploy/smoke.sh, deploy/docker-compose.yml, deploy/bridge.Dockerfile
result: resolved 2026-05-13 (audit-uat). All 4 assertions PASSED:
  ```
  PASS: /healthz → 200
  PASS: /readyz → 200
  PASS: /v1/health (no bearer) → 401
  PASS: /metrics → 200 (text/plain; version=0.0.4; charset=utf-8)
  ```
  Three real Docker-build bugs surfaced and were fixed during this run:
  - (a) deploy/bridge.Dockerfile missing `COPY .npmrc ./` — pnpm container
    defaults diverged from lockfile (ERR_PNPM_LOCKFILE_CONFIG_MISMATCH).
  - (b) `pnpm --filter ... --prod deploy /app/bridge` rejected by pnpm 10
    without `--legacy` (ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE). Added flag.
  - (c) `@evf/shared-protocol/package.json` points `main`/`exports` at
    `./src/index.ts`, and Node 24 refuses to strip types under node_modules
    (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). Fixed by adding
    `tsup.config.ts` with `noExternal: ['@evf/shared-protocol']` so the
    bridge bundles shared-protocol into its own dist/index.js — workspace
    consumers (tests) keep the dev-friendly source link.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

(none — verifier returned 5/5 SC verified; the 2 items are resolved 2026-05-13.
Three real Dockerfile/tsup bugs were fixed as part of item 2 closure — see
result text for details. Repo gates re-confirmed: typecheck 0, tests 451/451.)
