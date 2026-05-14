---
phase: 03
slug: bridge-service-skeleton
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
source: extracted-from-03-RESEARCH.md
note: Post-hoc extraction to satisfy GSD health W009. Phase was planned + executed + verified before this file was split out from `03-RESEARCH.md` §Validation Architecture. Verification report `03-VERIFICATION.md` (2026-05-13) confirms 5/5 SC verified (1 schema-field human sign-off pending).
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Provenance:** This artifact is a retroactive extraction of the *Validation Architecture* section from `03-RESEARCH.md` (lines 1229-1280, 2026-05-12). The phase plan + execution + verification were carried out using the in-RESEARCH form; this file exists to satisfy the GSD canonical layout (`gsd-sdk validate.health` W009).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 |
| **Config file** | `packages/bridge/vitest.config.ts` (inherited from Phase 02) |
| **Quick run command** | `pnpm --filter @evf/bridge test` |
| **Full suite command** | `pnpm test` (workspace root) |
| **Coverage threshold** | 80% (v8 provider; workspace-wide gate per `vitest.config.ts`) |
| **Estimated runtime** | <30 seconds per-package; ~60 seconds workspace-wide |

---

## Sampling Rate

- **After every task commit:** `pnpm --filter @evf/bridge test`
- **After every plan wave:** `pnpm test:coverage` (workspace-wide, ≥80%)
- **Before `/gsd-verify-work`:** Full suite green + coverage ≥80%
- **Max feedback latency:** <30 seconds (per-package quick run)

---

## Acceptance Criterion → Test Map

Maps each ROADMAP Success Criterion to its verifying test artifact. *Wave 0 marker (❌) indicates the file did not exist at plan time and was installed during the wave; the verification report (`03-VERIFICATION.md`) confirms all entries are now ✅.*

| Criterion | Behavior | Test Type | Automated Command | File Existed at Plan Time? |
|-----------|----------|-----------|-------------------|----------------------------|
| **SC-1a** Bridge boots via Docker Compose | `GET /healthz` returns 200 | integration (Fastify `inject`) | `pnpm --filter @evf/bridge test` | ❌ Wave 0 |
| **SC-1b** `/readyz` returns 503 when ENV missing | `/readyz` with no `EVF_INTERNAL_SECRET` | unit | `pnpm --filter @evf/bridge test` | ❌ Wave 0 |
| **SC-1c** `/metrics` returns prometheus text | `GET /metrics` content-type assertion | integration (inject) | `pnpm --filter @evf/bridge test` | ❌ Wave 0 |
| **SC-1d** Unauthenticated requests rejected | `GET /v1/health` no bearer → 401 | integration (inject) | `pnpm test` | ✅ `server.test.ts` (Phase 02) |
| **SC-2a** POST `/v1/tools/:name` round-trips | `POST /v1/tools/cast_spell` w/ valid bearer → 200 stub | integration (inject) | `pnpm test` | ❌ Wave 0 |
| **SC-2b** WS envelope shape correct | WS message has `proto, seq, ts, type, session_id, payload` | unit (mock socket) | `pnpm test` | ✅ `delta-emitter.test.ts` (Phase 02) |
| **SC-3a** Idempotency dedup | Same POST twice w/ same key → second returns cached | integration (inject) | `pnpm test` | ❌ Wave 0 |
| **SC-3b** Idempotency conflict | Same key + different body → 422 | integration (inject) | `pnpm test` | ❌ Wave 0 |
| **SC-3c** Dedup metric increments | `evf_idempotency_dedup_total` increments on dedup | integration (inject) | `pnpm test` | ❌ Wave 0 |
| **SC-4a** `GET /v1/tools` returns 7 entries | array with 7 tool names | integration (inject) | `pnpm test` | ❌ Wave 0 |
| **SC-4b** Each tool has `inputSchema` | each entry has `name`, `description`, `inputSchema` w/ `type: "object"` | unit | `pnpm test` | ❌ Wave 0 |
| **SC-4c** Tool dispatch stub returns 200 | `POST /v1/tools/weapon_attack` → `{ status: 'phase-07-pending' }` | integration (inject) | `pnpm test` | ❌ Wave 0 |
| **SC-5a** WS resume within window | client sends `client_resume { last_seq: N }` → receives replay deltas | unit (mock socket) | `pnpm test` | ❌ Wave 0 |
| **SC-5b** WS resume beyond window | `client_resume` after 60s → `resume_full_snapshot` | unit (mock socket + fake timers) | `pnpm test` | ❌ Wave 0 |
| **SC-5c** WS resume gap → full snapshot | buffer has gap → `resume_full_snapshot { reason: 'buffer_gap' }` | unit | `pnpm test` | ❌ Wave 0 |

*Per-task verification status:* see per-plan SUMMARY files (`03-01-SUMMARY.md` through `03-05-SUMMARY.md`) for task-level test verdicts. The verification report `03-VERIFICATION.md` (2026-05-13) confirms `5/5 success criteria verified`.

---

## Wave 0 File Installations

These files did not exist when Phase 03 planning was done; they were created during Wave 0 of the relevant plans to make the criteria above testable.

- [x] `packages/bridge/src/routes/healthz.ts` — covers SC-1a, SC-1b
- [x] `packages/bridge/src/routes/readyz.ts` — covers SC-1b
- [x] `packages/bridge/src/routes/metrics.ts` — covers SC-1c
- [x] `packages/bridge/src/routes/tools.ts` (replacement) — covers SC-4a, SC-4b, SC-4c, SC-2a
- [x] `packages/bridge/src/middleware/idempotency.ts` — covers SC-3a, SC-3b, SC-3c
- [x] `packages/bridge/src/ws/resume.ts` (or inline in WS handler) — covers SC-5a, SC-5b, SC-5c
- [x] `packages/shared-protocol/src/tools.ts` — covers SC-4b (schema shape)
- [x] `packages/bridge/src/types/fastify.d.ts` — needed for TypeScript strict compilation
- [x] `deploy/bridge.Dockerfile` + `deploy/docker-compose.yml` — SC-1a (validated via `docker compose config -q`; full image build is manual, see Manual-Only Verifications)
- [x] `packages/bridge/src/metrics/registry.ts` — prom-client setup

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full Docker image build + container boot | SC-1a end-to-end | Requires `docker buildx` + `pnpm` in PATH; not run in CI for Phase 03 | `cd deploy && cp .env.example .env && bash smoke.sh` |
| WS envelope field-name confirmation | SC-2 | ROADMAP SC-2 text cites `{path?, value?, prev_seq?}`; implementation uses `{session_id, payload}` per ADR-0002 final shape — operator must confirm the deviation from literal SC-2 text is intentional (Phase 02 PLAN-CHECK marked it `COVERED with note`) | Compare `EnvelopeSchema` in `packages/shared-protocol/src/envelope.ts` against ROADMAP SC-2 text; sign off in `03-VERIFICATION.md` `human_verification` section |

---

## Validation Sign-Off

- [x] All success criteria have automated `<verify>` or are explicitly marked Manual-Only
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (per-plan SUMMARY files confirm)
- [x] Wave 0 covers all `❌ at Plan Time` references (10/10 files installed)
- [x] No watch-mode flags in CI commands
- [x] Feedback latency <30s per-package
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** post-hoc-approved 2026-05-14 (phase verified 2026-05-13; this artifact extracted from RESEARCH.md §Validation Architecture to satisfy GSD W009 layout requirement)

---

## Sources

- `03-RESEARCH.md` §Validation Architecture (lines 1229-1280, 2026-05-12) — primary source
- `03-VERIFICATION.md` (2026-05-13T08:45:00Z) — 5/5 SC verified, 2 items `human_needed`
- `03-01-SUMMARY.md` through `03-05-SUMMARY.md` — per-plan task verdicts
- ADR-0002 (protocol-versioning), ADR-0003 (tool-registry-pattern), ADR-0008 (code-quality-configuration) — locked decisions binding this phase
