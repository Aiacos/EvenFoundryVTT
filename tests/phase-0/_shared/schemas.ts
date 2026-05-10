// Phase 0 evidence schemas — versioned via schema_version: 1 (D-07).
// Every test output JSON is parsed through these Zod schemas before fs.writeFile.
// Schema evolution bumps schema_version + ADR-0005 references the bump.

import { z } from "zod";

export const TEST_IDS = [
  "10-0-1-r1-timing",
  "10-0-2-image-format",
  "10-0-3-ble-multi-env",
  "10-0-7-dle-sustained",
  "10-0-8-queue-depth",
  "10-0-9-palette-calibration",
  "midiqol-config-probe",
] as const;
export const TestId = z.enum(TEST_IDS);
export type TestId = z.infer<typeof TestId>;

export const RfEnv = z.enum(["clean", "5ghz-loaded", "2-4ghz-microwave"]);
export type RfEnv = z.infer<typeof RfEnv>;

export const Verdict = z.enum([
  "A",
  "B",
  "C",
  "borderline-A→B",
  "borderline-B→C",
  "skipped",
  "pass",
  "fail",
]);
export type Verdict = z.infer<typeof Verdict>;

// Common envelope every evidence file conforms to (D-07 + T-00-01: NO auth fields).
export const EvidenceMeta = z.object({
  schema_version: z.literal(1),
  test_id: TestId,
  timestamp: z.string().datetime(),
  env: RfEnv.optional(),
  verdict: Verdict,
  rationale: z.string().min(1),
});
export type EvidenceMeta = z.infer<typeof EvidenceMeta>;

// BLE multi-env (§10.0.3 + D-09 multi-percentile envelope).
export const BleMultiEnvResult = EvidenceMeta.extend({
  test_id: z.literal("10-0-3-ble-multi-env"),
  env: RfEnv,
  duration_sec: z.number().int().positive(),
  tile_size_bytes: z.number().int().positive(),
  tile_interval_ms: z.number().int().positive(),
  samples_kbps: z.array(z.number().nonnegative()),
  p50_kbps: z.number().nonnegative(),
  p95_kbps: z.number().nonnegative(),
  p99_kbps: z.number().nonnegative(),
  renegotiation_events: z.array(
    z.object({
      t_sec: z.number().nonnegative(),
      p_drop_pct: z.number().min(0).max(100),
    }),
  ),
});
export type BleMultiEnvResult = z.infer<typeof BleMultiEnvResult>;

// DLE 30-min sustained (§10.0.7 + Pitfall 10).
export const DleSustainedResult = EvidenceMeta.extend({
  test_id: z.literal("10-0-7-dle-sustained"),
  duration_sec: z.number().int().positive(),
  initial_mtu_bytes: z.number().int().positive(),
  inferred_mtu_history: z.array(
    z.object({ t_sec: z.number().nonnegative(), inferred_mtu_bytes: z.number().int().positive() }),
  ),
  renegotiation_events: z.array(
    z.object({ t_sec: z.number().nonnegative(), p_drop_pct: z.number().min(0).max(100) }),
  ),
  sustained_kbps_p50: z.number().nonnegative(),
  sustained_kbps_p99: z.number().nonnegative(),
});
export type DleSustainedResult = z.infer<typeof DleSustainedResult>;

// Queue depth (§10.0.8 + D-10 strict tier mapping).
export const QueueDepthResult = EvidenceMeta.extend({
  test_id: z.literal("10-0-8-queue-depth"),
  burst_size: z.number().int().positive(),
  measured_max_queue: z.number().int().nonnegative(),
  dropped_count: z.number().int().nonnegative(),
  coalesced_count: z.number().int().nonnegative(),
  table: z.object({
    "1": z.string(),
    "2": z.string(),
    "3": z.string(),
    ">=4": z.string(),
  }),
});
export type QueueDepthResult = z.infer<typeof QueueDepthResult>;

// Image format probe (§10.0.2 + Pitfall 7).
export const ImageFormatResult = EvidenceMeta.extend({
  test_id: z.literal("10-0-2-image-format"),
  formats_tested: z.array(z.enum(["A-png-indexed", "B-raw-4bit-be", "C-raw-4bit-le"])),
  identified_format: z.enum(["A-png-indexed", "B-raw-4bit-be", "C-raw-4bit-le", "none"]),
  probe_pattern_hash: z.string(),
  researcher_visual_verdict: z.string(),
});
export type ImageFormatResult = z.infer<typeof ImageFormatResult>;

// R1 timing (§10.0.1 + Pitfall 5).
export const R1TimingResult = EvidenceMeta.extend({
  test_id: z.literal("10-0-1-r1-timing"),
  sessions: z.number().int().positive(),
  samples_per_gesture: z.number().int().positive(),
  gestures: z.record(
    z.enum(["tap", "double-tap", "scroll-up", "scroll-down", "long-press-1s", "long-press-2s"]),
    z.object({
      mean_ms: z.number().nonnegative(),
      sd_ms: z.number().nonnegative(),
      p95_ms: z.number().nonnegative(),
      n: z.number().int().nonnegative(),
    }),
  ),
  bimodality: z.object({
    tap_vs_double_tap_dip: z.number(),
    tap_vs_double_tap_p_value: z.number().min(0).max(1),
    distinguishable: z.boolean(),
  }),
  recommended_windows_ms: z.object({
    tap_max: z.number().int().positive(),
    double_tap_max: z.number().int().positive(),
    long_press_min: z.number().int().positive(),
  }),
});
export type R1TimingResult = z.infer<typeof R1TimingResult>;

// Palette calibration (§10.0.9 + Pitfall 15).
export const PaletteCalibrationResult = EvidenceMeta.extend({
  test_id: z.literal("10-0-9-palette-calibration"),
  iterations: z.number().int().positive(),
  uniform_palette_lstar: z.array(z.number()),
  derived_palette_lstar: z.array(z.number()),
  spacing_uniformity_pct: z.number(),
  passes_within_10pct: z.boolean(),
  camera_settings: z.object({
    iso: z.number().int().positive(),
    exposure_sec: z.number().positive(),
    white_balance: z.string(),
    ambient_lux: z.number().nonnegative().optional(),
  }),
});
export type PaletteCalibrationResult = z.infer<typeof PaletteCalibrationResult>;

// MidiQOL probe (REQ MIDIQ-01 + research §6).
export const MidiQolConfigResult = EvidenceMeta.extend({
  test_id: z.literal("midiqol-config-probe"),
  midiqol_version: z.string(),
  settings: z.object({
    AutoFastForwardAbilityRolls: z.boolean(),
    autoRollAttack: z.boolean(),
    autoRollDamage: z.string(),
    autoFastForwardRolls: z.array(z.string()),
    autoCompleteWorkflow: z.boolean(),
    removeButtons: z.string().optional(),
  }),
  remediation_required: z.array(z.string()),
});
export type MidiQolConfigResult = z.infer<typeof MidiQolConfigResult>;

// Discriminated union of all results — for run-all.ts orchestrator (Plan 02).
export const AnyResult = z.discriminatedUnion("test_id", [
  BleMultiEnvResult,
  DleSustainedResult,
  QueueDepthResult,
  ImageFormatResult,
  R1TimingResult,
  PaletteCalibrationResult,
  MidiQolConfigResult,
]);
export type AnyResult = z.infer<typeof AnyResult>;
