/**
 * keyterm-sanitizer — pure "minimal damage" normalisation pass for the
 * Deepgram Keyterm Prompting retry path.
 *
 * Phase 15 Plan 04 Task 1. Zero SDK dependencies, zero side effects, zero I/O.
 *
 * ## Why sanitize?
 *
 * CONTEXT D-06 lock: when Deepgram closes a streaming session with a
 * keyterm-reject close code (1007 invalid-payload-data, 1008 policy-violation,
 * or any code in the application range 4000-4999), the most likely cause is
 * a malformed keyterm — embedded control chars, oversized whitespace, or a
 * stray non-printable byte. Rather than fail-closing the entire voice path,
 * the Phase 15 adapter retries ONCE with a sanitized form; if the retry also
 * fails, it falls back to a no-keyterm baseline URL (Phase 12 functionality
 * preserved).
 *
 * ## Algorithm (minimal damage)
 *
 * For each input string, in order:
 *
 *   1. Strip ASCII control chars (0x00-0x1F + 0x7F DEL). These are the
 *      "obvious garbage" surface — terminals, file-byte boundaries, accidental
 *      NUL terminators from C-bridge encodings. We do NOT strip the full
 *      Unicode control plane because IT/EN spell names use legitimate
 *      Unicode letters (è, ô, etc.) that Deepgram accepts natively.
 *   2. Collapse runs of internal whitespace (`/\s+/g`) into a single space.
 *      This handles tabs, newlines, no-break spaces (U+00A0), and other
 *      Unicode whitespace categories — Deepgram's tokeniser tends to choke
 *      on multi-space sequences but tolerates a single internal space.
 *   3. Trim leading/trailing whitespace.
 *   4. Drop terms shorter than 2 characters after normalisation. Single-char
 *      terms have near-zero keyterm value — they're either real transcription
 *      artefacts (e.g. a stray 'a' from STT) or accidental garbage. The
 *      empty string is also dropped (length 0 fails the `>=2` check).
 *
 * After the per-term loop, the output is capped at {@link DEEPGRAM_KEYTERM_LIMIT}
 * (first-N wins — same ordering policy as `buildKeytermList`).
 *
 * ## Idempotency
 *
 * The sanitizer is idempotent: feeding its output back in returns the same
 * array. SAN-05 asserts this contract — it lets the failure-mode path safely
 * sanitize a list that may have been partially sanitized upstream.
 *
 * ## What this module does NOT do
 *
 * - No Unicode normalisation (NFC/NFD/NFKC/NFKD). Deepgram handles UTF-8
 *   natively and our spell names already ship in canonical NFC form.
 * - No case folding. Casing is preserved verbatim — the upstream
 *   `buildKeytermList` already dedupes case-insensitively; the sanitizer
 *   does not need a second pass.
 * - No semantic filtering (e.g., "drop terms that look like SQL injection").
 *   The threat is malformed bytes, not malicious content — Deepgram does not
 *   evaluate keyterm strings as code.
 *
 * @see ./keyterm-merger.ts (production producer; DEEPGRAM_KEYTERM_LIMIT source)
 * @see ./deepgram-stt.ts (failure-mode consumer; retry path)
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-CONTEXT.md D-06
 * @see .planning/phases/EVF-15-deepgram-keyterm-prompting-entity-pack-integration/15-04-PLAN.md Task 1
 */

import { DEEPGRAM_KEYTERM_LIMIT } from './keyterm-merger.js';

/**
 * Normalise a keyterm list for the Deepgram retry path.
 *
 * Pure function — no I/O, no logging, no shared mutable state. Idempotent
 * (SAN-05).
 *
 * @param input - The raw keyterm list (typically the output of `buildKeytermList`
 *   that Deepgram rejected on first attempt). `ReadonlyArray<string>` so the
 *   caller's array is never mutated.
 * @returns A fresh mutable `string[]` containing each surviving term with
 *   control chars stripped, internal whitespace collapsed, leading/trailing
 *   whitespace trimmed, and the cap applied. Dropped terms are not present.
 *   The result may be empty.
 */
export function sanitizeKeyterms(input: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (const raw of input) {
    // Step 1: strip ASCII control chars (0x00-0x1F + 0x7F DEL).
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — we are deliberately stripping ASCII control chars per CONTEXT D-06.
    const noControls = raw.replace(/[\x00-\x1F\x7F]/g, '');
    // Step 2: collapse runs of whitespace (any Unicode whitespace) to single space.
    const collapsed = noControls.replace(/\s+/g, ' ');
    // Step 3: trim.
    const trimmed = collapsed.trim();
    // Step 4: drop <2-char terms (covers empty-after-trim uniformly).
    if (trimmed.length < 2) continue;
    out.push(trimmed);
    // Early-exit once cap is reached — first-N wins, matches buildKeytermList's
    // truncation policy (CONTEXT D-04).
    if (out.length >= DEEPGRAM_KEYTERM_LIMIT) break;
  }
  return out;
}
