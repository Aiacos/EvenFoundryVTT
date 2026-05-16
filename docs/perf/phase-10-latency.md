# Phase 10 Latency Profile — Hardware-Pending

> **Status:** TEMPLATE — hardware-pending (SC-10-02).
> Fill in `## Measurements` once real R1+G2+Foundry hardware sessions are available.
> See `## SC-10-02 Closure` for the exact fill-in procedure.

---

## Target

Per ROADMAP SC-2:

> **p50 manual-action latency < 400ms end-to-end** (R1 gesture → chat card visible on Foundry).

Supplementary targets (derived from Specs.md §11.5.8 + Phase 10 CONTEXT §Area3):

| Percentile | Target |
|------------|--------|
| p50        | ≤ 400ms |
| p95        | ≤ 800ms |
| p99        | — (no formal target; document as observed) |

---

## Method

Opt-in perf probe activated via `?probe=true` URL param in the Even Realities App
WebView, or via `perfProbe: true` boot option passed to `bootEngine()`.

**Implementation reference:** `packages/g2-app/src/engine/perf-probe.ts`

When enabled, `PerfProbe` records timestamps at 4 g2-app-side stations per action
flow. The probe emits a `r1.perf.sample` envelope (type: `'r1.perf.sample'`) over
the existing bridge WS connection after the `toast_queued` station fires. Envelopes
are received and logged by the bridge or consumed by the operator's telemetry
pipeline (e.g. Loki + Grafana).

**Activation:**
```
https://<plugin-host>/index.html?probe=true&token=<bearer>
```

**T-10-02 privacy mitigation:** the `idempotencyKey` (a bearer-bound dedup token)
is NEVER transmitted in clear text. It is hashed via SHA-256 truncated to 16 hex
chars before envelope construction. See `## Privacy` section below.

---

## Stations

| Station | Emission site | Latency component |
|---------|---------------|-------------------|
| `gesture_emit` | `packages/g2-app/src/engine/r1-event-source.ts` — R1 gesture received by WS handler | Gesture → g2-app WS receive |
| `bridge_post` | `packages/g2-app/src/panels/action-options-modal.ts` — `tool.invoke` envelope sent over WS | g2-app → bridge transmission |
| `handler_invoke` | `packages/foundry-module/src/socketlib-handlers.ts` — socketlib `executeAsGM` entry (**server-side — recorded by foundry-module logs, NOT g2-app probe**) | bridge → Foundry GM execution |
| `result_envelope` | `packages/g2-app/src/internal/boot-engine-core.ts` (createWsEventBus) — `r1.action.result` received | Foundry → bridge → g2-app WS receive |
| `toast_queued` | `packages/g2-app/src/status-hud/toast-queue-layer.ts` — `ToastQueueLayer.enqueue()` | g2-app internal enqueue |

> **Note on `handler_invoke`:** The g2-app probe approximates this timestamp from
> the midpoint of `bridge_post` and `result_envelope`. The actual handler entry
> time is only measurable via foundry-module logs (pino structured output). For
> accurate `handler_invoke` measurement, enable debug logging in the bridge and
> correlate via `idempotencyKeyHash` field (same hash appears in both the
> `r1.perf.sample` envelope and the bridge logs).

---

## Measurements

> **All rows below are hardware-pending (SC-10-02).**
> Replace each `_pending_` cell with real values from field-test sessions.

| Sample # | Action | `gesture_emit` → `toast_queued` (ms) | `gesture_emit` → `result_envelope` (ms) | `gesture_emit` → `bridge_post` (ms) | Notes |
|----------|--------|--------------------------------------|------------------------------------------|--------------------------------------|-------|
| 1 | cast-spell | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | |
| 2 | weapon-attack | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | |
| 3 | use-item | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | |
| 4 | cast-spell | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | |
| 5 | weapon-attack | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | _pending hardware (SC-10-02)_ | |
| ... | ... | ... | ... | ... | ... |

**Aggregate (populate after ≥50 samples across ≥2 sessions):**

| Metric | `gesture_emit` → `toast_queued` | `gesture_emit` → `result_envelope` |
|--------|---------------------------------|-------------------------------------|
| p50    | _pending_ | _pending_ |
| p95    | _pending_ | _pending_ |
| p99    | _pending_ | _pending_ |

---

## Pass/Fail

The ROADMAP SC-2 software portion is closed by landing the probe instrumentation
(this Plan 10-02). The hardware measurement closure follows in SC-10-02.

**Pass criteria (hardware measurement, SC-10-02):**

- p50 `gesture_emit` → `toast_queued` **≤ 400ms** across ≥50 samples in ≥2 field-test sessions
- p95 `gesture_emit` → `toast_queued` **≤ 800ms**
- No measurement session shows p50 > 600ms (hard fail — remediate BLE / bridge config)

**Fail remediation:**

| Failure mode | Likely cause | Remediation |
|--------------|--------------|-------------|
| `bridge_post` delay > 100ms | BLE throughput below 200 kbps | Enable glyph-only mode (`?mode=glyph`); check BLE 4.2 DLE |
| `result_envelope` delay > 300ms | Foundry hook processing slow | Profile foundry-module hooks; check socketlib overhead |
| `toast_queued` delay > 50ms | ToastQueueLayer redraw contention | Check bridge `textContainerUpgrade` round-trip; check queue depth |

---

## SC-10-02 Closure

**Procedure:**

1. Enable perf probe: navigate to `https://<plugin-host>/index.html?probe=true&token=<bearer>`
2. Run ≥50 manual actions (cast-spell, weapon-attack, use-item) across ≥2 separate D&D sessions
3. Collect `r1.perf.sample` envelopes from the bridge log (pino JSON, field `type === "r1.perf.sample"`)
4. Extract latency deltas per action: `toast_queued.ts - gesture_emit.ts`
5. Compute p50, p95, p99 across all samples
6. Fill in the `## Measurements` table above
7. Evaluate against `## Pass/Fail` criteria
8. Commit updated `docs/perf/phase-10-latency.md` with real measurements
9. Mark SC-10-02 as CLOSED in `.planning/STATE.md`

**SC-10-02 is hardware-pending.** Once hardware sessions are available, refer
to this procedure and update this document in-place. The Phase 10 ROADMAP entry
for SC-10-02 will be updated from `human_needed` to `closed` upon completion.

---

## Privacy

**T-10-02 mitigation** (idempotency key leakage prevention):

The `idempotencyKey` used by the EVF action flow is a bearer-bound dedup token
(Phase 3 Plan 01 D-3.07). It is sensitive because it is tied to the active
bearer token and identifies a specific action invocation.

To prevent leakage across the g2-app → bridge trust boundary, the `PerfProbe`
hashes the key before constructing any `r1.perf.sample` envelope:

```
idempotencyKeyHash = sha256(idempotencyKey).slice(0, 16)  // first 16 hex chars
```

The `PerfSampleEnvelopeSchema` enforces `idempotencyKeyHash: /^[0-9a-f]{16}$/`
at the schema level, making it structurally impossible for a clear-text key to
appear in an emitted envelope.

The hashed key allows post-hoc correlation of latency samples per action flow
without exposing the original dedup token. Verified by tests PSH-01..PSE-03
and PP-05 in `packages/g2-app/src/__tests__/perf-probe-hash.test.ts`.

---

## See Also

- `.planning/phases/10-polish-field-test-mvp/10-CONTEXT.md` — Phase 10 context (T-10-02, SC-10-01..03)
- `Specs.md §11.5.8.1` — reconnect resilience + latency target canonical reference
- `docs/architecture/INVARIANTS.md` — INV-1..5; note: latency is not formally an INV but
  degrades INV-5 (gesture determinism perception) if p50 exceeds 600ms
- `packages/g2-app/src/engine/perf-probe.ts` — PerfProbe implementation
- `packages/shared-protocol/src/perf-probe.ts` — PerfSampleEnvelopeSchema wire format
