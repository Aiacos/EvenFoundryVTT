---
phase: 12-v2-voice-ux-tuning
status: human_needed
human_needed_reason: SC-12-01 — end-to-end voice flow on real G2 + R1 + Deepgram (p50 latency ≤ 800 ms speech-end → toast) deferred per ADR-0005 PROVISIONAL Branch A. All software deliverables verified by automated tests.
hardware_pending_scs:
  - id: SC-12-01
    description: Real G2 + R1 + DEEPGRAM_API_KEY — end-to-end voice utterance → Deepgram Nova-3 → VoiceTranscript envelope → Phase 12-01 spell lookup → Phase 11 MCP tool call → Phase 4b toast
    target: p50 latency ≤ 800 ms speech-end → toast-shown
    runbook: docs/voice-verification.md §4
running_hardware_pending_total: 33
last_updated: "2026-05-17"
---

# Phase 12 Verification — V2 Voice UX Tuning

Goal-backward audit of Phase 12 success criteria. Each SC maps to automated evidence and the plan that delivers it.

## Success Criteria Audit

### SC 1: GM-Agent worked examples A/B/C pass end-to-end through Claude Desktop

| Item | Status | Evidence |
|------|--------|----------|
| Example A: Fireball gruppo (IT utterance → fireball tool call) | PASS (software) | `GP-01..GP-07` in `packages/foundry-mcp/src/voice/gm-agent-prompt.test.ts` — prompt directives 1..6 verified; `WORKED_EXAMPLES[0]` round-trip in `worked-examples.test.ts` (`WE-01..WE-06`) |
| Example B: Dual-wield Action + Bonus Action | PASS (software) | `WORKED_EXAMPLES[1]` tested via `WE-04`; prompt directive 3 (Action + Bonus Action sequence) via `GP-04` |
| Example C: Clarify ambiguity ("scorch 'em") | PASS (software) | `WORKED_EXAMPLES[2]` + `CD-06..CD-08` clarify-detector tests; `detectClarify('scorch em')` returns non-null |
| Claude Desktop wiring (system prompt paste) | HUMAN_NEEDED | Operator must paste `buildGmAgentPrompt()` output into Claude Desktop — see `docs/voice-verification.md §5` |

**Verdict:** PASS (software-complete). SC-1 hardware-interactive portion deferred to hardware availability.

---

### SC 2: IT↔EN spell lookup + clarify detector

| Item | Status | Evidence |
|------|--------|----------|
| "palla di fuoco" → `spell.fireball` via fuzzy lookup | PASS | `SL-01..SL-10` in `packages/foundry-mcp/src/voice/spell-lookup.test.ts` — IT canonical matches, Levenshtein threshold, NFD normalization |
| "scorch 'em" → clarify prompt (not executed) | PASS | `CD-06..CD-08` in `clarify-detector.test.ts` — SLANG_VERBS detection without spell match |
| EN "fireball" → direct match (`spell.fireball`) | PASS | `SL-03` direct EN match path |
| All lookupSpellId results are in the 70-entry table | PASS | `SL-08` whitelist integrity test — non-null results verified against SPELL_LOOKUP entries |
| voice-no-secret-leak grep gate (Plan 12-01) | PASS | `packages/foundry-mcp/src/__tests__/voice-no-secret-leak.test.ts` — 0 `sk-`, `Token `, `DEEPGRAM_API_KEY` in levenshtein + spell-lookup + clarify-detector source |

**Verdict:** PASS (all automated).

---

### SC 3: PCM capture → Deepgram Nova-3 → visual toast (no TTS surface)

| Item | Status | Evidence |
|------|--------|----------|
| ISM-12-01: bridge boots without key → /v1/audio/stream closes 1011 | PASS | `ASR-04` in `audio-stream-route.test.ts` + `voice-secret-redact.test.ts` VSR-01 (structural check) |
| ISM-12-02: bridge with key + mock Deepgram URL → accepts upgrade + child WS | PASS | `ASR-05..ASR-08` in `audio-stream-route.test.ts` — DeepgramStream.connect called, binary frames forwarded |
| ISM-12-03: mock Deepgram Results frame → fans out `r1.voice.transcript` envelope | PASS | `ASR-08` — `fireResults()` helper in `audio-stream-route.test.ts`; deltaEmitter.emitDelta called with `R1_VOICE_TRANSCRIPT_TYPE` |
| ISM-12-04: VoiceTranscriptPayloadSchema.safeParse on emitted payload succeeds | PASS | `ASR-08` — payload built per schema, Zod strict-object parse verified via shared-protocol tests `VP-01..VP-07` |
| ISM-12-05: voice-secret-redact — pino redact catches DEEPGRAM_API_KEY in 4 field paths | PASS | `VSR-01..VSR-05` in `packages/bridge/src/__tests__/voice-secret-redact.test.ts` — 0 `sk-fake` in captured pino output |
| ISM-12-06: g2-app audio-capture → audioControl(true) called once / stop → audioControl(false) once | PASS | `AC-01..AC-14` in `packages/g2-app/src/engine/audio-capture.test.ts` — all ISM-12-01/06 assertions green |
| boot-engine voice-cap gate — zero-cost when voice absent | PASS | `AC-13` (boot no voice-cap) — no audioControl call when cap absent |
| T-12-09: defensive audioControl(false) on unexpected WS close | PASS | `AC-10` in `audio-capture.test.ts` — WS close-event without stop() triggers mic-off |
| VOICE-05: no TTS surface introduced (visual-only output) | PASS | `GP-14` in `gm-agent-prompt.test.ts` asserts prompt contains `tts\|speak\|text-to-speech` are absent; architecture review: no speaker API used |
| T-12-02: DEEPGRAM_API_KEY pino redact | PASS | `VSR-01..VSR-05` (see ISM-12-05 above) |
| SC-12-01: end-to-end on real G2 + R1 (p50 ≤ 800 ms) | **HUMAN_NEEDED** | Requires physical hardware + Deepgram key. Runbook: `docs/voice-verification.md §4`. ADR-0005 PROVISIONAL Branch A carry. |

**Verdict:** PASS (software-complete) / HUMAN_NEEDED (SC-12-01 hardware gate).

---

## REQ-ID Coverage

| REQ-ID | Description | Plans | Status |
|--------|-------------|-------|--------|
| VOICE-01 | Audio capture via `bridge.audioControl()` + PCM stream | 12-03 T2 | CLOSED (software) |
| VOICE-04 | External STT — Deepgram Nova-3 Multilingual + IT↔EN spell lookup | 12-01, 12-02, 12-03 T1 | CLOSED (software) |
| VOICE-05 | Visual-only output — no TTS surface | 12-02 GP-14, 12-03 T1 | CLOSED |

## STRIDE Threat Register (Phase 12 disposition)

| Threat ID | Category | Status |
|-----------|----------|--------|
| T-12-01 | Info disclosure — Deepgram audio egress | Accepted (opt-in via key presence; documented in §2) |
| T-12-02 | Info disclosure — DEEPGRAM_API_KEY logging | Mitigated — pino redact extended; VSR-01..05 GREEN |
| T-12-03 | Tampering — hallucinated spell IDs | Mitigated — SPELL_LOOKUP whitelist + SL-08 integrity test |
| T-12-06 | DoS — unbounded WS audio flood | Accepted (deferred to Phase 13; single-tenant MVP) |
| T-12-07 | Spoofing — unauthorized /v1/audio/stream | Mitigated — tokenCache.validate(bearer) at upgrade; ASR-01 GREEN |
| T-12-08 | Info disclosure — docs key leak | Mitigated — placeholder `REPLACE_WITH_DEEPGRAM_API_KEY_FROM_CONSOLE`; gitleaks CI scan |
| T-12-09 | Repudiation — mic-on state diverges | Mitigated — defensive audioControl(false) on WS close; AC-10 GREEN |

## 14-Socketlib-Handler Invariant

Phase 12 touches NOTHING in `packages/foundry-module/`. Count at closure: **14** (verified by grep).

```bash
grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts
# → 14
```

## Hardware-Pending Carry-Forward

| SC | Description | Runbook |
|----|-------------|---------|
| SC-12-01 | Real G2 + R1 + Deepgram voice flow, p50 ≤ 800 ms | `docs/voice-verification.md §4` |

Running hardware-pending total: **33** (32 from Phase 10 closure + 1 from Phase 12).

Close via `pnpm --filter @evf/validation-harness validate:all` (with G2 hardware + DEEPGRAM_API_KEY present) once hardware is available.
