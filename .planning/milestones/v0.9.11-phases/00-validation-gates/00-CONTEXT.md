# Phase 0: Validation Gates - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 0 trasforma 7 ipotesi hardware/SDK in **binary GO/NO-GO + metriche misurate**, producendo:
- **ADR-0005** (canonical output): documenta Branch A/B/C decision per raster vs glyph default per Phase 4
- **ADR-0006** (conditional output): conferma raster pipeline lib stack se Branch ∈ {A, B}, oppure dichiara raster deferred se Branch = C
- **docs/perf/phase-0/** raw measurement evidence (JSON + CSV + palette calibration captures), versionata in git
- **tests/phase-0/** validation harness scripts (TS/tsx/Zod, future-promotable a `packages/validation-harness/`)

Niente codice applicativo. Phase 0 è pura **validation + decision engineering**. È il gate gating per Phase 1+ (con sequencing parziale-parallelo: solo ADR-0006 è hard-gated; il resto di Phase 1 può procedere in parallelo).

I 7 test (locked dai documenti precedenti, non re-discussi):
1. R1 gesture timing windows (Specs §10.0.1)
2. `updateImageRawData` byte format probe + palette calibration (Specs §10.0.2 + pitfall 15)
3. BLE bandwidth multi-environment (Specs §10.0.3 + pitfall 2): clean / 5GHz-loaded / 2.4GHz+microwave
4. DLE 30-min sustained throughput (Specs §10.0.7 + pitfall 10)
5. Queue depth → behavior table {1,2,3,≥4} (Specs §10.0.8 + pitfall 12)
6. Palette calibration sub-step (luminance ramp + perceptual derivation, pitfall 15)
7. MidiQOL `autoFastForward` config probe (research Vector B → MIDIQ-01)

</domain>

<decisions>
## Implementation Decisions

### Hardware Access & Sequencing

- **D-01 [HW Access Strategy] `[informational]`:** **Apply now + parallel scaffold.** Sottometti richiesta Even Hub developer immediatamente. In parallelo (mentre attendi grant 1-2 settimane) prepara test harness scripts, ADR-0005 template, threshold tables, e protocolli di misurazione documentati. Quando l'accesso arriva, esecuzione test in giorni non settimane.
  - *`[informational]` rationale:* operational/external (researcher action, non-task-trackable). Influenza WAVE structure (Wave 1B gated on access milestone) ma non si traduce in task eseguibile da agent.
- **D-02 [Phase 0 ↔ Phase 1 Sequencing] `[informational]`:** **Partial parallel.** Phase 1 monorepo skeleton + Biome + TypeScript strict + Vitest + ADR-0001/0002/0003/0004/0008 placeholders possono lanciare in parallelo a Phase 0 hardware tests. **Solo ADR-0006** (raster pipeline lib stack commitment) è hard-gated su Phase 0 risultati BLE/queue. Massimizza throughput senza rework risk.
  - *`[informational]` rationale:* cross-phase orchestration policy, materialized in ROADMAP `Depends on:` field (Phase 1 = "Phase 0 ADR-0005"). Nessuna task Phase 0 lo implementa direttamente.
- **D-03 [Fallback se accesso ritardato >2 settimane] `[informational]`:** **Pivot to non-hardware work.** Procedi con: MidiQOL probe (testabile su Foundry locale, no G2 needed), Branch A/B/C threshold definition upfront, Phase 1 monorepo + 5 ADR. Quando accesso arriva, esegui solo i test BLE/queue/R1 hardware-bound. Riduce idle time.
  - *`[informational]` rationale:* contingency policy. Materialized as Wave 1A (software-only) being un-gated; Wave 1B + Plan 04 hardware-bound. Plan structure honors it; nessuna task lo "implementa".
- **D-04 [Definizione "Phase 0 done"]:** **ADR-0005 + 4 critical pass.** Phase 0 è "done enough" per unblock Phase 1+ quando ADR-0005 documenta Branch A/B/C (anche se il branch è C "glyph-only") AND 4 test critical pass binary: BLE multi-env, queue depth, format probe, R1 timing. **DLE 30-min, palette calibration, MidiQOL probe** sono importanti ma non-blocking per Phase 1 unlock; loro completamento gate-a Phase 4 entry / Phase 7 entry rispettivamente. P2 row Specs §10.0.10 (MidiQOL `completeActivityUse` signature) può slittare a Phase 7 entry gate.

### Test Execution Format

- **D-05 [Test Scripts Home]:** **`tests/phase-0/`** standalone (outside `packages/`, NON tocca pnpm-workspace). Scripts vivono indipendenti dal monorepo skeleton di Phase 1. Quando Phase 1 lands, **promote a `packages/validation-harness/`** (vedi D-11) per re-validation futura.
- **D-06 [Runtime/Linguaggio]:** **TypeScript via tsx + Zod.** TS strict + tsx@4.21.0 per esecuzione zero-build (matches Phase 1 stack lock). Zod 4.4.3 per schema validation degli output JSON. Setup minimo (~5 min): `pnpm init -y && pnpm add -D typescript tsx zod @types/node`.
- **D-07 [Output Capture]:** **Auto-emit JSON + CSV** in `docs/perf/phase-0/{test-id}-{timestamp}.json`. Script produce stdout human-readable + side effect: scrive file con schema versionato (Zod-validated). Committed in git. ADR-0005 cita questi files come evidence (INV-2 traceability).
- **D-08 [File Organization]:** **1-file-per-Specs-section** mapping diretto a Specs.md:
  - `tests/phase-0/10-0-1-r1-timing.ts`
  - `tests/phase-0/10-0-2-image-format.ts`
  - `tests/phase-0/10-0-3-ble-multi-env.ts`
  - `tests/phase-0/10-0-7-dle-sustained.ts`
  - `tests/phase-0/10-0-8-queue-depth.ts`
  - `tests/phase-0/10-0-9-palette-calibration.ts`
  - `tests/phase-0/midiqol-config-probe.ts`

### Branch A/B/C Threshold Criteria (locked UPFRONT for INV-2 rigor)

- **D-09 [BLE Bandwidth Thresholds]:** **Multi-percentile envelope** (più rigoroso di single-p50):
  - **Branch A (raster default):** p50 ≥200 kbps **AND** p95 ≥150 kbps **AND** p99 ≥100 kbps, sustained 30-min, in **tutti e 3** gli ambienti (clean / 5GHz-loaded / 2.4GHz+microwave)
  - **Branch B (raster opt-in, glyph default):** p99 ≥100 kbps **OR** p50 ≥150 kbps in almeno 2 ambienti
  - **Branch C (glyph-only, raster deferred Phase 13):** p99 <100 kbps in **qualsiasi** dei 3 ambienti
- **D-10 [Queue Depth Thresholds]:** **Strict tier mapping** (Specs §10.0.8 table {1,2,3,≥4}):
  - **Branch A:** queue ≤2 sustained
  - **Branch B:** queue 3 occasional → adaptive fps Layer 6 attivo + warning chip in Status HUD footer
  - **Branch C:** queue ≥4 → automatic degrade
- **D-11 [fps Thresholds]:** **5 fps Branch A floor** (Specs committed):
  - Branch A REQUIRES ≥5 fps sustained
  - Branch B accepts 3-5 fps con visibile "low-fps" chip
  - Branch C glyph-only N/A (text refresh on event, no fps target)
  - **15 fps stretch target = separate gate**, unlocks solo se DLE 30-min sustained passa (Specs §10.0.7)
- **D-12 [Borderline Decision Authority]:** **Strict numeric, no discretion.** Esempio: p99=98 kbps < 100 cutoff → Branch B automatic. ADR-0005 documenta protocol: borderline measurements (entro ±5% di un cutoff) triggano automatic safe-downgrade. Zero researcher discretion, INV-2 verifiable e ripetibile.

### Output Artifact Organization

- **D-13 [ADR-0005 Structure]:** **Composite** (ADR + companion files):
  - `docs/architecture/0005-phase0-go-no-go.md` — decision rationale (~150-300 righe): Branch chosen + threshold table + verdict per test + cross-refs a evidence
  - `docs/perf/phase-0/*.json` — raw measurements machine-readable
  - `docs/perf/phase-0/calibration/*.png` — palette calibration photos (G2 phosphor luminance ramp captures)
  - ADR cita companion files per evidence
- **D-14 [ADR-0006 Timing]:** **Phase 0 conditional**:
  - Se Branch A o B → ADR-0006 scritto in Phase 0 chiusura, conferma `image-q@4.0.0` + `upng-js@2.1.0` + `xxhash-wasm@1.1.0` + nota drift signal (image-q npm-vs-git mismatch da pin-by-hash in `pnpm-lock.yaml`)
  - Se Branch C → ADR-0006 dichiara "raster pipeline deferred to Phase 13 stretch" + library decision moot
  - In entrambi i casi: ADR-0006 esiste come decision document chiuso a fine Phase 0
- **D-15 [Validation Harness Promotion]:** **Promote to `packages/validation-harness/`** durante Phase 1 fold-in. `tests/phase-0/*.ts` → `packages/validation-harness/{src,tests}/` convertibile a Vitest suite. Future re-validation (G2 firmware OTA, new hardware models, simulator updates) re-runnable con singolo comando. Pattern Doom-on-exotic-device: harness has compound interest.
- **D-16 [Learnings Capitalization]:** **ADR cross-refs + Phase entry gate docs.** Ogni Phase downstream (4a, 6, 7) ha "entry gate" in ROADMAP che cita ADR-0005 measurements come precondition. Esempio Phase 4a entry gate: *"Branch A/B per ADR-0005 §3 + raster scheduler config from `docs/perf/phase-0/10-0-8-queue-depth.json` §2"*. Decisioni Phase 0 informano automaticamente downstream design senza copy-paste drift.

### Claude's Discretion

Nessuna area marcata "you decide" — tutte le 16 decisioni sono esplicite. Aree dove il planner GSD ha flessibilità implementativa:
- Esatto schema Zod per output JSON (D-07) — purché versioned (`schema_version: 1`) e Zod-validated
- Esatta struttura interna ADR-0005 sections (D-13) — purché composite + cita companion files
- Esatta procedura per submission Even Hub developer access (D-01) — il dev sceglie canale (form web vs email vs Discord)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Specs.md (canonical SoT — drift policy: Specs.md wins per INV-3)
- `Specs.md §10.0` — Phase 0 validation protocol (master)
- `Specs.md §10.0.1` — R1 gesture timing windows test
- `Specs.md §10.0.2` — `updateImageRawData` byte format probe + palette calibration sub-step
- `Specs.md §10.0.3` — BLE bandwidth multi-env protocol (research-extended)
- `Specs.md §10.0.5` — Branch A/B/C decision tree
- `Specs.md §10.0.7` — DLE 30-min sustained throughput
- `Specs.md §10.0.8` — Queue depth → behavior table
- `Specs.md §10.0.10` — P2 gates triage list (incl. MidiQOL `completeActivityUse` signature row)
- `Specs.md §11.5.7` — Raster pipeline lib stack (drives ADR-0006 content)
- `Specs.md §11.5.8.2` — Branch C glyph-only fallback architecture
- `Specs.md §12.B` — Open questions q.11-12 (MidiQOL signature) + q.15 (Extra Attack route)
- `Specs.md §0.1` — INV-1, INV-2, INV-3, INV-4 (binding rules; INV-2 specifically requires multi-source verification)

### Project Planning
- `.planning/PROJECT.md` — project context + Key Decisions table
- `.planning/REQUIREMENTS.md` — REQ-IDs (MIDIQ-01 lands at Phase 0; FOUN-/MAP-/DISP-/etc. downstream)
- `.planning/ROADMAP.md` §Phase 0 — success criteria 1-5
- `.planning/STATE.md` — current position + 3 blockers (Even Hub access, Branch decision gate, Phase 7 open questions)

### Research (input to threshold definitions and pitfall mitigation)
- `.planning/research/SUMMARY.md` — esp. "Gaps to Address (Phase-0-blocking only)" section (7 items)
- `.planning/research/PITFALLS.md` — esp. pitfalls 2 (BLE multi-env), 5 (gesture determinism → INV-5 Phase 6), 7 (Even SDK SemVer / firmware compat matrix), 10 (DLE 30s vs 30min), 12 (queue depth full table), 15 (sRGB-vs-linear dither + perceptual palette)
- `.planning/research/STACK.md` — pinned versions (image-q@4.0.0, upng-js@2.1.0, xxhash-wasm@1.1.0, MCP SDK 1.29.0, etc.)
- `.planning/research/ARCHITECTURE.md` — 5-tier 3-hop deployment (informs test environment setup)
- `.planning/research/FEATURES.md` — adversarial gaps (Vector B → MIDIQ-01)

### CLAUDE.md (project memory)
- `CLAUDE.md` §Project Invariants — INV-1/2/3/4 enforcement rules
- `CLAUDE.md` §Pre-bump checklist — manual checklist that becomes CI gate post-Phase 1

### To Be Created (Phase 0 outputs — do NOT exist yet)
- `docs/architecture/0005-phase0-go-no-go.md` — Branch A/B/C decision document (D-13)
- `docs/architecture/0006-raster-pipeline-library-stack.md` — conditional on Branch (D-14)
- `docs/perf/phase-0/*.json` + `docs/perf/phase-0/*.csv` — raw measurements (D-07)
- `docs/perf/phase-0/calibration/*.png` — palette calibration G2 phosphor captures (D-13)
- `tests/phase-0/*.ts` — validation harness scripts (D-05, D-06, D-08)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Repository è **design-only**: nessun codice applicativo esiste. Asset riusabili sono **documentari**:
- `Specs.md` v0.9.11 (~4250 righe, 5 round cross-validation): canonical SoT per tutti i 7 test design — re-leggere prima di scrivere ogni test script
- `README.md` + `docs/showcase/index.html`: proiezioni di Specs.md, mantenute coerenti per INV-3 (verifica al commit Phase 0 chiusura)
- `.planning/research/PITFALLS.md` 17 pitfalls catalogati con mitigation: input diretto a test design (es. pitfall 2 → BLE multi-env protocol; pitfall 15 → palette calibration methodology)

### Established Patterns

- **INV-2 Online cross-validation**: ogni claim tecnico cita canonical upstream source (≥4 parallel WebFetch su domini indipendenti). Phase 0 test results devono seguire stesso rigor: misurazione cross-checked, non one-shot.
- **Triple-doc coherence (INV-3)**: `Specs.md` + `README.md` + `docs/showcase/index.html` aggiornano *nello stesso commit* per cambi cross-cutting. Phase 0 chiusura richiede update di tutti e 3 (badge versione, hardware bullets se shifted, eventuali nuovi ADR riferiti).
- **Pre-bump checklist (CLAUDE.md)**: checklist manuale di 6 step prima di bump versione Specs. Diventa CI gate post-Phase 1.

### Integration Points

Phase 0 si interfaccia con:
- **Even Hub developer portal** (esterno, gating): submission, attesa grant, accesso a `updateImageRawData` API + simulator + R1 SDK docs. Probabile rate limit / approval workflow Even-side.
- **Foundry VTT + dnd5e** (locale, per MidiQOL probe): Foundry v13.347+ con dnd5e 5.3.3+ + MidiQOL latest installato. Probe verifica `autoFastForward` config setting via Foundry settings API.
- **Hardware fisico** (G2 + R1 + phone con Even Realities App): per BLE/queue/format/timing/palette tests. Phone WebView è dove plugin gira (Specs §3.7).
- **3 RF environments fisici** (clean / 5GHz-loaded / 2.4GHz+microwave): richiede setup di test environment con WiFi configurabile + microonde + altri dispositivi 2.4GHz controllabili.

</code_context>

<specifics>
## Specific Ideas

- **Threshold rigor philosophy**: tutte le decisioni di soglia (D-09, D-10, D-11, D-12) ratificano un pattern: "definire criteri pass/fail UPFRONT, prima di misurare". Questo previene confirmation bias post-hoc dove "il numero che ho è OK quindi Branch A". Rigorous + INV-2 friendly + ripetibile.
- **Multi-percentile envelope** (D-09) è più severo di Specs literal (single-p50). Catturare la coda lunga (p99) è ESSENZIALE per real-world environments con microwave bursts e Zigbee chatter (pitfall 2).
- **ADR cross-refs as Phase entry gates** (D-16) è il pattern che evita "phase 0 work disappears into the void". Ogni downstream phase deve esplicitamente citare quali Phase 0 measurements informano le sue decisioni di design.
- **Validation harness as compound interest** (D-15): pattern Doom-on-exotic-device dove ogni nuova firmware Even o nuovo modello G2 in futuro ri-userà gli stessi test. Investire in harness riusabile ora paga interesse composto.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Tutte le 4 aree discussa erano implementation details di Phase 0; nessuna scope creep verso altre fasi.

Aree non discusse esplicitamente ma menzionate come available per future iteration:
- Palette calibration methodology dettagliata (camera vs photometer, ΔE metric, iteration limit) — risolvibile durante esecuzione test §10.0.9
- R1 timing measurement protocol esatto (n samples, percentile target, distinguibility statistic) — risolvibile in test script §10.0.1
- MidiQOL probe surface (UI toast vs log entry vs hard error) — risolvibile in Phase 2 module.json relationship + boot sequence design
- Even Hub access escalation path se silenzio oltre 2 settimane (community Discord, vendor outreach formale) — operational, fuori scope discussione tecnica

</deferred>

---

*Phase: 0-Validation Gates*
*Context gathered: 2026-05-10*
