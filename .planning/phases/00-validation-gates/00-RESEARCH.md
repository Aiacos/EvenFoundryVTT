# Phase 0: Validation Gates - Research

**Researched:** 2026-05-10
**Domain:** Hardware/SDK validation engineering — produrre ADR-0005 (Branch A/B/C raster vs glyph) + ADR-0006 (raster lib stack confirmation conditional) + raw measurement evidence. NO codice applicativo.
**Confidence:** HIGH overall (CONTEXT.md decisions e Specs.md §10.0 fissano ~80% del territorio; research verifica HOW per ogni test). MEDIUM su Even Hub access ops e R1 SDK byte format (non documentato pubblicamente). LOW su tooling specifico per BLE measurement su iOS WebView.

## Summary

Phase 0 è puro **decision engineering + measurement infrastructure**: 7 test designati upfront, soglie pre-committed in CONTEXT.md (D-09/D-10/D-11/D-12 = strict numeric, no discretion), formato output fissato (D-05/D-06/D-07/D-08 = `tests/phase-0/*.ts` via tsx + Zod, JSON+CSV in `docs/perf/phase-0/`). La research si concentra su **come eseguire bene** ciascun test, non su "quale test fare".

I 7 test si dividono in due cluster operativi:

1. **Hardware-bound (richiedono Even Hub developer access + G2/R1 fisici)**: §10.0.1 R1 timing · §10.0.2 image format probe · §10.0.3 BLE multi-env · §10.0.7 DLE 30-min · §10.0.8 queue depth · §10.0.9 palette calibration. Per CONTEXT.md D-01 si applica per access *ora* + scaffold parallelo; D-03 fallback è pivot a non-hardware work se attesa supera 2 settimane.
2. **Software-only (eseguibile oggi su Foundry locale)**: probe MidiQOL `autoFastForward` setting (REQ MIDIQ-01). Richiede solo Foundry v13.347+ + dnd5e 5.3.3+ + MidiQOL v11+ installato in test world.

**Primary recommendation:** Costruisci il test harness `tests/phase-0/` (TS+tsx+Zod, ~4 ore di setup) **immediatamente** per derisk il path operativo. In parallelo, sottometti la Even Hub Early Developer Program application via il sign-up form ufficiale (canale primario, vedi §3.1) e iscriviti al Discord pilot community (canale secondario per outreach). Il MidiQOL probe — l'unico test software-only — può chiudere REQ MIDIQ-01 entro la fine della prima settimana, indipendentemente dall'accesso hardware. Ogni test produce output Zod-validated in `docs/perf/phase-0/{test-id}-{ISO8601}.json` + `.csv`, che ADR-0005 cita come evidence per audit INV-2.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hardware Access & Sequencing**
- **D-01 [HW Access Strategy]:** **Apply now + parallel scaffold.** Sottometti richiesta Even Hub developer immediatamente. In parallelo (mentre attendi grant 1-2 settimane) prepara test harness scripts, ADR-0005 template, threshold tables, e protocolli di misurazione documentati. Quando l'accesso arriva, esecuzione test in giorni non settimane.
- **D-02 [Phase 0 ↔ Phase 1 Sequencing]:** **Partial parallel.** Phase 1 monorepo skeleton + Biome + TypeScript strict + Vitest + ADR-0001/0002/0003/0004/0008 placeholders possono lanciare in parallelo a Phase 0 hardware tests. **Solo ADR-0006** (raster pipeline lib stack commitment) è hard-gated su Phase 0 risultati BLE/queue. Massimizza throughput senza rework risk.
- **D-03 [Fallback se accesso ritardato >2 settimane]:** **Pivot to non-hardware work.** Procedi con: MidiQOL probe (testabile su Foundry locale, no G2 needed), Branch A/B/C threshold definition upfront, Phase 1 monorepo + 5 ADR. Quando accesso arriva, esegui solo i test BLE/queue/R1 hardware-bound. Riduce idle time.
- **D-04 [Definizione "Phase 0 done"]:** **ADR-0005 + 4 critical pass.** Phase 0 è "done enough" per unblock Phase 1+ quando ADR-0005 documenta Branch A/B/C (anche se il branch è C "glyph-only") AND 4 test critical pass binary: BLE multi-env, queue depth, format probe, R1 timing. **DLE 30-min, palette calibration, MidiQOL probe** sono importanti ma non-blocking per Phase 1 unlock; loro completamento gate-a Phase 4 entry / Phase 7 entry rispettivamente. P2 row Specs §10.0.10 (MidiQOL `completeActivityUse` signature) può slittare a Phase 7 entry gate.

**Test Execution Format**
- **D-05 [Test Scripts Home]:** **`tests/phase-0/`** standalone (outside `packages/`, NON tocca pnpm-workspace). Scripts vivono indipendenti dal monorepo skeleton di Phase 1. Quando Phase 1 lands, **promote a `packages/validation-harness/`** (vedi D-15) per re-validation futura.
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

**Branch A/B/C Threshold Criteria (locked UPFRONT for INV-2 rigor)**
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

**Output Artifact Organization**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Tutte le 4 aree discussa erano implementation details di Phase 0; nessuna scope creep verso altre fasi.

Aree non discusse esplicitamente ma menzionate come available per future iteration:
- Palette calibration methodology dettagliata (camera vs photometer, ΔE metric, iteration limit) — risolvibile durante esecuzione test §10.0.9
- R1 timing measurement protocol esatto (n samples, percentile target, distinguibility statistic) — risolvibile in test script §10.0.1
- MidiQOL probe surface (UI toast vs log entry vs hard error) — risolvibile in Phase 2 module.json relationship + boot sequence design
- Even Hub access escalation path se silenzio oltre 2 settimane (community Discord, vendor outreach formale) — operational, fuori scope discussione tecnica

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| **MIDIQ-01** | MidiQOL config check al boot — verificare `autoFastForward` mode attivo. Senza, manual write stalla su chat-card buttons. Declare MidiQOL **required** in `module.json` `relationships.requires`. | §6 (MidiQOL probe protocol) — exact setting keys identified (`AutoFastForwardAbilityRolls`, `autoRollAttack`, `autoRollDamage`, `autoFastForwardRolls` multi-select, `autoCompleteWorkflow`); access pattern via `game.settings.get("midi-qol", "<key>")` after `'ready'` hook; output capture pattern to JSON evidence file. Test script `tests/phase-0/midiqol-config-probe.ts` runs locally on Foundry test world (no G2 hardware needed). Probe ships in module.json `relationships.requires` declaration at Phase 2; remediation toast UX deferred to Phase 4b adversarial UI work (BOOT-01). |

## Standard Stack

### Core (test harness — `tests/phase-0/`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.8.5 | Type-safe test scripts | Matches Phase 1 stack lock (STACK.md §1.1); strict mode on; zero drift between Phase 0 harness e future `packages/validation-harness/` (D-15) |
| tsx | 4.21.0 | TS execution runtime | Zero-build dev loop (`tsx tests/phase-0/foo.ts`); matches Phase 1 dev tooling; lighter than `tsup` for one-shot scripts |
| zod | 4.4.3 | Output schema validation | CONTEXT.md D-06 explicit; same Zod the bridge + foundry-mcp use → schemas eventually shared via `packages/shared-protocol/` post-Phase 1 (D-15) |
| @types/node | 25.6.2 | Node API types | Required for TS strict + filesystem write (`fs/promises`) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Even Hub SDK (`@evenrealities/even_hub_sdk`) | latest from npm post-grant | `bridge.*` API surface (createTextContainer, updateImageRawData, audio, R1 events) | Loaded inside the WebView plugin host; not consumed by `tests/phase-0/` harness directly (the harness drives the plugin via the simulator or via a thin loader page). Once developer access is granted, pin the version in the harness. |
| Even Hub Simulator (BxNxM/even-dev) | latest from `github.com/BxNxM/even-dev` (MIT) | Local plugin run target — multi-app test environment | Use for §10.0.1 R1 timing (event capture validation) and §10.0.2 byte format probe iteration **before** burning real-device time. Limitations: simulator may not perfectly model BLE bandwidth or real G2 phosphor (use real device for §10.0.3, §10.0.7, §10.0.8, §10.0.9). Open source, no developer access required to clone & run. |
| `csv-stringify` | latest stable | JSON → CSV conversion for D-07 output | Per D-07: each test emits both JSON (machine-readable, Zod-validated) AND CSV (Excel/spreadsheet-friendly for ad-hoc analysis). `csv-stringify` is `csv` family, no native deps, ESM-friendly. Alternative: hand-roll CSV in 10 LOC (no library), acceptable since test output structure is uniform. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsx | ts-node | Deprecated for new projects (STACK.md §1.6); tsx is the modern default. Skip. |
| tsx | Vitest as runner | Vitest 4.1.5 is the eventual home (D-15 promotion to `packages/validation-harness/`); but Phase 0 wants **standalone scripts** with stdout output for quick interactive runs, not a test-runner UX. Promote to Vitest in Phase 1. |
| Zod | @sinclair/typebox / valibot | Zod is the project-wide schema lib (STACK.md §1.2/1.4/1.5); single source of truth across packages. No reason to use anything else. |
| Even Hub Simulator | Direct real-device only | Simulator iterates faster (no BLE pairing per change); use for `tests/phase-0/10-0-1-r1-timing.ts` and `tests/phase-0/10-0-2-image-format.ts` Format-A/B/C iteration. Real device gates the GO/NO-GO. |

**Installation:**
```bash
mkdir -p tests/phase-0 docs/perf/phase-0/calibration
cd tests/phase-0
pnpm init -y
pnpm add -D typescript@5.8.5 tsx@4.21.0 zod@4.4.3 @types/node@25.6.2 csv-stringify
# Mirror Phase 1 tsconfig (strict, ESM, moduleResolution: bundler)
echo '{"extends":"../../tsconfig.base.json","compilerOptions":{"outDir":"dist"}}' > tsconfig.json
```

**Version verification (run before locking the harness):**
```bash
npm view typescript@5.8.5 version    # confirm 5.8.5 still on registry
npm view tsx@4.21.0 version          # confirm 4.21.0 still on registry
npm view zod@4.4.3 version           # confirm 4.4.3 still on registry
npm view csv-stringify version       # capture latest stable
```

Document the verified versions in `tests/phase-0/README.md` with the verification date. STACK.md verified all four on 2026-05-10 (HIGH confidence); re-verify before harness commit.

## Architecture Patterns

### Recommended Project Structure

```
tests/phase-0/                              # D-05 standalone home (NOT in pnpm-workspace yet)
├── README.md                               # how to run, prereqs, version pins
├── package.json                            # tsx + zod + typescript + csv-stringify
├── tsconfig.json                           # extends ../../tsconfig.base.json post-Phase-1
├── _shared/                                # cross-test utilities (gets promoted with the rest)
│   ├── output.ts                           # writeJsonEvidence(), writeCsvEvidence(), filename helper
│   ├── schemas.ts                          # Zod schemas for each test's output (versioned schema_version:1)
│   ├── stats.ts                            # percentile() (p50/p95/p99 for §10.0.3, §10.0.7), CI bounds
│   └── hub.ts                              # thin Even Hub SDK loader/wrapper (post-grant)
├── 10-0-1-r1-timing.ts                     # R1 gesture window measurement (Specs §10.0.1)
├── 10-0-2-image-format.ts                  # updateImageRawData byte format probe (Specs §10.0.2 + Pitfall 7)
├── 10-0-3-ble-multi-env.ts                 # BLE bandwidth multi-environment (Specs §10.0.3 + Pitfall 2)
├── 10-0-7-dle-sustained.ts                 # DLE 30-min sustained throughput (Specs §10.0.7 + Pitfall 10)
├── 10-0-8-queue-depth.ts                   # queue depth → behavior table (Specs §10.0.8 + Pitfall 12)
├── 10-0-9-palette-calibration.ts           # luminance-ramp + perceptual derivation (Pitfall 15)
└── midiqol-config-probe.ts                 # MidiQOL autoFastForward config check (REQ MIDIQ-01)

docs/perf/phase-0/                          # D-07 + D-13 evidence home
├── 10-0-1-r1-timing-2026-05-12T14-30-00Z.json
├── 10-0-1-r1-timing-2026-05-12T14-30-00Z.csv
├── 10-0-3-ble-multi-env-clean-...json + .csv
├── 10-0-3-ble-multi-env-5ghz-loaded-...json + .csv
├── 10-0-3-ble-multi-env-2-4ghz-microwave-...json + .csv
├── ...one pair per test execution per environment...
└── calibration/
    ├── ramp-uniform-2026-05-13T10-00-00Z.png       # photo of uniform 16-step ramp on G2
    ├── ramp-perceptual-2026-05-13T11-00-00Z.png    # photo of derived perceptual ramp on G2
    └── ramp-measurement.csv                        # per-step measured luminance + derived L* spacing

docs/architecture/                          # D-13 + D-14 ADR home
├── 0005-phase0-go-no-go.md                 # Branch A/B/C decision + verdict-per-test + evidence cross-refs
└── 0006-raster-pipeline-library-stack.md   # conditional content per D-14 (confirms image-q+upng-js+xxhash-wasm if Branch A/B; defers if Branch C)
```

### Pattern 1: Pre-committed Threshold Table at Top of Each Test

**What:** Every test script's first 30 lines define — as a top-level `const THRESHOLDS = {...}` literal — the exact pass/fail cutoffs from CONTEXT.md D-09/D-10/D-11/D-12. The threshold object is itself Zod-validated and emitted in the JSON output.
**When to use:** All 7 tests. Implements D-12 "strict numeric, no discretion" by making thresholds part of the test contract, not a runtime decision.
**Example:**
```typescript
// Source: synthesized from CONTEXT.md D-09 + D-12 + Specs §10.0.3 + Pitfall 2
import { z } from "zod";
import { writeJsonEvidence, writeCsvEvidence, percentile } from "./_shared/output";

const Thresholds = z.object({
  branch_a: z.object({ p50_min_kbps: z.literal(200), p95_min_kbps: z.literal(150), p99_min_kbps: z.literal(100) }),
  branch_b: z.object({ p99_min_kbps: z.literal(100), p50_min_kbps: z.literal(150), envs_required: z.literal(2) }),
  branch_c_trigger: z.object({ p99_max_kbps: z.literal(100) }),
  borderline_pct: z.literal(5),  // ±5% from cutoff → automatic safe-downgrade
});
const THRESHOLDS = Thresholds.parse({
  branch_a: { p50_min_kbps: 200, p95_min_kbps: 150, p99_min_kbps: 100 },
  branch_b: { p99_min_kbps: 100, p50_min_kbps: 150, envs_required: 2 },
  branch_c_trigger: { p99_max_kbps: 100 },
  borderline_pct: 5,
});

// ... measurement loop populates `samples_kbps: number[]` ...

const result = {
  schema_version: 1 as const,
  test_id: "10-0-3-ble-multi-env",
  env: process.env.RF_ENV ?? "clean",  // "clean" | "5ghz-loaded" | "2-4ghz-microwave"
  duration_sec: 1800,
  thresholds: THRESHOLDS,
  samples_kbps: samplesKbps,            // raw, for re-analysis
  p50: percentile(samplesKbps, 50),
  p95: percentile(samplesKbps, 95),
  p99: percentile(samplesKbps, 99),
  verdict: deriveBranch(samplesKbps, THRESHOLDS),  // "A" | "B" | "C" | "borderline-A→B" | "borderline-B→C"
  timestamp: new Date().toISOString(),
};
await writeJsonEvidence(result);   // → docs/perf/phase-0/10-0-3-ble-multi-env-{env}-{ts}.json
await writeCsvEvidence(result);    // → ...{env}-{ts}.csv
```

### Pattern 2: Versioned Output Schema (`schema_version: 1`)

**What:** Every JSON output has `schema_version: 1` as the first key (Zod-validated). Future re-runs (Phase 1 promotion to Vitest, post-OTA re-validation per D-15 compound interest) compare against the pinned schema version. Schema evolutions bump `schema_version` and ADR-0005 references the bump.
**When to use:** Every test output file. Even the simplest CSV header includes the schema version as a comment column.
**Why:** Makes the harness re-runnable under Phase 1+ tooling without ambiguity about result format. Pattern from `pnpm-lock.yaml`, OpenAPI specs, etc.

### Pattern 3: Capability-Negotiation-Style Skip (when SDK is missing)

**What:** Each test script checks at boot whether the Even Hub SDK + simulator are available. If not, it logs `[SKIP] Even Hub SDK not loaded — run inside the simulator or with a paired G2 device. This script terminates early.` and exits non-zero with a structured "skipped" JSON output. The MidiQOL probe applies the same pattern: `[SKIP] Foundry not running on http://localhost:30000 — start a Foundry test world with MidiQOL installed first.`
**Why:** Per CONTEXT.md D-01 + D-03, the harness must work both before and after developer access lands. A skip-with-reason output is itself evidence (logged in `docs/perf/phase-0/` with `verdict: "skipped", reason: "..."`) — distinguishes "didn't run" from "ran and failed" for ADR-0005.

### Pattern 4: Borderline Auto-Downgrade Helper

**What:** A `_shared/branch-decision.ts` helper takes the threshold object + measurements and returns a `BranchVerdict`:
```typescript
type BranchVerdict =
  | { branch: "A"; rationale: string }
  | { branch: "B"; rationale: string }
  | { branch: "C"; rationale: string }
  | { branch: "borderline-A→B"; rationale: string; cutoff: number; observed: number }
  | { branch: "borderline-B→C"; rationale: string; cutoff: number; observed: number };
```
Any measurement within ±5% of a cutoff returns the `borderline-*→*` verdict (D-12 explicit), and the safe-downgrade direction is hard-coded (always to the more conservative branch). ADR-0005 cites the helper and the rationale.

### Anti-Patterns to Avoid

- **Threshold-after-measurement:** Reading a number, then deciding "200 is close enough to the 200 cutoff" → confirmation bias. CONTEXT.md D-12 explicitly forbids this. Pre-commit thresholds; let the helper decide.
- **One-shot measurement:** Specs §10.0.3 originally said "1 minute" per environment; PITFALLS.md §2 + §10 + CONTEXT.md D-09 require **30-min sustained** in each environment. Don't shortcut to 1 min — long-tail behavior (microwave bursts, mobile OS BLE rescheduling per Pitfall 10) is the entire point.
- **Single-environment BLE test:** Skipping the 2.4 GHz+microwave environment (Pitfall 2 says "sounds silly, isn't") because it's logistically inconvenient. The microwave run is non-optional for INV-2 rigor + downstream Phase 10 field test traceability.
- **Heredoc / `cat << 'EOF'` to write evidence files:** Use `fs/promises.writeFile` + a Zod-validated JS object. Heredoc is for ad-hoc shell ops; structured evidence MUST go through schema validation.
- **Hand-edit JSON evidence after capture:** Tampering invalidates INV-2 traceability. If a measurement is bad, re-run the test (logged separately) and document why in ADR-0005.
- **Mixing test logic with output formatting:** Keep `_shared/output.ts` (write JSON+CSV) separate from per-test measurement logic. Promotion to `packages/validation-harness/` (D-15) becomes drag-and-drop.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BLE bandwidth measurement on iOS WebView | A custom JS measurement loop running on the phone | **In-WebView `performance.now()` deltas around `bridge.updateImageRawData()` calls + correlation with bridge-side `Date.now()` send timestamps** (Specs §10.0.3 procedure: bridge produces 4 KB tiles every 100 ms; G2 plugin logs `t_send_request` on WS receive and `t_apply_complete` after the SDK call). The "tool" is the Even Hub SDK callback + WebSocket frame timestamps. iOS WKWebView does NOT expose raw BLE link-layer metrics (Apple Core Bluetooth abstracts them away — Pitfall 10). **Inferred MTU via RTT canary** (Pitfall 10 mitigation 2: every-2-sec 50-byte keepalive) is the correct shape. No nrf52 sniffer needed for the GO/NO-GO; sniffer would be useful only for forensic deep-dives, which is out of scope for Phase 0. | Apple Core Bluetooth doesn't expose connection-parameter callbacks mid-session (Pitfall 10). Building a "real" BLE link-layer sniffer requires a Nordic nRF52 dev board + Wireshark + significant integration effort. Phase 0's GO/NO-GO needs **application-observable throughput**, which is exactly what the SDK callback timestamps measure — and that's also what production telemetry will see (Pitfall 2 mitigation 2: continuous bandwidth telemeter feeding adaptive fps Layer 6). Same measurement methodology in test and production = no measurement gap. |
| Percentile statistics (p50/p95/p99) | Custom sort + index math (off-by-one prone) | Vanilla `samples.slice().sort((a,b)=>a-b)` + linear interpolation (~10 LOC), or `simple-statistics` npm if you want to be belt-and-suspenders | Percentile math has well-known edge cases (interpolation method R-7 vs R-8 etc.). 10-LOC inline is fine for Phase 0 (single-developer review); promote to `simple-statistics` in `packages/validation-harness/` for shared use. |
| PNG indexed-palette format inspection (§10.0.2) | Hand-decoded byte stream | Pre-built `image-q@4.0.0` + `upng-js@2.1.0` to **generate** the 3 candidate format payloads (Format A: PNG indexed; Format B: raw 4-bit packed big-endian; Format C: raw 4-bit packed little-endian — Specs §10.0.2). The probe sends each, observes which renders correctly. Don't write a custom 4-bit packer; use the same library Phase 4 will ship. | Same library = same bug surface. If the test's custom packer differs from production's `upng-js`, you'll mis-identify the format and Phase 4 will rediscover the bug. |
| MidiQOL settings introspection | Custom REST call to Foundry | **Foundry `game.settings.get("midi-qol", "<key>")`** inside a tiny module loaded into the test world (Section §6 below). Foundry has no public REST endpoint for module settings; the canonical access path is the in-game JS API after the `'ready'` Hook fires. | Foundry settings API is the only sanctioned access path. A custom REST call would require running a separate module to expose it — which is exactly what `evenfoundryvtt` will become at Phase 2. Anticipate that pattern with the probe. |
| Phosphor luminance measurement (§10.0.9 / Pitfall 15) | Custom photometer rig | **Smartphone camera + manual L* derivation** for Phase 0 baseline. Optional precision: $30 i1Display Pro / Spyder X colorimeter if smartphone proves inadequate. The protocol: render uniform 16-step ramp → photograph G2 in dim ambient (controlled exposure) → measure per-step luminance via image-pixel mean → derive perceptually-spaced palette via inverse CIE L* curve. CIEDE2000 is overkill for Phase 0 GO/NO-GO; CIE L* spacing is the right abstraction (Pitfall 15 mitigation 2: "image-q supports custom palette arrays"). Iterate ≤3 rounds (uniform → measured-correction → re-measure for verification). | Photometer-grade calibration is for production color management. Phase 0 needs "are midtones visible enough that downstream raster pipeline doesn't render NPCs as floor?" — a binary GO/NO-GO that smartphone-camera measurement can answer. Defer precision tooling to Phase 4 if Phase 0 result is borderline. |
| R1 gesture timing window measurement | Custom event capture pipeline | **Even Hub Simulator (BxNxM/even-dev) + the SDK's own R1 event callback** (Specs §10.0.1: "Plugin sample che logga ogni evento R1 ricevuto via callback al G2 plugin"). Statistical protocol: n=30 samples per gesture (tap, double-tap, scroll-up, scroll-down, long-press-1s, long-press-2s) per Specs §10.0.1 sequence × 5 sessions = 150 samples per gesture, sufficient for 95% CI on tap-vs-double-tap timing window separation under typical HCI gesture-timing study sample sizes. | The Even SDK already provides timestamped event callbacks. Building a custom capture pipeline would re-implement what the SDK gives free. The HCI literature on touch-gesture timing studies typically uses n ≥ 20 per gesture per participant for distinguishability statistics; n=30 × 5 sessions gives confident envelope. |

**Key insight:** Phase 0 is **measurement infrastructure**, not application code. Every "tool" we'd consider building has either (a) an upstream library that's the canonical shape or (b) a measurement protocol that needs to be application-observable (using the same APIs production will use) — not link-layer-deep. Don't build sniffers, photometer rigs, custom percentile libs, or Foundry REST shims.

## Common Pitfalls

The 6 PITFALLS.md entries that bind Phase 0 directly. All are CONTEXT.md-acknowledged and locked into the test design.

### Pitfall 1: BLE Bandwidth Measured Only in Clean RF (PITFALLS.md §2)

**What goes wrong:** Lab measurement reports 250 kbps sustained; first user reports 5–8 kbps "every now and then for ten seconds." Median 200 kbps but p99 35 kbps — the long tail is the user-perceived experience.
**Why it happens:** D&D sessions don't happen in clean RF environments. 2.4 GHz BLE shares spectrum with WiFi ch 6/11, microwaves, Zigbee, Bluetooth speakers, 4–6 phones doing WhatsApp. AFH helps but doesn't eliminate co-channel WiFi blocking. Hand position (R1 ring on dominant hand attenuating G2 signal) adds variance.
**How to avoid:** CONTEXT.md D-09 already encodes the mitigation: 3 environments × 30-min sustained × multi-percentile envelope (p50 + p95 + p99). Test script `tests/phase-0/10-0-3-ble-multi-env.ts` parameterizes on `RF_ENV` env var; runner executes it 3 times with different `RF_ENV` values. Each run produces a separate JSON evidence file. The Branch A verdict requires ALL 3 environments to pass simultaneously.
**Warning signs:** Single-environment p50 ≥200 kbps but p99 <100 kbps in the microwave run → automatic Branch B per D-09. ADR-0005 must call out which environment downgraded the verdict.

### Pitfall 2: DLE Detected at Connect, Degrades Silently Mid-Session (PITFALLS.md §10)

**What goes wrong:** Specs §10.0.7 originally tested DLE at connect: if MTU ≥244, unlock Layer 5 → 15 fps mode. iOS Core Bluetooth re-arbitrates connection parameters when phone enters low-power mode (battery <20%), backgrounded/foregrounded, or other BLE peripherals connect (smartwatch, AirPods). Renegotiation can drop effective MTU to 23 bytes silently while the application still reports the connect-time MTU. Throughput drops 10×; perceived fps tanks; Layer 6 adaptive fps doesn't know why.
**Why it happens:** iOS in particular doesn't expose a callback for "connection parameters changed mid-session." Re-querying MTU from a WebView is a privileged operation the host may not expose.
**How to avoid:** CONTEXT.md acknowledges via D-09 envelope (the multi-percentile p99 ≥100 kbps catches degradation) + the test design extends Specs §10.0.7 from 30-sec to **30-min sustained** (CONTEXT.md test name `10-0-7-dle-sustained.ts`). Inferred-MTU monitoring via 50-byte heartbeat ping every 2 sec (Pitfall 10 mitigation 2) is the production-time mitigation; Phase 0 measures whether the baseline 30-min run reveals renegotiation events. Capture every observed throughput dip ≥50% relative to first-minute baseline as a separate event in the JSON evidence (`renegotiation_events: [{t_sec, p_drop_pct}]`).
**Warning signs:** Player reports "fps drops after 20 minutes" with no other system change. Tile arrival latency p95 doubling without app-side reason. Phone battery dipped below ~25%.

### Pitfall 3: G2 Firmware Queue Depth Assumption (PITFALLS.md §12)

**What goes wrong:** Specs §10.0.8 has three branches: queue ≥4 (15 fps multi-tile), serialized linear (20 fps cap if 1-tile), drop/crash (4–5 fps cap). **No branch for queue=2 or queue=3** — the most likely real outcome on consumer-grade BLE peripheral firmware. With queue=2, multi-tile delta requires careful scheduling (push 2 tiles, wait for both ack-equivalent, push next 2) — different fps math from both ≥4 and linear=1.
**Why it happens:** Spec lookup tables in Specs §7.4b.6.1.2 assume continuous push. Real firmware queues are bounded at small N. The test in §10.0.8 produces a number; the spec didn't pre-commit to behavior at every value.
**How to avoid:** CONTEXT.md D-10 encodes the mitigation: full queue-depth → behavior table {1, 2, 3, ≥4} pre-committed. Test script measures empirical queue depth via "push 8 test tiles back-to-back, count coalesced/dropped." Result feeds the table directly. Phase 4 raster scheduler (out-of-scope for Phase 0) parameterizes on detected queue depth.
**Warning signs:** Phase 0 reports queue=2; engineer assumes "close enough to 4" and pushes 4-tile bursts; firmware drops every other update silently. Field test fps lower than lab measurement.

### Pitfall 4: sRGB-vs-Linear Floyd-Steinberg Renders Midtones Invisible on Phosphor Green (PITFALLS.md §15)

**What goes wrong:** image-q processes 8-bit sRGB pixel data without linearizing. Floyd-Steinberg error diffusion in sRGB color space pushes midtones (luma 0.4–0.6) darker than perceptually correct because sRGB→linear gamma is non-linear in that region. On the G2's phosphor green display where dark = invisible, midtone tokens (a goblin in normal lighting) render nearly-black, indistinguishable from background dungeon stone.
**Why it happens:** Wikipedia Floyd-Steinberg article verbatim: *"For correct results, all values should be linearized first, rather than operating directly on sRGB values as is common for images stored on computers."* The Foundry canvas is sRGB; image-q operates on whatever color space the input is in. For most use cases this is fine; for monochrome low-bit-depth output where every level matters, the non-linearity is visible.
**How to avoid:** CONTEXT.md D-08 explicit: `tests/phase-0/10-0-9-palette-calibration.ts` runs the calibration sub-step (luminance ramp + perceptual derivation). Protocol: (a) render uniform 0/15, 1/15, …, 15/15 ramp; (b) photograph G2 in controlled dim ambient with smartphone camera (locked exposure); (c) measure per-step pixel luminance from photo (mean of central 50×50 region per step); (d) derive perceptually-spaced palette via inverse CIE L* mapping (`L* = 116·(Y/Yn)^(1/3) − 16` for Y/Yn > 0.008856); (e) re-render with derived palette; (f) re-photograph; (g) verify L* spacing within ±10% of uniform spacing in L* space. Phase 4 raster pipeline implements `pow(srgb/255, 2.2)` linearization before luma + serpentine scan order (image-q v4.0.0 supports it — Pitfall 15 mitigation 3).
**Warning signs:** Field test "the goblin is invisible against the floor." Side-by-side (G2 image vs Foundry canvas) shows midtone tokens missing. Bright tokens (player-character glowing weapon) render fine; mid-luma NPCs disappear.

### Pitfall 5: Even SDK No SemVer + OTA-Updatable Firmware (PITFALLS.md §7)

**What goes wrong:** Even Realities is a young hardware company; G2 firmware is OTA-updatable; the SDK surface (hub.evenrealities.com/docs/guides/device-apis) doesn't commit to SemVer or backward compatibility. A single OTA between launch and field test could invalidate the Phase 0 §10.0.2 byte format finding.
**Why it happens:** Hardware SDK promises require maturity Even Realities hasn't reached yet. Ecosystem precedents (Brilliant Labs Frame, Mentra, Vuzix) are similarly young.
**How to avoid:** Phase 0 contributes the **boot-time format probe** spec (Pitfall 7 mitigation 2): on first connect after app start, send a known test pattern to the image container and self-test that the rendered output matches expected. Bail out to glyph mode automatically if mismatch detected. The probe pattern is the same as `tests/phase-0/10-0-2-image-format.ts` — promote it to `packages/g2-app/` boot sequence at Phase 4. Capability handshake (Specs §5.6.3) extension to log `firmware_version` + `app_host_version` lands at Phase 5; Phase 0 produces the **probe pattern** as evidence (the canonical test pixels for boot-time self-check) in `docs/perf/phase-0/10-0-2-format-probe-pattern.json`.
**Warning signs:** Image render arrives bit-shifted or vertically mirrored — format changed. `bridge.audioControl()` returns undefined — webview API surface changed. Even App update on a user's phone bricks the plugin.

### Pitfall 6: Long-Press Gesture Polysemy (PITFALLS.md §5)

**What goes wrong:** R1 long-press meaning depends on overlay context (main HUD vs Combat vs Sheet). Users press long without checking which overlay is on top, get unexpected menu, hit wrong gesture, trigger unintended action.
**Why it happens:** Single gesture on a 3-input device (tap/scroll/long-press) is overloaded by necessity.
**How to avoid:** Out of scope for Phase 0 measurement (binds Phase 6 INV-5 ratification). BUT Phase 0 §10.0.1 must measure the **timing distinguishability** of tap vs double-tap vs long-press — without a measured separable timing window, INV-5 design is impossible. Specs §10.0.1 GO/NO-GO criteria: tap singolo / tap doppio distinguibili by timing; long-press start/end con duration ≥500 ms. Test script captures n=150 samples per gesture (30 × 5 sessions) and computes (a) mean ± SD per gesture, (b) bimodality test on `tap_vs_double_tap_isi` distribution, (c) recommended firmware-side timing windows that maximize separation. Output: `tap_max_ms`, `double_tap_max_ms`, `long_press_min_ms` — the values Phase 6 ratifies as INV-5 constants.
**Warning signs:** n=150 samples show overlapping tap/double-tap timing distributions → firmware-defined windows insufficient → Phase 6 needs explicit visual feedback chip per INV-5 footer pattern.

## Code Examples

Verified patterns from Specs.md + research. NB: the Even Hub SDK calls below are based on the project's hand-typed `even-hub.d.ts` (Specs §3.1 + §3.5 + §5.6.3); the actual API surface will be confirmed at developer-access grant — be ready to adapt.

### Example 1: Output Schema + Writer (`_shared/output.ts`)

```typescript
// Source: synthesized from CONTEXT.md D-06 + D-07 + D-08; Zod 4.4.3 patterns from STACK.md §1.2
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { stringify } from "csv-stringify/sync";
import path from "node:path";

export const EvidenceMeta = z.object({
  schema_version: z.literal(1),
  test_id: z.enum([
    "10-0-1-r1-timing",
    "10-0-2-image-format",
    "10-0-3-ble-multi-env",
    "10-0-7-dle-sustained",
    "10-0-8-queue-depth",
    "10-0-9-palette-calibration",
    "midiqol-config-probe",
  ]),
  timestamp: z.string().datetime(),
  env: z.string().optional(), // "clean" | "5ghz-loaded" | "2-4ghz-microwave" | undefined
  verdict: z.enum(["A", "B", "C", "borderline-A→B", "borderline-B→C", "skipped", "pass", "fail"]),
  rationale: z.string(),
});

export async function writeJsonEvidence<T extends z.infer<typeof EvidenceMeta>>(payload: T) {
  const dir = path.resolve("docs/perf/phase-0");
  await mkdir(dir, { recursive: true });
  const fname = `${payload.test_id}${payload.env ? `-${payload.env}` : ""}-${payload.timestamp.replace(/[:.]/g, "-")}.json`;
  await writeFile(path.join(dir, fname), JSON.stringify(payload, null, 2), "utf8");
  return path.join(dir, fname);
}

export async function writeCsvEvidence(payload: { samples_kbps?: number[]; [k: string]: unknown }) {
  // CSV is for ad-hoc analysis only; canonical evidence is JSON. Skip CSV if no array data.
  if (!payload.samples_kbps) return null;
  const dir = path.resolve("docs/perf/phase-0");
  const fname = `${payload.test_id}${payload.env ? `-${payload.env}` : ""}-${(payload.timestamp as string).replace(/[:.]/g, "-")}.csv`;
  const rows = (payload.samples_kbps as number[]).map((kbps, i) => ({ sample_idx: i, kbps }));
  await writeFile(path.join(dir, fname), stringify(rows, { header: true }), "utf8");
  return path.join(dir, fname);
}
```

### Example 2: MidiQOL Probe Skeleton (`midiqol-config-probe.ts`)

```typescript
// Source: synthesized from research (§6 below) + Foundry settings API (foundryvtt.wiki/en/development/api/settings)
// MidiQOL setting keys verified via tposney/midi-qol source: AutoFastForwardAbilityRolls (capital A — confirmed
// via WebFetch of src/module/settings.ts), with related per-roll fields: autoRollAttack, autoRollDamage,
// autoFastForwardRolls (multi-select Attack/Damage/Ability/Save/Skill/Tools), autoCompleteWorkflow.
//
// Run pattern: this script is a Foundry MODULE (not a standalone tsx script) loaded into a test world
// alongside MidiQOL. It hooks the 'ready' event and dumps settings to a JSON file via fetch() to a tiny
// localhost write endpoint (or via copy-to-clipboard for manual paste — for a Phase 0 one-off, a
// browser-console paste is acceptable). Promote to a real module-with-localhost-bridge in Phase 1.

import { z } from "zod";

export const MidiQolConfig = z.object({
  schema_version: z.literal(1),
  test_id: z.literal("midiqol-config-probe"),
  timestamp: z.string().datetime(),
  midiqol_version: z.string(),
  settings: z.object({
    AutoFastForwardAbilityRolls: z.boolean(),       // confirmed key, capital A
    autoRollAttack: z.boolean(),                    // forces auto-roll of attack
    autoRollDamage: z.enum(["never", "always", "onHit"]).or(z.string()),
    autoFastForwardRolls: z.array(z.string()),      // multi-select: Attack/Damage/Ability/Save/Skill/Tools
    autoCompleteWorkflow: z.boolean(),              // default true since v13.0.39
    removeButtons: z.string().optional(),           // "None" | "Attack" | "Damage" | "All"
  }),
  verdict: z.enum(["pass", "fail", "skipped"]),
  rationale: z.string(),
  remediation_required: z.array(z.string()),       // human-readable list of settings to flip
});

// In the Foundry module (loaded into test world):
//
// Hooks.once("ready", async () => {
//   if (!game.modules.get("midi-qol")?.active) {
//     emit({ verdict: "skipped", rationale: "MidiQOL not installed/active", ... });
//     return;
//   }
//   const settings = {
//     AutoFastForwardAbilityRolls: game.settings.get("midi-qol", "AutoFastForwardAbilityRolls"),
//     autoRollAttack: game.settings.get("midi-qol", "autoRollAttack"),
//     autoRollDamage: game.settings.get("midi-qol", "autoRollDamage"),
//     autoFastForwardRolls: game.settings.get("midi-qol", "autoFastForwardRolls"),
//     autoCompleteWorkflow: game.settings.get("midi-qol", "autoCompleteWorkflow"),
//   };
//   const required = [];
//   if (!settings.autoRollAttack) required.push("autoRollAttack must be ON");
//   if (settings.autoRollDamage === "never") required.push("autoRollDamage must NOT be 'never'");
//   if (!settings.autoCompleteWorkflow) required.push("autoCompleteWorkflow must be ON");
//   const verdict = required.length === 0 ? "pass" : "fail";
//   emit({ verdict, settings, remediation_required: required, ... });
// });
```

### Example 3: BLE Multi-Env Test Script Skeleton (`10-0-3-ble-multi-env.ts`)

```typescript
// Source: synthesized from CONTEXT.md D-08 + D-09 + Specs §10.0.3 + Pitfall 2 mitigation
// Runs IN the WebView plugin context (loaded via Even Hub Simulator or post-grant against a real G2).
// The "tsx script" entry point is a thin Node loader that wraps the WebView page test runner; in practice
// you'll invoke this by:
//   RF_ENV=clean        node ./tools/run-in-webview.ts ./10-0-3-ble-multi-env.ts
//   RF_ENV=5ghz-loaded  node ./tools/run-in-webview.ts ./10-0-3-ble-multi-env.ts
//   RF_ENV=2-4ghz-microwave node ./tools/run-in-webview.ts ./10-0-3-ble-multi-env.ts
// (The run-in-webview.ts loader is a thin wrapper that opens the simulator/real-device page and routes
// the script's stdout back to the harness for evidence emission.)

import { writeJsonEvidence, writeCsvEvidence } from "./_shared/output";
import { percentile } from "./_shared/stats";
import { z } from "zod";

const RF_ENV = (process.env.RF_ENV ?? "clean") as "clean" | "5ghz-loaded" | "2-4ghz-microwave";
const DURATION_MS = 30 * 60 * 1000; // 30 min sustained per CONTEXT.md D-09 + Pitfall 2 mitigation
const TILE_SIZE_BYTES = 4096;
const TILE_INTERVAL_MS = 100;

const Result = z.object({
  schema_version: z.literal(1),
  test_id: z.literal("10-0-3-ble-multi-env"),
  env: z.enum(["clean", "5ghz-loaded", "2-4ghz-microwave"]),
  duration_sec: z.number(),
  tile_size_bytes: z.number(),
  tile_interval_ms: z.number(),
  samples_kbps: z.array(z.number()),
  p50_kbps: z.number(),
  p95_kbps: z.number(),
  p99_kbps: z.number(),
  renegotiation_events: z.array(z.object({
    t_sec: z.number(),
    p_drop_pct: z.number(),
  })),
  verdict: z.enum(["A", "B", "C", "borderline-A→B", "borderline-B→C"]),
  rationale: z.string(),
  timestamp: z.string().datetime(),
});

// Inside the WebView (plugin host):
//   const samples: number[] = [];
//   let baselineKbps = 0;
//   const renegotiationEvents: Array<{ t_sec: number; p_drop_pct: number }> = [];
//   const t0 = performance.now();
//   while (performance.now() - t0 < DURATION_MS) {
//     const tStart = performance.now();
//     await bridge.updateImageRawData("img-1", testTileBytes);  // Even Hub SDK call
//     const tEnd = performance.now();
//     const kbps = (TILE_SIZE_BYTES * 8) / ((tEnd - tStart) / 1000) / 1000;
//     samples.push(kbps);
//     if (samples.length === 60) baselineKbps = percentile(samples, 50);  // first-min baseline
//     if (baselineKbps && kbps < baselineKbps * 0.5) {
//       renegotiationEvents.push({ t_sec: (tEnd - t0) / 1000, p_drop_pct: 100 - (kbps / baselineKbps) * 100 });
//     }
//     const elapsed = performance.now() - tStart;
//     if (elapsed < TILE_INTERVAL_MS) await sleep(TILE_INTERVAL_MS - elapsed);
//   }
//   const result = Result.parse({ ...computed... });
//   await writeJsonEvidence(result);
//   await writeCsvEvidence(result);
```

### Example 4: Branch Decision Helper (`_shared/branch-decision.ts`)

```typescript
// Source: synthesized from CONTEXT.md D-09 + D-10 + D-11 + D-12 (strict numeric, no discretion)
type Thresholds = {
  branch_a: { p50_min_kbps: number; p95_min_kbps: number; p99_min_kbps: number };
  branch_b: { p99_min_kbps: number; p50_min_kbps: number; envs_required: number };
  branch_c_trigger: { p99_max_kbps: number };
  borderline_pct: number; // ±5% per D-12
};

type EnvResult = { env: string; p50: number; p95: number; p99: number };

export function deriveBranch(envs: EnvResult[], t: Thresholds) {
  // Branch C trigger: p99 < cutoff in ANY env
  if (envs.some(e => e.p99 < t.branch_c_trigger.p99_max_kbps)) {
    const offender = envs.find(e => e.p99 < t.branch_c_trigger.p99_max_kbps)!;
    if (offender.p99 >= t.branch_c_trigger.p99_max_kbps * (1 - t.borderline_pct / 100)) {
      return { branch: "borderline-B→C" as const, rationale: `${offender.env} p99=${offender.p99} within ±${t.borderline_pct}% of cutoff ${t.branch_c_trigger.p99_max_kbps} → safe-downgrade to C`, cutoff: t.branch_c_trigger.p99_max_kbps, observed: offender.p99 };
    }
    return { branch: "C" as const, rationale: `${offender.env} p99=${offender.p99} < ${t.branch_c_trigger.p99_max_kbps} → glyph-only, raster deferred Phase 13` };
  }
  // Branch A: ALL envs pass tight envelope
  const allA = envs.every(e =>
    e.p50 >= t.branch_a.p50_min_kbps && e.p95 >= t.branch_a.p95_min_kbps && e.p99 >= t.branch_a.p99_min_kbps
  );
  if (allA) {
    // Borderline check: any single metric within ±5% of A cutoff?
    const tight = envs.find(e =>
      e.p50 < t.branch_a.p50_min_kbps * (1 + t.borderline_pct / 100) ||
      e.p95 < t.branch_a.p95_min_kbps * (1 + t.borderline_pct / 100) ||
      e.p99 < t.branch_a.p99_min_kbps * (1 + t.borderline_pct / 100)
    );
    if (tight) return { branch: "borderline-A→B" as const, rationale: `${tight.env} within ±${t.borderline_pct}% of A cutoff → safe-downgrade to B`, cutoff: t.branch_a.p50_min_kbps, observed: tight.p50 };
    return { branch: "A" as const, rationale: "all envs pass A envelope (p50≥200 AND p95≥150 AND p99≥100)" };
  }
  // Branch B: p99 ≥100 OR p50 ≥150 in at least 2 envs
  const bEligible = envs.filter(e => e.p99 >= t.branch_b.p99_min_kbps || e.p50 >= t.branch_b.p50_min_kbps);
  if (bEligible.length >= t.branch_b.envs_required) {
    return { branch: "B" as const, rationale: `${bEligible.length}/${envs.length} envs meet B criteria → raster opt-in, glyph default` };
  }
  return { branch: "C" as const, rationale: "neither A envelope nor B criteria met → glyph-only" };
}
```

### Example 5: Image Format Probe (`10-0-2-image-format.ts`)

```typescript
// Source: Specs §10.0.2 — three candidate formats, each rendered, visual verification
// Don't hand-roll the formats: use upng-js (Format A) and inline 4-bit packing helpers (Format B/C)
import UPNG from "upng-js";

// Format A: PNG indexed-palette 4-bit greyscale, ~3-5 KB
function makeFormatA(width: number, height: number): Uint8Array {
  // 16-step uniform greyscale palette (calibration from §10.0.9 will refine)
  const palette = Array.from({ length: 16 }, (_, i) => {
    const v = Math.round((i / 15) * 255);
    return [v, v, v, 255];
  });
  // Test pattern: vertical gradient 0→15 + 8x8 checkerboard overlay
  const indexed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const grad = Math.floor((y / height) * 16);
      const checker = ((x >> 3) ^ (y >> 3)) & 1 ? 15 : 0;
      // Overlay: top half gradient, bottom half checker
      indexed[y * width + x] = y < height / 2 ? grad : checker;
    }
  }
  // upng-js encode with depth: 4
  // Note: UPNG.encodeLL signature accepts indexed pixels + palette
  return new Uint8Array(UPNG.encodeLL([indexed.buffer], width, height, 1, 0, 4));
}

// Format B: Raw bytes packed 4-bit big-endian (10000 bytes for 200x100)
function makeFormatB(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array((width * height) / 2);
  for (let i = 0; i < bytes.length; i++) {
    const x0 = (i * 2) % width;
    const y0 = Math.floor((i * 2) / width);
    const x1 = (i * 2 + 1) % width;
    const y1 = Math.floor((i * 2 + 1) / width);
    const v0 = Math.floor((y0 / height) * 16) & 0xf;
    const v1 = Math.floor((y1 / height) * 16) & 0xf;
    // BIG-ENDIAN: high nibble = first pixel
    bytes[i] = (v0 << 4) | v1;
  }
  return bytes;
}

// Format C: Raw bytes packed 4-bit little-endian (same length, swapped nibble order)
function makeFormatC(width: number, height: number): Uint8Array {
  const bytes = makeFormatB(width, height);
  // Swap nibbles
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = ((bytes[i] & 0xf) << 4) | ((bytes[i] >> 4) & 0xf);
  }
  return bytes;
}

// In the WebView:
//   const probeId = "img-probe";
//   await bridge.createImageContainer({ id: probeId, x: 0, y: 0, w: 200, h: 100 });
//   await bridge.updateImageRawData(probeId, makeFormatA(200, 100)); // wait, photograph
//   await sleep(5000);
//   await bridge.updateImageRawData(probeId, makeFormatB(200, 100));
//   await sleep(5000);
//   await bridge.updateImageRawData(probeId, makeFormatC(200, 100));
//   await sleep(5000);
//   // Then human (researcher) confirms which rendered correctly via D-13 calibration photos
//   // Capture the answer via prompt() in the simulator UI or manual entry in the tsx wrapper
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BLE measurement = single 1-min run, single environment | Multi-environment (3) × 30-min sustained × multi-percentile envelope (p50/p95/p99) | CONTEXT.md D-09 (2026-05-10) | Catches long-tail behavior + iOS BLE renegotiation (Pitfall 2 + 10); microwave coexistence becomes empirical fact, not assumption |
| DLE measurement at connect-time only (Specs §10.0.7 original) | DLE 30-min sustained with renegotiation event capture | CONTEXT.md D-08 + Pitfall 10 mitigation 4 | Prevents "lab works, field fails after 20 min" mode |
| Queue depth = binary {≥4 OR not} (Specs §10.0.8 original) | Full table {1, 2, 3, ≥4} with empirical probe (push 8, count drops) | CONTEXT.md D-10 + Pitfall 12 mitigation 1 | Gives Phase 4 raster scheduler a queue-aware design from day 1 |
| Floyd-Steinberg in sRGB (image-q default) | Linearize to linear-light before luma, perceptually-spaced palette via CIE L*, serpentine scan | Pitfall 15 mitigation (research 2026-05-10), per Wikipedia FS dithering canonical text | Makes midtone tokens visible on phosphor green; without this, raster mode is unreadable for NPC tokens |
| MCP HTTP+SSE transport | Streamable HTTP (deprecated 2025-03-26) | modelcontextprotocol.io/specification/2025-06-18 | Out of scope for Phase 0 (V2/Phase 11), but the deprecation pattern reinforces "verify upstream every cycle" (INV-2) — relevant context for the Even SDK probe (Pitfall 7) |
| Foundry v12 `item.use({})` API | dnd5e 5.x `activity.use({configure: false, event: null})` | dnd5e 5.0.0 (shim removal) | Not Phase 0, but the MidiQOL probe must run on dnd5e 5.3.3+ test world to be representative — pin the test world to Phase 7 production target version |

**Deprecated/outdated for Phase 0 specifically:**
- One-shot RF environment lab measurement (replaced by multi-env multi-percentile)
- Connect-time-only DLE check (replaced by sustained run with renegotiation capture)
- "1-bit black-and-white" rounding (FS variant): we're 4-bit greyscale; round-to-nearest is correct, but linearization first
- MidiQOL-as-`recommended` (replaced by `required` in module.json — REQ MIDIQ-01 + adversarial Vector B)

## Open Questions

1. **Even Hub developer access — exact application channel and SLA**
   - **What we know:** Application form exists (per Android Authority 2026-01-05 article; verified search results 2026-05-10). Form asks for "background details, project ideas, availability, and portfolio links." Discord pilot community exists (referenced on hub.evenrealities.com). Even Hub launched April 3, 2026; over 2,000 developers building per industry coverage.
   - **What's unclear:** Direct URL to the application form (not visible on hub.evenrealities.com landing page from public WebFetch — may be behind a Build Now / Console click that requires the page's JS to render). SLA from submission to grant (Android Authority, 9to5Google, Digital Trends articles all describe the program as a "limited pilot" with "small scheme to start out" — implies non-trivial review, not an instant grant). Whether access includes (a) simulator-only (already MIT open source as BxNxM/even-dev), (b) `@evenrealities/even_hub_sdk` npm access, (c) BLE protocol docs, (d) R1 SDK timing constants.
   - **Recommendation:** **Submit via every available channel in parallel** — (i) the official form linked from the hub.evenrealities.com Build Now button (will require visiting the page in a real browser to extract the form URL), (ii) the Discord pilot community (sign up, post intro mentioning the project), (iii) the Even Hub email contact if visible after sign-in. Include in the application: portfolio links to this repo (Specs.md + showcase), the Phase 0 test plan, and an explicit statement that the project is single-developer MIT-licensed (low marketplace risk, high signal value). CONTEXT.md D-03 already specifies the fallback: pivot to non-hardware work if access slips beyond 2 weeks.
   - **Out of Phase 0 scope** if blocked: the MidiQOL probe (REQ MIDIQ-01) and Phase 1 monorepo/ADRs (per D-02 partial-parallel) keep the project moving without Even Hub access.

2. **`updateImageRawData` exact byte format — empirical, no upstream docs**
   - **What we know:** hub.evenrealities.com/docs/guides/device-apis explicitly omits format specifics (verified WebFetch 2026-05-10: page states "images are greyscale only" with no byte-level detail). Specs §10.0.2 enumerates the 3 candidate formats (PNG indexed 4-bit, raw 4-bit big-endian, raw 4-bit little-endian). Community RE'd repos (i-soxi/even-g2-protocol, brianmatzelle/even-realities-g2-glasses) reference BLE service UUIDs and packet structure docs but the relevant doc files weren't accessible via WebFetch (HTTP 403 or unparseable from the GitHub UI).
   - **What's unclear:** Which of A/B/C is correct. Whether the npm `@evenrealities/even_hub_sdk` (post-access) abstracts the format entirely (i.e., the dev passes a high-level pixel buffer + the SDK handles encoding) — in which case Specs §10.0.2 reduces to "what does the SDK accept?" rather than "what bytes hit the wire?".
   - **Recommendation:** Probe empirically per Specs §10.0.2 protocol; the test script (Code Example 5 above) generates all 3 formats and visually verifies. If post-grant the SDK exposes a canonical accept-format, document it in `docs/perf/phase-0/10-0-2-image-format-{ts}.json` with the SDK API signature in the rationale field. This becomes ADR-0006 evidence either way.

3. **R1 timing windows — distinguishability statistical confidence**
   - **What we know:** HCI literature for touch gesture timing studies (search 2026-05-10) typically uses n ≥ 20 per gesture per participant for distinguishability at p<0.05; Pearson Chi-Square + Bonferroni correction is the standard analytical pattern. Specs §10.0.1 specifies the 6-gesture sequence (1× tap, 1× double-tap, scroll up 3, scroll down 3, long-press 1s, long-press 2s) per session.
   - **What's unclear:** Whether n=30 × 5 sessions = 150 samples per gesture is sufficient for **single-developer self-test** confidence (no inter-participant variability). For Phase 0 GO/NO-GO (binary distinguishability), 95% CI on tap vs double-tap inter-stimulus-interval (ISI) bimodality is the right bar; for INV-5 design (Phase 6) the windows may need re-validation with multiple users.
   - **Recommendation:** Phase 0 captures n=150 (30 × 5 sessions) per gesture from single user; computes mean ± SD per gesture + Hartigan's dip test for bimodality on tap_vs_double_tap_isi. Phase 10 field test (multi-session, multi-user) re-validates with broader population. This is consistent with Specs §10.0.1 GO/NO-GO bar (binary distinguishable) plus Phase 6 INV-5 ratification gate.

4. **Palette calibration — camera precision adequate?**
   - **What we know:** Pitfall 15 mitigation 2 specifies "render luminance-ramp test pattern, photograph G2, derive perceptually-correct palette." Smartphone cameras with locked exposure (manual mode) can resolve ~6-8 stops of dynamic range; G2 phosphor green has ~16 levels (4-bit) → ~4 stops needed. Smartphone is theoretically adequate.
   - **What's unclear:** Whether ambient light variability between calibration sessions makes the result session-dependent (in which case Phase 0 captures one calibration, Phase 4 re-validates per shipped device). Whether ΔE76 vs CIEDE2000 matters for the verdict (probably not — for monochrome phosphor, L* spacing alone is sufficient).
   - **Recommendation:** Use smartphone camera in manual mode (locked ISO 100, fixed exposure 1/30s, fixed white balance daylight) in dim ambient (single-LED desk lamp, no overhead). Capture 3 ramp variants (uniform, derived-perceptual-v1, derived-perceptual-v2) and pick the verdict. ΔE76 (simple Euclidean L\*a\*b\*) is sufficient for Phase 0; defer CIEDE2000 to Phase 4 if midtones still problematic. Document camera settings in `docs/perf/phase-0/calibration/methodology.md` for reproducibility.

5. **Test harness running in WebView — Node loader tooling**
   - **What we know:** Test scripts must execute inside the Even Realities App WebView (Specs §3.7 — plugin code runs phone-side, not on bare Node). The Even Hub Simulator (BxNxM/even-dev) is the open-source local equivalent.
   - **What's unclear:** The exact handoff between the `tsx` standalone script (which does file I/O for evidence emission) and the WebView page (which has access to `bridge.*`). Two viable shapes: (a) tsx script opens a Playwright-controlled Chromium loaded with the simulator page + injects test code; (b) the WebView page POSTs results to a tiny Fastify endpoint that the tsx script runs on localhost. Shape (a) is cleaner for Phase 0 (no extra service); shape (b) matches future Phase 1+ architecture better.
   - **Recommendation:** Start with (a) — Playwright-driven Chromium loading the simulator + injected test glue + `page.evaluate()` to drive the SDK calls + `page.exposeBinding()` to write evidence files. When promoting to `packages/validation-harness/` (D-15) at Phase 1, swap to (b) using the bridge skeleton from Phase 3. Document the swap path in `tests/phase-0/README.md`.

## Validation Architecture

> Phase 0 is itself the validation phase. The "test framework" *is* the test harness (`tests/phase-0/`); the deliverables are the measurement evidence + ADR-0005 + ADR-0006. This section maps the project's standard nyquist validation structure onto Phase 0's unique nature.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | tsx@4.21.0 + Zod@4.4.3 (standalone scripts; per CONTEXT.md D-06); promotion to Vitest@4.1.5 in Phase 1 (D-15) |
| Config file | `tests/phase-0/tsconfig.json` (extends `tsconfig.base.json` once Phase 1 lands; standalone strict TS config until then) — see Wave 0 |
| Quick run command | `cd tests/phase-0 && pnpm exec tsx midiqol-config-probe.ts` (per single test) |
| Full suite command | `cd tests/phase-0 && pnpm exec tsx run-all.ts` (sequential runner that orchestrates all 7 tests, gates on `[SKIP]` patterns) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIDIQ-01 | MidiQOL `autoFastForward` config probe at boot — returns pass/fail with remediation list | manual-only (requires Foundry test world running with MidiQOL installed) — automatable post-Phase 1 once a Foundry-test-world Docker image exists | `cd tests/phase-0 && pnpm exec tsx midiqol-config-probe.ts` (which loads a tiny Foundry module, hooks `'ready'`, and POSTs settings JSON to the harness) | ❌ Wave 0 — `tests/phase-0/midiqol-config-probe.ts` + supporting Foundry module skeleton must be created |

**Phase 0 GO/NO-GO Test Map (the 6 hardware tests):**

| Specs Ref | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| §10.0.1 | R1 gesture timing distinguishable, n=150 per gesture | semi-automated (researcher performs gestures; harness captures via SDK callback) | `RF_ENV=clean pnpm exec tsx 10-0-1-r1-timing.ts` | ❌ Wave 0 |
| §10.0.2 | `updateImageRawData` byte format identified (A/B/C) | semi-automated (harness sends 3 formats; researcher photographs G2 + enters verdict) | `pnpm exec tsx 10-0-2-image-format.ts` | ❌ Wave 0 |
| §10.0.3 | BLE bandwidth multi-env p50/p95/p99 measured 30-min × 3 envs | manual environment setup + automated measurement | `RF_ENV={clean,5ghz-loaded,2-4ghz-microwave} pnpm exec tsx 10-0-3-ble-multi-env.ts` (one run per env) | ❌ Wave 0 |
| §10.0.7 | DLE 30-min sustained throughput with renegotiation event capture | automated | `pnpm exec tsx 10-0-7-dle-sustained.ts` | ❌ Wave 0 |
| §10.0.8 | Queue depth empirical {1,2,3,≥4} table | automated (push 8 tiles, count dropped) | `pnpm exec tsx 10-0-8-queue-depth.ts` | ❌ Wave 0 |
| §10.0.9 | Palette calibration (uniform → derived → verified L* spacing within ±10%) | semi-automated (harness renders ramp; researcher photographs + analyzes) | `pnpm exec tsx 10-0-9-palette-calibration.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit (during Phase 0 harness construction):** `cd tests/phase-0 && pnpm exec tsc --noEmit` — type-check all harness scripts; smoke-run the test that doesn't require hardware (MidiQOL probe, against a local Foundry test world)
- **Per wave merge:** `cd tests/phase-0 && pnpm exec tsx run-all.ts --skip-hardware` — full suite minus hardware-bound tests; verifies output schema + evidence emission paths work
- **Phase gate:** All 6 hardware tests + MidiQOL probe executed end-to-end with evidence in `docs/perf/phase-0/`; ADR-0005 + ADR-0006 written and committed; INV-3 doc coherence check passes (Specs.md + README.md + showcase reflect Phase 0 closure if any cross-cutting decisions emerged)

### Wave 0 Gaps

**All Phase 0 test infrastructure is greenfield — there is no existing application code to extend.** Wave 0 must create:

- [ ] `tests/phase-0/package.json` — TS+tsx+Zod+csv-stringify minimal install per CONTEXT.md D-06
- [ ] `tests/phase-0/tsconfig.json` — strict TS config (will extend `tsconfig.base.json` once Phase 1 lands)
- [ ] `tests/phase-0/_shared/output.ts` — JSON+CSV writer + filename helper (Code Example 1)
- [ ] `tests/phase-0/_shared/schemas.ts` — Zod schemas for each test's evidence shape (Code Example 2/3)
- [ ] `tests/phase-0/_shared/stats.ts` — `percentile()` + bimodality dip test + CI bounds
- [ ] `tests/phase-0/_shared/branch-decision.ts` — D-12 strict-numeric verdict helper (Code Example 4)
- [ ] `tests/phase-0/_shared/hub.ts` — thin Even Hub SDK loader/wrapper (post-grant, before that uses the simulator interface)
- [ ] `tests/phase-0/10-0-1-r1-timing.ts` — R1 gesture window measurement (n=150)
- [ ] `tests/phase-0/10-0-2-image-format.ts` — Format A/B/C probe with `upng-js` for Format A (Code Example 5)
- [ ] `tests/phase-0/10-0-3-ble-multi-env.ts` — multi-env multi-percentile BLE bandwidth (Code Example 3)
- [ ] `tests/phase-0/10-0-7-dle-sustained.ts` — DLE 30-min with renegotiation event capture
- [ ] `tests/phase-0/10-0-8-queue-depth.ts` — queue depth empirical probe + table generation
- [ ] `tests/phase-0/10-0-9-palette-calibration.ts` — luminance-ramp render + perceptual derivation
- [ ] `tests/phase-0/midiqol-config-probe.ts` — MidiQOL setting introspection (Code Example 2)
- [ ] `tests/phase-0/run-all.ts` — orchestrator with `--skip-hardware` flag
- [ ] `tests/phase-0/README.md` — version pins (verified date), how-to-run, prereqs (Even Hub access, Foundry test world for MidiQOL probe), simulator vs real-device guidance, Playwright loader pattern (Open Question 5)
- [ ] `docs/perf/phase-0/.gitkeep` — directory placeholder + brief README explaining evidence file naming (`{test_id}-{env?}-{ISO8601}.json`)
- [ ] `docs/perf/phase-0/calibration/.gitkeep` + `methodology.md` — camera settings, ambient light protocol, L* derivation script
- [ ] `docs/architecture/0005-phase0-go-no-go.md` — populated at Phase 0 closure, NOT at Wave 0 (Wave 0 may stub the template)
- [ ] `docs/architecture/0006-raster-pipeline-library-stack.md` — populated at Phase 0 closure conditional on Branch (D-14)

## Sources

### Primary (HIGH confidence)

- **Specs.md** v0.9.11 §10.0.1–§10.0.10 (Phase 0 validation protocol, master) · §11.5.7 (raster pipeline lib stack) · §11.5.8 (failure modes) · §0.1 INV-1/2/3/4
- **CONTEXT.md** `.planning/phases/00-validation-gates/00-CONTEXT.md` — 16 locked decisions (D-01 through D-16); strict numeric thresholds (D-09/D-10/D-11/D-12)
- **REQUIREMENTS.md** REQ MIDIQ-01 — MidiQOL `relationships.requires` + autoFastForward config check
- **STACK.md** `.planning/research/STACK.md` §1.1–§1.6 — pinned versions verified via `npm view` 2026-05-10 (HIGH confidence cited there)
- **PITFALLS.md** `.planning/research/PITFALLS.md` §2 (BLE multi-env), §5 (gesture polysemy), §7 (Even SDK no SemVer), §10 (DLE silent degradation), §12 (queue depth full table), §15 (sRGB-vs-linear FS dither)
- **ROADMAP.md** §Phase 0 success criteria 1-5 + dependency note ("Depends on: Nothing")
- **Foundry VTT API** `foundryvtt.wiki/en/development/api/settings` — `game.settings.get/set/register` semantics, `'ready'` Hook timing, dependency resolution from `module.json` `relationships`
- **MidiQOL source** `github.com/tposney/midi-qol/blob/master/src/module/settings.ts` (verified 2026-05-10) — confirmed setting key `AutoFastForwardAbilityRolls` (capital A); `configSettings` object members `autoRollAttack`, `autoRollDamage`, `autoFastForwardRolls` (multi-select), `autoCompleteWorkflow` (default true since v13.0.39), `removeButtons`
- **Wikipedia Floyd-Steinberg** `en.wikipedia.org/wiki/Floyd–Steinberg_dithering` (verified 2026-05-10) — verbatim *"For correct results, all values should be linearized first, rather than operating directly on sRGB values"* + serpentine scan documentation
- **Punch Through BLE Throughput Pt 4** `punchthrough.com/ble-throughput-part-4/` (verified 2026-05-10) — DLE impact (`27 → 251 byte` payload); 2M PHY 33% improvement; combined DLE+2M ~90%; iOS min connection interval 15ms vs Android 7.5ms; "~50 KB/s achievable on newer Android and iOS devices with DLE enabled on default LE 1M PHY"
- **Memfault BLE Throughput Primer** `interrupt.memfault.com/blog/ble-throughput-primer` — Frontline Sodera LE / Ellysis Bluetooth Explorer / Nordic nRF52 sniffer (out of scope for Phase 0 application-observable measurement, but documented for forensic deep-dive)
- **MCP transport spec** `modelcontextprotocol.io/specification/2025-06-18/basic/transports` — Streamable HTTP / HTTP+SSE deprecation (out of Phase 0 scope but informs INV-2 pattern of "verify upstream every cycle")

### Secondary (MEDIUM confidence)

- **Android Authority 2026-01-05** `androidauthority.com/even-realities-hub-smart-glasses-developers-3629083/` — Even Hub Early Developer Program application form fields ("background details, project ideas, availability, portfolio links"); pilot scheme limited to small initial cohort; no SLA disclosed
- **Digital Trends 2026-03-26** `digitaltrends.com/wearables/even-realities-launches-even-hub-to-turn-g2-smart-glasses-into-a-full-app-ecosystem/` — Even Hub launch April 3, 2026; >2,000 developers building; OTA app installation
- **9to5Google 2026-03-26** `9to5google.com/2026/03/26/even-realities-even-hub-apps-and-better-conversate-mode/` — third-party app support timeline
- **Even Hub landing** `hub.evenrealities.com/` (WebFetch confirmed accessible 2026-05-10 but full developer signup flow requires JS-rendered page interaction; landing visible: "Even Hub is live and ready for your code", "Build Now" + "Documentation" + "Join Discord" CTAs)
- **Even Hub Simulator (BxNxM/even-dev)** `github.com/BxNxM/even-dev` (MIT license, open source, verified 2026-05-10) — local plugin run target; multi-app test environment; "G2 app is a regular web app — HTML, TypeScript, and Even Hub SDK"; documented limitation *"APIs and structure may change as the Even ecosystem evolves"*
- **MidiQOL README v11** `gitlab.com/tposney/midi-qol/-/blob/v11/README.md` (search-confirmed; direct WebFetch 404 due to CDN routing) — autoFastForwardRolls multi-select for Attack/Damage/Ability/Save/Skill/Tools roll types; "fast-forwarding settings determine if advantage/disadvantage and/or critical/normal dialogs are shown or suppressed"; "auto roll settings control whether dice are rolled automatically"

### Tertiary (LOW confidence — flagged for re-validation post-grant)

- **i-soxi/even-g2-protocol** community-RE'd BLE protocol (research SUMMARY rated LOW confidence; WebFetch returned reduced detail — referenced doc files (`docs/ble-uuids.md`, `docs/packet-structure.md`) exist but content not accessed)
- **brianmatzelle/even-realities-g2-glasses** community starter (referenced in research SUMMARY as MEDIUM source; specific details for byte format not verified for this research)
- **Punch Through Pt 1-3** older articles in the BLE throughput series — author noted "some of the information in these posts may be outdated"
- **HCI gesture-timing studies** ScienceDirect / MDPI / ResearchGate — broad context on n ≥ 20 sample sizes, Pearson Chi-Square / Bonferroni patterns; no single canonical reference for tap-vs-double-tap distinguishability windows in HCI literature, applied as best-practice guidance only

## Metadata

**Confidence breakdown:**
- **Test design (7 tests):** HIGH — Specs §10.0 + CONTEXT.md decisions fix 80%+ of the structure
- **Threshold criteria:** HIGH — CONTEXT.md D-09/D-10/D-11/D-12 strict numeric, no discretion
- **Test harness stack (TS+tsx+Zod):** HIGH — STACK.md verified versions 2026-05-10
- **MidiQOL setting keys:** HIGH for `AutoFastForwardAbilityRolls` (verified in source); MEDIUM for the 4 related `configSettings` members (cross-referenced from README + community docs but not all verified at exact-key-name level)
- **Floyd-Steinberg linearization + perceptual palette:** HIGH on the principle (Wikipedia verbatim); MEDIUM on the exact Phase 0 calibration protocol (smartphone-camera-adequate is judgment, may need photometer if borderline)
- **BLE measurement methodology:** MEDIUM — application-observable timestamps via SDK callbacks is the right shape; iOS WKWebView-specific limitations (no link-layer access) make sniffer-based methods out of scope
- **Even Hub developer access process:** MEDIUM — application form + Discord channel confirmed; exact URL + SLA not disclosed publicly
- **`updateImageRawData` byte format:** LOW for upstream docs (omitted from public docs); HIGH for the empirical probe protocol (Specs §10.0.2 well-defined)
- **R1 gesture timing windows:** MEDIUM — HCI literature gives sample-size guidance; project-specific firmware behavior is empirical
- **Even Hub Simulator usability for Phase 0 tests:** MEDIUM — open source confirmed, scope of simulation (display, R1 events, BLE) not exhaustively documented; recommend simulator for §10.0.1/§10.0.2 iteration + real device for §10.0.3/§10.0.7/§10.0.8/§10.0.9 measurements

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 for stack decisions (STACK.md INV-2 cycle); 2026-05-24 for Even Hub access process (fast-moving — re-verify before formal application if delayed); permanent for Specs.md / CONTEXT.md decision provenance (canonical SoT, drift policy: Specs.md wins per INV-3)
