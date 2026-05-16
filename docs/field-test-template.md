# Field-Test Session — Self-Report Template

Structured self-report form for SC-10-01 closure. The GM / operator fills this in once per
hardware test session. Attach the completed form to the session results document
(`docs/field-test-N.md`) along with any raw `r1.perf.sample` envelope dumps.

**Canonical reference:** `10-CONTEXT.md §Area 3` (SC-10-01..03 carry-forwards);
`docs/architecture/INVARIANTS.md §5` (INV-5 Gesture Determinism); ADR-0005 Branch A `human_needed`.

---

## Session metadata

| Field | Value |
|-------|-------|
| Date | _pending_ |
| Session number | _pending_ (1, 2, …) |
| Duration | _pending_ (hours) |
| DM / operator | _pending_ |
| DM consent obtained | _pending_ (yes / no) |
| Players present | _pending_ (count) |
| G2 firmware version | _pending_ |
| R1 firmware version | _pending_ |
| Even Hub SDK version | `@evenrealities/even_hub_sdk@0.0.10` (or _pending_ if updated) |
| Environment | _pending_ (clean / 5 GHz-loaded / 2.4 GHz+microwave — see Specs.md §10.0.3) |
| Network topology | _pending_ (homelab LAN / Cloudflare Tunnel / other) |

---

## NASA-TLX (Hart & Staveland 1988)

Rate each dimension on the **21-point scale** (0–100 in 5-point increments: Very Low = 0, Very High = 100).
For **Performance**, the scale is reversed: Very Good = 0, Failure = 100.

| Dimension | Score (0–100, 5-pt steps) | Notes |
|-----------|--------------------------|-------|
| **Mental Demand** — How much mental and perceptual activity was required? | _pending_ | |
| **Physical Demand** — How much physical activity was required? | _pending_ | |
| **Temporal Demand** — How much time pressure was felt? | _pending_ | |
| **Performance** *(reverse-scored)* — How successful were you in accomplishing the task? (0 = perfect, 100 = failure) | _pending_ | |
| **Effort** — How hard did you have to work to attain your level of performance? | _pending_ | |
| **Frustration** — How insecure, discouraged, irritated, stressed, or annoyed were you? | _pending_ | |
| **Weighted TLX total** | _pending_ (calculate via pairwise comparison weights or unweighted average) | |

> **Reference:** Hart, S.G. and Staveland, L.E. (1988) "Development of NASA-TLX (Task Load Index):
> Results of empirical and theoretical research." *Human Mental Workload*, pp.139–183.

---

## Borg CR-10 eye-fatigue

Rate **eye fatigue / visual discomfort** on the Borg Category-Ratio 10 scale.

| Scale | Anchor |
|-------|--------|
| 0 | Nothing at all |
| 0.5 | Extremely weak |
| 1 | Very weak |
| 2 | Weak |
| 3 | Moderate |
| 4 | Somewhat strong |
| 5 | Strong |
| 6 | |
| 7 | Very strong |
| 8 | |
| 9 | |
| 10 | Extremely strong / Maximum |

| Measurement point | CR-10 score | Notes |
|-------------------|------------|-------|
| After 30 min wearing G2 | _pending_ | |
| After 60 min wearing G2 | _pending_ | |
| End of session | _pending_ | |

---

## Incidents

List any notable events during the session. Add rows as needed.

| # | Time (approx.) | Type | Description | Resolution |
|---|---------------|------|-------------|------------|
| — | — | — | _no incidents_ | — |

**Incident types to log specifically:**

- [ ] `SYNC LOST` events — count: _pending_, average recovery time: _pending_ s
- [ ] RF degrade events (RSSI drop below threshold) — count: _pending_
- [ ] Microwave / 2.4 GHz interference test (SC-10-03) — fired: yes / no / not tested
- [ ] R1 disconnects — count: _pending_
- [ ] MidiQOL stalls / timeout — count: _pending_
- [ ] Foundry crash / restart — count: _pending_

---

## Latency observations

Reference `docs/perf/phase-10-latency.md` for the measurement table format.

Attach raw `r1.perf.sample` envelope dumps captured via `?probe=true` URL param during the
session. The perf-probe module (Plan 10-02) emits one envelope per R1 action with 5 timestamp
stations: `gesture_emit → bridge_post → handler_invoke → result_envelope → toast_queued`.

| Metric | Value | Target |
|--------|-------|--------|
| End-to-end latency p50 | _pending_ ms | ≤ 400 ms (SC-10-02) |
| End-to-end latency p95 | _pending_ ms | — |
| End-to-end latency p99 | _pending_ ms | — |
| `bridge_post` → `result_envelope` p50 | _pending_ ms | — |
| Frame rate observed (approx.) | _pending_ fps | 5–15 fps target |

---

## SC-10-01 / SC-10-02 / SC-10-03 closure checkboxes

These checkboxes correspond to the **ADR-0005 Branch A `human_needed`** carry-forwards from Phase 10.
Mark complete once the criterion is verified on real hardware.

- [ ] **SC-10-01** — Multi-session field test (≥2 D&D sessions) completed. NASA-TLX self-report
      filed for each session. Consenting DM present. Results documented in `docs/field-test-N.md`.
- [ ] **SC-10-02** — End-to-end latency p50 ≤ 400 ms measured via perf-probe on real R1 + G2 + Foundry
      homelab setup. Raw `r1.perf.sample` envelopes attached.
- [ ] **SC-10-03** — Microwave / 2.4 GHz RF worst-case test performed in-session. Graceful degrade to
      glyph mode (INV-1 compliant) fires without session-state loss. No hung gestures or silent drops.

---

## See also

- `docs/architecture/INVARIANTS.md §5` — INV-5 Gesture Determinism (zero-handler no-op telemetry).
- `10-CONTEXT.md §Area 3` — SC-10-01..03 specification and context.
- ADR-0005 `docs/architecture/0005-phase0-go-no-go.md` — Branch A `human_needed` gate pattern.
- `docs/perf/phase-10-latency.md` — latency measurement template (hardware-pending scaffold).
- `Specs.md §10.0.3` — Phase 0 RF / BLE bandwidth GO/NO-GO criteria.
