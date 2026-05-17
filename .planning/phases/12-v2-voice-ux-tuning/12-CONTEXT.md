# Phase 12: V2 Voice UX Tuning — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Source:** smart-discuss (autonomous batch — 1 area accepted, STT provider = Deepgram Nova-3)

<domain>
## Phase Boundary

Tune the voice path: GM-Agent system prompt + 3 worked examples + IT↔EN STT spell-name fuzzy lookup robust against accent and code-switching.

Audio capture path (already in place from Phase 11):
- G2 4-mic array → `bridge.audioControl(true)` → PCM 16 kHz s16le mono → bridge → STT (Deepgram Nova-3 Multilingual).
- STT transcript → MCP tool dispatch via Claude Desktop (Phase 11).
- Result → visual toast on G2 (NO audio output — G2 has no speaker).

**Ships:**
- `packages/foundry-mcp/src/voice/` subdirectory:
  - `gm-agent-prompt.ts` — system prompt for the GM-Agent LLM.
  - `worked-examples.ts` — 3 worked examples A/B/C as Markdown few-shot prompts.
  - `spell-lookup.ts` — IT↔EN fuzzy spell-name lookup table + Levenshtein fallback.
  - `clarify-detector.ts` — detects ambiguous user input requiring clarify prompt.
- `packages/bridge/src/voice/deepgram-stt.ts` — Deepgram Nova-3 Multilingual STT adapter. WebSocket streaming to api.deepgram.com.
- `packages/shared-protocol/src/payloads/voice.ts` — `R1_VOICE_TRANSCRIPT_TYPE` envelope (transcript text + confidence + language).
- `packages/g2-app/src/engine/audio-capture.ts` — wires Even Hub `bridge.audioControl(true)` → PCM stream → bridge WS upload.
- New REQ closures: **VOICE-01** (audio capture), **VOICE-04** (external STT), **VOICE-05** (visual-only output).

**NOT in scope:**
- ASR for non-spell vocabulary (only spell-name fuzzy lookup is in scope; general action parsing is Claude's job via Phase 11 tools).
- Self-hosted Whisper (deferred per user STT choice = Deepgram Nova-3).
- Voice command for non-cast actions (multi-attack, move, etc. — Claude infers via tool descriptions in Phase 11).

</domain>

<decisions>
## Implementation Decisions

### STT Provider: Deepgram Nova-3 Multilingual

- WebSocket streaming endpoint: `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&punctuate=true`.
- API key via env: `DEEPGRAM_API_KEY`.
- Latency target: ~300ms first transcript chunk; final transcript ~600ms after speech end.
- Code-switching: Nova-3 Multilingual handles IT↔EN in same utterance natively (verified per Specs.md §3.6).

### GM-Agent System Prompt

Lives in `packages/foundry-mcp/src/voice/gm-agent-prompt.ts`. Core directives:
- "You are the GM-Agent for a D&D 5e session via Foundry VTT."
- Always confirm spell name + target before tool invocation.
- Code-switch tolerance: accept IT spell names (`palla di fuoco`) and EN (`fireball`); always normalize to dnd5e canonical IDs.
- When ambiguous (e.g., "scorch 'em"), issue clarify prompt to user via toast — DO NOT execute.
- Reference Phase 11 MCP tools by name.

### 3 Worked Examples (few-shot in system prompt)

- **A:** *"Cast Fireball at the gobbi cluster"* → identify spell `fireball` (IT/EN fuzzy match) → identify target group (`combat://current` resource) → invoke `cast-spell` with template placement → result toast.
- **B:** *"Two-weapon attack — shortsword and dagger"* → identify multi-attack (Action + Bonus) → invoke `weapon-attack` for shortsword (Action) → invoke `weapon-attack` for dagger (Bonus) → result toasts × 2.
- **C:** *"Toast the lot"* → ambiguous (which spell? which targets?) → clarify prompt toast: "Quale incantesimo? Specifica con nome canonico".

### Spell Lookup (IT↔EN Fuzzy)

- Lookup table: `Record<string, dnd5eSpellId>` covering the ~70 most common D&D 5e SRD spells.
- IT variant included: e.g., `palla di fuoco → fireball`, `cura ferite di massa → mass-cure-wounds`, `scudo → shield`.
- Levenshtein fallback (distance ≤ 2) for accent / typo handling.
- If no match within distance ≤ 2: emit clarify prompt.

### Clarify Detector

Heuristics:
- Slang verbs without target ("scorch 'em", "blast them") → clarify.
- No spell name in transcript → clarify.
- Multiple possible spell matches (Levenshtein tie) → clarify with options.

### Audio Capture (G2 → bridge)

- `packages/g2-app/src/engine/audio-capture.ts` — wraps `bridge.audioControl(true)`.
- PCM 16 kHz s16le mono → 20ms frames → WebSocket upload to bridge `/v1/audio/stream` endpoint.
- Bridge forwards to Deepgram.
- Stops on `bridge.audioControl(false)` (e.g., long-press shortcut to toggle voice mode).

### Plan Decomposition (anticipated)

| Wave | Plan | Title |
|------|------|-------|
| 0 | 12-01 | Spell lookup table (IT↔EN ~70 spells) + Levenshtein fuzzy match + clarify-detector + unit tests |
| 1 | 12-02 | GM-Agent system prompt + 3 worked examples + voice transcript envelope + unit tests for examples A/B/C |
| 2 | 12-03 | Deepgram Nova-3 STT adapter (bridge) + audio-capture (g2-app) + integration smoke + Phase 12 closure |

3 plans, sequential. Phase 12 is small.

### Threat Model

- T-12-01 STT data egress (audio sent to Deepgram cloud). Mitigated: docs explicitly state external STT + privacy implications + opt-out flag.
- T-12-02 Deepgram API key leak. Mitigated: env var only, never logged; redaction in pino logger.
- T-12-03 Hallucinated spell IDs. Mitigated: clarify-detector + canonical-ID validation before MCP tool invocation.

### Hardware-pending SC

- **SC-12-01:** End-to-end voice flow on real G2 + R1 + Deepgram (latency p50 target ≤ 800ms speech-end → toast).
- 1 SC carry-forward to ADR-0005 Branch A. Running project total: **32 + 1 = 33 hardware-pending**.

</decisions>

<canonical_refs>
- Specs.md §3.6 (Native EvenAI non-API + external STT recommendation)
- Specs.md §4.7 (MCP architecture — Phase 11)
- Specs.md §5.7 (Voice UX architecture)
- Specs.md §7.15.2 (Toast for voice results)
- packages/foundry-mcp/src/server-factory.ts (Phase 11)
- packages/foundry-mcp/src/tools/register-tools.ts (Phase 11 — Claude calls these)
- packages/bridge/src/server.ts (Phase 3/7 — extend with /v1/audio/stream)
- deepgram.com/learn/streaming-audio-protocol (canonical API doc)

</canonical_refs>

<deferred>
- Self-hosted Whisper (alternative STT) — V3+ if cloud cost or privacy is a concern.
- Voice command for non-cast actions — V3+ (Claude infers via MCP tool descriptions).
- TTS / audio output — out of scope (G2 has no speaker per Specs.md §3.1).

</deferred>

---

*Phase 12 context — 2026-05-17 via smart-discuss (1 area, STT = Deepgram Nova-3)*
