# Phase 10: Polish & Field Test MVP — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Source:** smart-discuss (autonomous batch — 2 areas accepted)

<domain>
## Phase Boundary

Final MVP phase: harden recovery paths, profile latency, finalize documentation, run multi-session field test (HARDWARE-PENDING).

Software-deliverable (this phase):
- WS reconnect resilience module + `⚠ SYNC LOST` chip.
- Latency profiling instrumentation (probe + envelope; measurement is hardware-pending).
- INV-1..5 verification suite single-command (`inv:all`).
- 5 documentation files + INV-3 doc coherence audit.

Hardware-pending carry-forward (SC-10-01..03):
- Multi-session field test (≥2 sessions) + NASA-TLX self-report.
- Latency p50 ≤ 400ms end-to-end measured on real R1+G2+Foundry.
- Microwave / 2.4 GHz RF worst-case test in-session.

**NOT in scope:**
- Cloud SaaS deployment (Phase 13 stretch).
- DSN raster (Phase 13 stretch).
- New REQ-IDs (Phase 10 is cross-cutting verification).

</domain>

<decisions>
## Implementation Decisions

### Area 1: Software Hardening Scope

- **WS reconnect module** (`packages/g2-app/src/engine/ws-reconnect.ts`):
  - Exponential backoff: `1s → 2s → 4s → 8s → 15s → 30s` (cap 30s).
  - On WS close → mount `⚠ SYNC LOST` chip in Status HUD footer (new `getR1Hints()` override or direct chip override via existing Phase 6 pattern).
  - On reconnect success → re-subscribe with `{ subscribe_from: lastConfirmedSeq + 1 }` (Specs §11.5.8.1).
  - Replay buffer client-side tracks `lastConfirmedSeq` from inbound envelopes; persists in-memory only (lost on Even App reload — acceptable for MVP).
  - Unmounts chip on successful resume; logs reconnect duration for perf-probe.
- **Perf probe module** (`packages/g2-app/src/engine/perf-probe.ts`):
  - Opt-in via `?probe=true` URL param (or `PERF_PROBE` env at boot).
  - Records timestamps at 5 stations: R1 gesture emit → bridge POST → handler invoke → action-result envelope → toast queued.
  - Emits `r1.perf.sample` envelope per action with `{ idempotencyKey, stations: [{ name, ts }] }`.
  - `docs/perf/phase-10-latency.md` template scaffolded — hardware-pending fills.
- **INV verification suite** (`packages/validation-harness/src/inv-suite.ts`):
  - Single command `pnpm --filter @evf/validation-harness inv:all`.
  - Runs: INV-1 (matchAsciiFixture on all fixtures), INV-2 (online cross-check stub — full execution gated on network), INV-3 (grep cross-references between Specs.md / README.md / showcase / docs/), INV-4 (biome + typecheck + dead-code grep), INV-5 (gesture determinism test from Phase 6 + grep `Hooks.on('dnd5e.preUseActivity'`).
  - Green/red table output.

### Area 2: Documentation Surface

- **`docs/README.md`** — project README pointing to Specs.md + setup + showcase.
- **`docs/setup-guide.md`** — end-to-end: install Foundry module + bridge service + plugin host + Even Realities App config + R1 pairing. 5-step quickstart + troubleshooting.
- **`docs/runbook.md`** — operational: bridge restart, audit log inspection, bearer revoke, log/metric endpoints, common errors with recovery.
- **`docs/firmware-compatibility.md`** — Even Hub SDK version matrix (current verified version + expected forward compat per upstream changelogs).
- **`docs/perf/phase-10-latency.md`** — template + hardware-pending measurements per SC-10-02.
- **INV-3 doc coherence audit:** atomic cross-cutting commit reconciling Specs.md + README.md + showcase + new docs. Single commit per INV-3 §0.1.

### Area 3: Hardware-Pending Carry-Forward

3 SCs to ADR-0005 PROVISIONAL Branch A `human_needed`:
- **SC-10-01:** Multi-session field test (≥2 D&D sessions) with consenting DM + NASA-TLX / Borg CR-10 eye-fatigue self-report.
- **SC-10-02:** Latency p50 ≤ 400ms end-to-end measured via perf-probe on real R1+G2+Foundry.
- **SC-10-03:** Microwave / 2.4 GHz worst-case RF test — graceful degrade to glyph mode without session-state loss.

Running project hardware-pending total after Phase 10: **29 + 3 = 32 SCs**.

### Area 4: Plan Decomposition

| Wave | Plan | Title |
|------|------|-------|
| 0 | 10-01 | WS reconnect module + replay-buffer sequencing + `⚠ SYNC LOST` chip + INV-1 fixtures |
| 1 | 10-02 | Perf probe module + r1.perf.sample envelope + `docs/perf/phase-10-latency.md` template |
| 2 | 10-03 | INV verification suite single-command + `inv:all` script + green/red table |
| 3 | 10-04 | 5 documentation files (README + setup + runbook + firmware-compat + latency template) + INV-3 atomic coherence commit |
| 4 | 10-05 | Phase 10 + MVP closure (STATE / ROADMAP / VERIFICATION + milestone-ready signal) |

5 plans, sequential.

### Area 5: Threat Model

- T-10-01 Stale lastConfirmedSeq on long disconnect — mitigated by replay buffer's seq-overflow detection (bridge returns error if requested seq is older than the buffer).
- T-10-02 Perf probe leaks idempotencyKeys — mitigated by hashing keys before emission.

</decisions>

<canonical_refs>
## Canonical References

- packages/bridge/src/ (Phase 3 — replay buffer + lastConfirmedSeq pattern)
- packages/g2-app/src/internal/boot-engine-core.ts (boot wiring for new modules)
- packages/g2-app/src/status-hud/status-hud-renderer.ts (Phase 4a/6/8/9 — extend with SYNC LOST chip)
- packages/validation-harness/src/ (Phase 0/1 — INV verification scaffolding)
- Specs.md §11.5.8.1 (reconnect resilience canonical)
- Specs.md §11.5.8.2 (microwave RF degrade canonical)
- docs/architecture/INVARIANTS.md (Phase 6 — INV-1..5 ratified)

</canonical_refs>

<specifics>
## Specifics

### SYNC LOST chip mockup

```
║ R1: ...  long=quick   ⚠ SYNC LOST (riconnetto in 4s)   [combat] [▶spell] ║
```

### perf-probe envelope sample

```json
{
  "proto": "evf-v1",
  "seq": 42,
  "ts": 1731234567890,
  "type": "r1.perf.sample",
  "session_id": "uuid",
  "payload": {
    "idempotencyKeyHash": "sha256(idempotencyKey).slice(0,16)",
    "stations": [
      { "name": "gesture_emit", "ts": 1731234567890 },
      { "name": "bridge_post", "ts": 1731234567945 },
      { "name": "handler_invoke", "ts": 1731234568012 },
      { "name": "result_envelope", "ts": 1731234568267 },
      { "name": "toast_queued", "ts": 1731234568289 }
    ]
  }
}
```

</specifics>

<deferred>
## Deferred Ideas

- **Cloud SaaS deployment** — Phase 13.
- **DSN raster** — Phase 13.
- **Server-side perf aggregation** — Phase 10 emits envelopes; aggregation lives in operator's choice (e.g., Loki + Grafana).
- **Field test result publication** — hardware-pending SC-10-01 closure includes a results document (`docs/field-test-N.md`) but Phase 10 ships only the template.

</deferred>

---

*Phase: 10-polish-field-test-mvp*
*Context gathered: 2026-05-17 via /gsd-autonomous smart-discuss batch (2 areas)*
