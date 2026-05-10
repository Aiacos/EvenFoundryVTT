// Branch A/B/C decision helper (D-09 + D-10 + D-11 + D-12 strict numeric, no discretion).
// Borderline measurements within ±5% of cutoff → automatic safe-downgrade (D-12).
// ADR-0005 cites this helper + the fixed Thresholds constant for INV-2 verifiability.

export type Thresholds = {
  branch_a: { p50_min_kbps: number; p95_min_kbps: number; p99_min_kbps: number };
  branch_b: { p99_min_kbps: number; p50_min_kbps: number; envs_required: number };
  branch_c_trigger: { p99_max_kbps: number };
  borderline_pct: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  branch_a: { p50_min_kbps: 200, p95_min_kbps: 150, p99_min_kbps: 100 },
  branch_b: { p99_min_kbps: 100, p50_min_kbps: 150, envs_required: 2 },
  branch_c_trigger: { p99_max_kbps: 100 },
  borderline_pct: 5,
};

export type EnvResult = { env: string; p50: number; p95: number; p99: number };

export type BranchVerdict =
  | { branch: "A"; rationale: string }
  | { branch: "B"; rationale: string }
  | { branch: "C"; rationale: string }
  | { branch: "borderline-A→B"; rationale: string; cutoff: number; observed: number }
  | { branch: "borderline-B→C"; rationale: string; cutoff: number; observed: number };

export function deriveBranch(envs: EnvResult[], t: Thresholds = DEFAULT_THRESHOLDS): BranchVerdict {
  if (envs.length === 0) {
    return { branch: "C", rationale: "no environments measured — defaulting to glyph-only" };
  }
  // Branch C trigger: p99 < cutoff in ANY env (D-09).
  const branchCOffender = envs.find((e) => e.p99 < t.branch_c_trigger.p99_max_kbps);
  if (branchCOffender) {
    const borderlineFloor = t.branch_c_trigger.p99_max_kbps * (1 - t.borderline_pct / 100);
    if (branchCOffender.p99 >= borderlineFloor) {
      return {
        branch: "borderline-B→C",
        rationale: `${branchCOffender.env} p99=${branchCOffender.p99} within ±${t.borderline_pct}% of cutoff ${t.branch_c_trigger.p99_max_kbps} → safe-downgrade to C`,
        cutoff: t.branch_c_trigger.p99_max_kbps,
        observed: branchCOffender.p99,
      };
    }
    return {
      branch: "C",
      rationale: `${branchCOffender.env} p99=${branchCOffender.p99} < ${t.branch_c_trigger.p99_max_kbps} → glyph-only, raster deferred Phase 13`,
    };
  }
  // Branch A: ALL envs pass tight envelope (p50 AND p95 AND p99).
  const allA = envs.every(
    (e) =>
      e.p50 >= t.branch_a.p50_min_kbps &&
      e.p95 >= t.branch_a.p95_min_kbps &&
      e.p99 >= t.branch_a.p99_min_kbps,
  );
  if (allA) {
    // Borderline check: any single metric within ±5% of A cutoff (D-12).
    const tight = envs.find(
      (e) =>
        e.p50 < t.branch_a.p50_min_kbps * (1 + t.borderline_pct / 100) ||
        e.p95 < t.branch_a.p95_min_kbps * (1 + t.borderline_pct / 100) ||
        e.p99 < t.branch_a.p99_min_kbps * (1 + t.borderline_pct / 100),
    );
    if (tight) {
      return {
        branch: "borderline-A→B",
        rationale: `${tight.env} within ±${t.borderline_pct}% of A cutoff → safe-downgrade to B`,
        cutoff: t.branch_a.p50_min_kbps,
        observed: tight.p50,
      };
    }
    return { branch: "A", rationale: "all envs pass A envelope (p50≥200 AND p95≥150 AND p99≥100)" };
  }
  // Branch B: p99 ≥100 OR p50 ≥150 in at least 2 envs.
  const bEligible = envs.filter(
    (e) => e.p99 >= t.branch_b.p99_min_kbps || e.p50 >= t.branch_b.p50_min_kbps,
  );
  if (bEligible.length >= t.branch_b.envs_required) {
    return {
      branch: "B",
      rationale: `${bEligible.length}/${envs.length} envs meet B criteria → raster opt-in, glyph default`,
    };
  }
  return {
    branch: "C",
    rationale: "neither A envelope nor B criteria met → glyph-only",
  };
}

// Queue depth tier mapping (D-10) — separate helper since it's a different metric domain.
export type QueueDepthTier = "A" | "B" | "C";
export function deriveQueueDepthTier(measuredMaxQueue: number): {
  tier: QueueDepthTier;
  rationale: string;
} {
  if (measuredMaxQueue <= 2) {
    return { tier: "A", rationale: `queue ≤2 sustained (measured=${measuredMaxQueue}) → Branch A` };
  }
  if (measuredMaxQueue === 3) {
    return {
      tier: "B",
      rationale: `queue=3 occasional → Branch B (adaptive fps Layer 6 + warning chip Status HUD footer)`,
    };
  }
  return {
    tier: "C",
    rationale: `queue ≥4 (measured=${measuredMaxQueue}) → Branch C automatic degrade`,
  };
}
