/**
 * Voice transcript wire-protocol payload schema — Phase 12 Plan 02 Task 1.
 *
 * Defines the payload shape for `r1.voice.transcript` envelopes emitted by the Bridge
 * when the Deepgram Nova-3 STT adapter produces a transcript from G2 mic audio.
 * The `foundry-mcp` MCP server validates incoming envelopes at the WS-receive trust
 * boundary using the double trust boundary pattern (outer `EnvelopeSchema.safeParse`
 * + inner `VoiceTranscriptPayloadSchema.safeParse`).
 *
 * # Producer and consumer
 *
 * **Producer:** `packages/bridge/src/voice/deepgram-stt.ts` (Plan 12-03). The Deepgram
 * adapter emits bridge-side `Date.now()` in `timestamp` and remaps Deepgram's
 * `is_final` to `isFinal` (camelCase). The DEEPGRAM_API_KEY lives ONLY in the bridge
 * voice module — never in this schema file (T-12-LEAK-01 enforced by grep gate).
 *
 * **Consumer:** `foundry-mcp` MCP server — the transcript flows bridge → MCP server →
 * Claude Desktop via MCP tool invocation. It does NOT flow bridge → g2-app; the g2-app
 * never receives or parses voice transcripts (the audio pipeline is bridge-internal).
 * This is intentional: Phase 12 is a V2 optional layer that leaves the g2-app MVP
 * completely unchanged.
 *
 * # Wire type constant
 *
 * Uses `r1.voice.transcript` following the `r1.` prefix convention for client-side
 * input events (see `R1_GESTURE_TYPE`, `R1_ACTION_RESULT_TYPE`, etc.). The `r1.`
 * prefix in this codebase means "client-side input event," not literally "R1 ring."
 *
 * # Strict object (T-12-WIRE-01)
 *
 * `z.object(...).strict()` rejects extra fields at the WS-receive boundary — same
 * pattern as R1GesturePayloadSchema (Phase 6 Plan 01) and ConcConflictPayloadSchema
 * (Phase 4b). This prevents a future Deepgram SDK version from injecting unvalidated
 * fields into the payload object.
 *
 * @see Specs.md §3.5 (G2 audio capture — even Hub audioEvent / PCM path)
 * @see Specs.md §4.7 (MCP transport decisions)
 * @see ./r1.ts (R1GesturePayloadSchema — strict-object precedent)
 * @see .planning/phases/12-v2-voice-ux-tuning/12-02-PLAN.md Task 1
 * @see .planning/phases/12-v2-voice-ux-tuning/12-03-PLAN.md (deepgram-stt.ts producer)
 */
import { z } from 'zod';

/**
 * Wire-protocol discriminant for voice transcript envelopes.
 *
 * Routed on `envelope.type` by the foundry-mcp MCP server WS handler. The Bridge
 * emits this type string when the Deepgram Nova-3 adapter produces a final or
 * interim transcript from the G2 mic audio stream.
 *
 * Naming: `r1.voice.transcript` follows the `r1.`-prefix convention for client-side
 * input events. The `r1.` here does NOT mean "R1 ring" — it means "runtime event
 * from the client side of the bridge" (see R1_PERF_SAMPLE_TYPE, R1_ACTION_RESULT_TYPE,
 * R1_MOVEMENT_BUDGET_TYPE for precedent where non-ring events share the prefix).
 */
export const R1_VOICE_TRANSCRIPT_TYPE = 'r1.voice.transcript' as const;

/**
 * Voice transcript wire-payload schema.
 *
 * Strict-object: extra fields are rejected (T-12-WIRE-01). Validates the `payload`
 * field inside a `r1.voice.transcript` {@link EnvelopeSchema} envelope.
 *
 * Fields:
 * - `transcript`  — STT-returned text. Non-empty (min(1) rejects the empty-string
 *                   case that Deepgram can emit for silence-detected segments).
 * - `confidence`  — Provider-reported confidence in [0..1]. Deepgram Nova-3 returns
 *                   a float in this range; values outside are a provider error.
 * - `language`    — Deepgram-detected language code. `'multi'` indicates code-switching
 *                   (IT + EN mixed sentence). `'unknown'` is emitted for very short or
 *                   ambiguous segments where Nova-3's language detection is not confident.
 * - `isFinal`     — Whether this is a final transcript (vs interim/partial). Only final
 *                   transcripts are forwarded to the detectClarify resolver and the
 *                   GM-Agent prompt. Interim results are consumed by the bridge for
 *                   latency UX (toast flash) only.
 * - `timestamp`   — Bridge-side `Date.now()` at envelope emission, ms epoch (integer).
 *                   Matches the Phase 6 R1GesturePayload `timestamp` precedent.
 *
 * @see R1_VOICE_TRANSCRIPT_TYPE
 * @see .planning/phases/12-v2-voice-ux-tuning/12-02-PLAN.md (T-12-WIRE-01)
 */
export const VoiceTranscriptPayloadSchema = z
  .object({
    /** STT-returned transcript text. Non-empty. */
    transcript: z.string().min(1),
    /** Provider-reported confidence 0..1. */
    confidence: z.number().min(0).max(1),
    /** Deepgram-detected language code (`'multi'` for code-switching). */
    language: z.enum(['it', 'en', 'multi', 'unknown']),
    /** Whether this is a final transcript (vs interim). */
    isFinal: z.boolean(),
    /** Bridge-side Date.now() at envelope emission, ms epoch. */
    timestamp: z.number().int(),
  })
  .strict();

export type VoiceTranscriptPayload = z.infer<typeof VoiceTranscriptPayloadSchema>;
