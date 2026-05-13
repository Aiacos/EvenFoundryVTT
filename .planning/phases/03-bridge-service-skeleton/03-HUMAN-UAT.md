---
status: partial
phase: 03-bridge-service-skeleton
source: [03-VERIFICATION.md]
started: 2026-05-13T08:45:00Z
updated: 2026-05-13T08:45:00Z
---

## Current Test

[awaiting human testing — requires either ROADMAP text review (item 1) or Docker access (item 2)]

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
result: [pending]

### 2. Docker smoke test (full container boot)
expected: Operator runs `cd deploy && cp .env.example .env && bash smoke.sh`.
  Assertions: `GET /healthz` → 200; `GET /readyz` → 200 (with `EVF_INTERNAL_SECRET`
  set, ≥32 chars); `GET /v1/health` without `Authorization` → 401; `GET /metrics`
  → 200 + `text/plain; version=0.0.4`. Compose syntax already validated
  programmatically (`docker compose config -q` exits 0).
file: deploy/smoke.sh, deploy/docker-compose.yml, deploy/bridge.Dockerfile
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0  # neither is blocked — both can be resolved without external dependencies

## Gaps

(none — verifier returned 5/5 SC verified; the 2 items above are explicit
human-sign-off requirements, not implementation gaps)
