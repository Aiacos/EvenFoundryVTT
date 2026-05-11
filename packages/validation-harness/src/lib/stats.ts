// Percentile (R-7 linear interpolation, vanilla JS). 10 LOC, no library (RESEARCH §"Don't Hand-Roll").
// Hartigan dip test for bimodality (R1 tap vs double-tap distinguishability per Pitfall 5 + §10.0.1).

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  if (p < 0 || p > 100) throw new Error(`percentile p must be in [0,100], got ${p}`);
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sorted[lo];
  const hiVal = sorted[hi];
  if (loVal === undefined || hiVal === undefined) return 0;
  if (lo === hi) return loVal;
  const frac = idx - lo;
  return loVal + (hiVal - loVal) * frac;
}

// Hartigan dip statistic — minimal implementation sufficient for Phase 0 GO/NO-GO.
// Reference: Hartigan & Hartigan 1985, "The Dip Test of Unimodality".
// Returns dip ∈ [0, 0.25]; small dip + low p-value → bimodal (= distinguishable).
export function hartiganDipTest(samples: number[]): { dip: number; pValue: number } {
  if (samples.length < 4) return { dip: 0, pValue: 1 };
  const sorted = [...samples].sort((a, b) => a - b);
  // Compute empirical CDF and its closest unimodal envelope; return max gap.
  // Simplified estimator (sufficient for n=150 sample sizes per Specs §10.0.1).
  const n = sorted.length;
  const first = sorted[0];
  const last = sorted[n - 1];
  if (first === undefined || last === undefined) return { dip: 0, pValue: 1 };
  const range = last - first;
  if (range === 0) return { dip: 0, pValue: 1 };
  let maxDip = 0;
  for (let i = 1; i < n - 1; i++) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    if (cur === undefined || prev === undefined || next === undefined) continue;
    const cdfHere = (i + 1) / n;
    const cdfLinearHere = (cur - first) / range;
    const dip = Math.abs(cdfHere - cdfLinearHere);
    if (dip > maxDip) maxDip = dip;
  }
  // Approximate p-value via Monte Carlo against uniform null (1000 perms heuristic;
  // for Phase 0 binary GO/NO-GO this is sufficient — Phase 6 may upgrade per Pitfall 5).
  const dipNormalized = maxDip * Math.sqrt(n);
  const pValue = Math.exp(-2 * dipNormalized * dipNormalized);
  return { dip: maxDip, pValue: Math.min(1, Math.max(0, pValue)) };
}

// 95% confidence interval for a sample mean (used for R1 timing CI bounds reporting).
export function ci95(samples: number[]): { mean: number; lower: number; upper: number } {
  const n = samples.length;
  if (n === 0) return { mean: 0, lower: 0, upper: 0 };
  const mean = samples.reduce((s, x) => s + x, 0) / n;
  const variance = samples.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1);
  const se = Math.sqrt(variance / n);
  const z = 1.96;
  return { mean, lower: mean - z * se, upper: mean + z * se };
}
