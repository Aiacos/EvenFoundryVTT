# Phase 0 Measurement Evidence

**Purpose:** Raw, machine-readable evidence files for Phase 0 hardware/SDK validation tests (Specs.md §10.0.1–10.0.9 + REQ MIDIQ-01). Cited by `docs/architecture/0005-phase0-go-no-go.md` and `docs/architecture/0006-raster-pipeline-library-stack.md` per CONTEXT.md D-13.

## File Naming Convention

`{test_id}-{env?}-{ISO8601}.json` (+ optional `.csv` for tests with raw sample arrays).

- `{test_id}` ∈ { `10-0-1-r1-timing`, `10-0-2-image-format`, `10-0-3-ble-multi-env`, `10-0-7-dle-sustained`, `10-0-8-queue-depth`, `10-0-9-palette-calibration`, `midiqol-config-probe` }
- `{env}` ∈ { `clean`, `5ghz-loaded`, `2-4ghz-microwave` } (BLE multi-env only — others omit)
- `{ISO8601}` — `YYYY-MM-DDTHH-MM-SSZ` with `:` and `.` replaced by `-` for filesystem safety

**Examples:**

```
10-0-3-ble-multi-env-clean-2026-05-15T14-30-00Z.json
10-0-3-ble-multi-env-clean-2026-05-15T14-30-00Z.csv
10-0-3-ble-multi-env-5ghz-loaded-2026-05-15T16-00-00Z.json
10-0-3-ble-multi-env-2-4ghz-microwave-2026-05-15T17-30-00Z.json
midiqol-config-probe-2026-05-12T10-00-00Z.json
```

## Schema

Every JSON conforms to `AnyResult` discriminated union (see `tests/phase-0/_shared/schemas.ts`). Always starts with `schema_version: 1` (D-07). Schema evolutions bump the version + ADR-0005 documents the bump.

## Re-Run Policy (INV-2)

Bad measurement → re-run produces a new file with new ISO8601 timestamp. **Never hand-edit existing JSON.** Why-the-re-run rationale lands in ADR-0005.

## Calibration Subdirectory

`calibration/` holds palette calibration photos + L\* derivation analysis (Pitfall 15). See `calibration/methodology.md` for camera settings + ambient light protocol.
