# Phase 0 Validation Harness

## Purpose

Test harness scripts per la validazione hardware/SDK di **Phase 0** del roadmap EvenFoundryVTT (EVF), come da `Specs.md` §10.0 e `.planning/phases/00-validation-gates/00-CONTEXT.md` (in particolare D-05 e D-06).

Questa harness:

- Vive **outside `packages/`** (D-05) — è greenfield, NON tocca `pnpm-workspace.yaml` né alcuna config monorepo
- Usa **TypeScript strict + tsx + Zod** (D-06) — zero-build, zero-bundler, scripts eseguibili direttamente con `tsx`
- Emette evidenza Zod-validata (JSON + CSV) in `docs/perf/phase-0/` (D-07)
- Decide Branch A/B/C via `_shared/branch-decision.ts` con soglie hardcoded D-09/D-10/D-11/D-12 (no researcher discretion)

## Pinned Versions (verified 2026-05-10)

| Package        | Version  | Purpose                              | Source              |
|----------------|----------|--------------------------------------|---------------------|
| `typescript`   | `5.8.3`  | Type-check (strict, noUnusedLocals)  | STACK.md §1.6       |
| `tsx`          | `4.21.0` | Zero-build TS execution              | STACK.md §1.6       |
| `zod`          | `4.4.3`  | Runtime evidence-schema validation   | STACK.md §1.5       |
| `@types/node`  | `25.6.2` | Node.js typings                      | STACK.md §1.6       |
| `csv-stringify`| `6.5.2`  | CSV companion files for sample data  | RESEARCH §"Standard Stack" |

> **Nota deviation:** il piano originale chiamava `typescript@5.8.5`, ma quella versione **non esiste** sul registry npm (latest 5.8 stable è `5.8.3`, verified `npm view typescript versions`). Pin aggiornato a `5.8.3` (latest stabile della serie 5.8, consistente con la policy "stay on 5.8.x for Phase 1" di `CLAUDE.md` §1.1).

Tutte le versioni sono **pinned esatte** (no caret, no tilde) per riproducibilità INV-2.

## Prereqs

### Software-only tests (no hardware required)

- **MidiQOL probe (`midiqol-config-probe.ts`)** — richiede:
  - Foundry VTT v13.347+ (verified su v14)
  - dnd5e system 5.3.3+
  - MidiQOL latest installed in test world
  - World di test dedicato `phase-0-midiqol-test` (NEVER usare il world di produzione)

### Hardware-bound tests

I seguenti test richiedono **Even Hub developer access + paired G2 + R1 ring + Even Realities App on phone**:

- `10-0-1-r1-timing.ts`
- `10-0-2-image-format.ts`
- `10-0-3-ble-multi-env.ts`
- `10-0-7-dle-sustained.ts`
- `10-0-8-queue-depth.ts`
- `10-0-9-palette-calibration.ts`

Per `10-0-3-ble-multi-env` servono inoltre **3 RF environments fisici**: `clean` / `5ghz-loaded` (iperf3 saturating 5 GHz Wi-Fi) / `2-4ghz-microwave` (microwave on + 2.4 GHz iperf3).

## How to Run

```bash
# Install (one-time)
cd tests/phase-0
pnpm install

# Type-check (always green pre-commit)
pnpm exec tsc --noEmit

# Smoke (software-only — runs MidiQOL probe se Foundry test world reachable)
pnpm exec tsx run-all.ts --skip-hardware

# Single test
pnpm exec tsx midiqol-config-probe.ts

# Hardware-parameterized BLE test
RF_ENV=clean              pnpm exec tsx 10-0-3-ble-multi-env.ts
RF_ENV=5ghz-loaded        pnpm exec tsx 10-0-3-ble-multi-env.ts
RF_ENV=2-4ghz-microwave   pnpm exec tsx 10-0-3-ble-multi-env.ts

# Full suite (requires hardware + Even Hub access)
pnpm exec tsx run-all.ts
```

## Simulator vs Real Device

- **Even Hub Simulator** (`BxNxM/even-dev`, MIT, no developer access required) — sufficiente per iterare su:
  - §10.0.1 R1 timing (gesture window iteration)
  - §10.0.2 image format probe (format-A/B/C iteration)
- **Real device required** per:
  - §10.0.3 BLE multi-env (RF measurement)
  - §10.0.7 DLE 30-min sustained (BLE renegotiation events)
  - §10.0.8 queue depth (BLE backpressure characterization)
  - §10.0.9 palette calibration (G2 phosphor luminance ramp photography)

## Output Convention

Ogni script emette un evidence file in `docs/perf/phase-0/`:

```
{test_id}-{env?}-{ISO8601}.json     # always
{test_id}-{env?}-{ISO8601}.csv      # only for tests con sample arrays (BLE, DLE)
```

Tutti i file sono Zod-validated (`schema_version: 1`) — vedi `_shared/schemas.ts` per il discriminated union `AnyResult` e i sub-shapes per test. Vedi `docs/perf/phase-0/README.md` per esempi di filename + naming convention dettagliata.

## Never Commit Secrets

Even Hub bearer tokens, MidiQOL world auth, e qualunque credenziale **vivono in `.env.local`** (gitignored, vedi `.gitignore`).

- `_shared/hub.ts` legge da `process.env.EVEN_HUB_TOKEN` e **mai** da inline value
- Il writer `_shared/output.ts` accetta SOLO payload Zod-validati conformi a `EvidenceMeta` — il type system rifiuta a compile-time qualunque campo non-whitelisted (no `bearer`, no `password`, no `secret`)
- **NEVER** inline credenziali nei test scripts. Il piano threat model T-00-01 + T-00-04 vieta esplicitamente la pratica.

Pattern env-only:

```bash
# .env.local (gitignored)
EVEN_HUB_TOKEN=eh_...

# Run
cd tests/phase-0
pnpm exec tsx 10-0-3-ble-multi-env.ts
```

## Promotion Path (D-15)

Quando Phase 1 lands (monorepo skeleton + Biome + TypeScript strict + Vitest), questa harness promuove a:

```
packages/validation-harness/
├── src/                  ← contenuto di tests/phase-0/_shared/
├── tests/                ← contenuto di tests/phase-0/10-0-*.ts (convertiti a Vitest suite)
├── package.json          ← pnpm workspace member, dipende da @evf/shared-protocol
└── README.md             ← merge di questo README + nuovo tooling Vitest
```

Stesso `_shared/*.ts` re-usable. Re-validation futura (G2 firmware OTA, nuovi modelli hardware, simulator updates) re-runnable con singolo comando `pnpm -F validation-harness test`. Pattern Doom-on-exotic-device: harness has compound interest.

## Cross-References

- `Specs.md` §10.0 (Phase 0 master protocol)
- `.planning/phases/00-validation-gates/00-CONTEXT.md` (16 locked decisions D-01..D-16)
- `.planning/phases/00-validation-gates/00-VALIDATION.md` (Wave 0 file list + sampling rate)
- `.planning/phases/00-validation-gates/00-RESEARCH.md` (Code Examples 1-5)
- `docs/perf/phase-0/README.md` (evidence naming convention)
- `docs/architecture/0005-phase0-go-no-go.md` (Branch A/B/C decision document — populated at phase closure)
- `docs/architecture/0006-raster-pipeline-library-stack.md` (lib stack commitment, conditional per ADR-0005 verdict)
