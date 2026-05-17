/**
 * Levenshtein edit distance + accent-insensitive normalisation.
 *
 * Phase 12 Plan 01 Task 1.
 *
 * Two primitives:
 * - `levenshteinDistance(a, b)`: iterative O(m×n) DP over code-point arrays
 *   (built via `[...a]` / `[...b]`) — mirrors Phase 5 `padRightUnicode` precedent
 *   so multi-byte characters cost 1, not 2–3.
 * - `normaliseForFuzzyMatch(s)`: NFD + strip combining marks + lowercase +
 *   collapse-whitespace — accent-insensitive matching so `velocità`, `velocita`,
 *   and `Velocita` all hash to the same canonical key before distance calculation.
 *
 * No external dependencies. Pure arithmetic — no floating-point math.
 *
 * @see spell-lookup.ts (normalises both sides before Levenshtein call)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-01-PLAN.md Task 1
 */

/**
 * Compute the Levenshtein edit distance between two strings.
 *
 * Iterates over code-point arrays (`[...a]`, `[...b]`) so every Unicode
 * code-point (including multi-byte characters like `è`) counts as 1 edit,
 * not 2–3 bytes.
 *
 * Uses the two-row space-optimised variant (O(min(m,n)) space):
 * - `prev[j]` = distance between a[0..i-1] and b[0..j-1]
 * - `curr[j]` = distance between a[0..i] and b[0..j]
 *
 * noUncheckedIndexedAccess guard: every `prev[j] ?? 0` access is guarded
 * with `?? 0` because TypeScript strict mode infers `T | undefined` for
 * array index access under that flag. At runtime the index is always within
 * bounds (we allocate the array to exact size), so the `?? 0` is a defensive
 * no-op with no semantic effect.
 *
 * @param a - First string (accepts empty string → distance = b.length)
 * @param b - Second string (accepts empty string → distance = a.length)
 * @returns Non-negative integer edit distance.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aPoints = [...a];
  const bPoints = [...b];
  const m = aPoints.length;
  const n = bPoints.length;

  // Base cases
  if (m === 0) return n;
  if (n === 0) return m;

  // Initialise previous row: dist(empty, b[0..j-1]) = j
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 0; i < m; i++) {
    // First column: dist(a[0..i], empty) = i + 1
    const curr: number[] = [i + 1];

    for (let j = 0; j < n; j++) {
      // noUncheckedIndexedAccess guard — bounds are guaranteed by array size.
      const deleteCost = (curr[j] ?? 0) + 1;
      const insertCost = (prev[j + 1] ?? 0) + 1;
      const substituteCost = (prev[j] ?? 0) + (aPoints[i] === bPoints[j] ? 0 : 1);
      curr.push(Math.min(deleteCost, insertCost, substituteCost));
    }

    prev = curr;
  }

  return prev[n] ?? 0;
}

/**
 * Normalise a string for fuzzy comparison.
 *
 * Steps (in order):
 * 1. `normalize('NFD')` — decompose accented characters into base + combining marks.
 * 2. `replace(/\p{M}/gu, '')` — strip all combining marks (U+0300..U+036F and beyond).
 * 3. `toLowerCase()` — case-fold.
 * 4. `trim()` — remove leading/trailing whitespace.
 * 5. `replace(/\s+/g, ' ')` — collapse internal multi-space runs to a single space.
 *
 * Result: `'Velocità'` → `'velocita'`, `'  Palla   Di   Fuoco  '` → `'palla di fuoco'`.
 *
 * Unicode property escapes (`\p{M}`) require ES2018 regex target — Vitest + Node 24
 * satisfy this. TypeScript lib should be ES2020+ (already set in foundry-mcp tsconfig).
 *
 * @param s - Input string (empty string is valid → returns empty string).
 * @returns Normalised string suitable for exact-match or Levenshtein comparison.
 */
export function normaliseForFuzzyMatch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
