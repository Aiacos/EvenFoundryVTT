---
phase: 12-v2-voice-ux-tuning
plan: "03"
subsystem: voice
tags: [deepgram, audio-capture, bridge-ws, pino-redact, mic-hygiene, boot-engine]
dependency_graph:
  requires: ["12-01", "12-02", "11-04"]
  provides: ["/v1/audio/stream WS route", "startAudioCapture()", "docs/voice-verification.md", "12-VERIFICATION.md"]
  affects: ["packages/bridge", "packages/g2-app", "deploy/.env.example", "docs/"]
tech_stack:
  added: []
  patterns:
    - "Deepgram Nova-3 Multilingual streaming: wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&punctuate=true&encoding=linear16&sample_rate=16000&channels=1"
    - "Deepgram auth: Authorization: Token <KEY> (NOT Bearer) — canonical Deepgram scheme"
    - "Bridge soft-fail: voice-disabled mode (1011 close) when DEEPGRAM_API_KEY unset"
    - "PCM passthrough: Even Hub SDK delivers Uint8Array (16kHz s16le mono) → forward verbatim via ws.send() (no transcoding)"
    - "Mic-state hygiene: defensive audioControl(false) on unexpected WS close (T-12-09)"
    - "Boot-engine voice-cap gate: zero-cost when capability handshake lacks 'voice'"
    - "pino redact extension: apiKey, deepgramKey, *.apiKey, *.deepgramKey"
    - "_wsFactory + _bridgeFactory DI injection for test mocking (Phase 11 BridgeClient precedent)"
key_files:
  created:
    - packages/bridge/src/voice/deepgram-stt.ts
    - packages/bridge/src/voice/deepgram-stt.test.ts
    - packages/bridge/src/voice/audio-stream-route.ts
    - packages/bridge/src/voice/audio-stream-route.test.ts
    - packages/bridge/src/__tests__/voice-secret-redact.test.ts
    - packages/g2-app/src/engine/audio-capture.ts
    - packages/g2-app/src/engine/audio-capture.test.ts
    - docs/voice-verification.md
    - .planning/phases/12-v2-voice-ux-tuning/12-VERIFICATION.md
  modified:
    - packages/bridge/src/server.ts
    - packages/g2-app/src/internal/boot-engine-core.ts
    - deploy/.env.example
    - .planning/STATE.md
    - .planning/ROADMAP.md
decisions:
  - "Deepgram auth: 'Authorization: Token <KEY>' — NOT 'Bearer'. Canonical Deepgram scheme verified via deepgram-node-sdk README (D-12-01 research, 12-03 PLAN.md §2)"
  - "PCM passthrough: no transcoding — Even Hub SDK delivers 16kHz s16le mono PCM (Specs.md §3.5). Deepgram encoding=linear16 at 16000Hz 1ch matches verbatim"
  - "Disabled mode soft-fail: close(1011, 'voice-disabled') — mirrors Phase 11 11-04 BridgeClient soft-fail pattern"
  - "SC-12-01 deferred to ADR-0005 Branch A human_needed — same precedent as Phases 4a/4b/7/8/9/10"
metrics:
  duration: "~45 minutes (Task 1: ~25min, Task 2: ~15min, Task 3: auto-approved, Task 4: ~5min)"
  completed_date: "2026-05-17"
---

# Phase 12 Plan 03: Deepgram STT Adapter + Audio Capture + Phase 12 Closure Summary

Deepgram Nova-3 Multilingual streaming adapter on bridge + G2 mic audio capture via EvenAppBridge + integration smoke ISM-12-01..06 + Phase 12 closure artifacts (docs, 12-VERIFICATION, STATE/ROADMAP INV-3 atomic commit).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Deepgram STT adapter + audio-stream-route + bridge wiring + secret-redact gate | e489cca | deepgram-stt.ts, audio-stream-route.ts, server.ts, deploy/.env.example, 3 test files |
| 2 | g2-app audio-capture module + boot-engine wiring + ISM-12-01/06 | 38c7763 | audio-capture.ts, audio-capture.test.ts, boot-engine-core.ts |
| 3 | checkpoint:human-verify — auto-approved | (no commit) | SC-12-01 deferred per defer-hardware-tests precedent |
| 4 | docs/voice-verification.md + 12-VERIFICATION.md + STATE/ROADMAP INV-3 atomic closure | 4106286 | 4 files |
| fix | clarify-detector exactOptionalPropertyTypes compliance (Rule 1 auto-fix) | 82c4d4e | clarify-detector.ts |

## Architecture Delivered

### Bridge: Deepgram STT Adapter (`deepgram-stt.ts`)

```
createDeepgramStt({ apiKey, urlOverride, logger, _wsFactory }) → DeepgramAdapter

DeepgramAdapter.isEnabled() → boolean
DeepgramAdapter.connect(sessionId) → DeepgramStream
  DeepgramStream.sendAudio(Uint8Array) → void
  DeepgramStream.onTranscript(cb) → void
  DeepgramStream.close() → void
```

**URL shipped verbatim:** `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&punctuate=true&encoding=linear16&sample_rate=16000&channels=1`

**Auth header shipped verbatim:** `Authorization: Token <DEEPGRAM_API_KEY>` (NOT Bearer — DG-06 test enforces this)

**Disabled mode:** `apiKey === undefined || apiKey === ''` → `isEnabled()` false → `connect()` returns no-op stream (no WS created). Verified by DG-13.

### Bridge: Audio Stream Route (`audio-stream-route.ts`)

```
registerAudioStreamRoute({ app, deltaEmitter, deepgramStt, tokenCache, logger })

POST /v1/audio/stream (WebSocket upgrade)
  → tokenCache.validate(bearer) — 1008 on failure
  → deepgramStt.isEnabled()? — 1011 'voice-disabled' on false
  → deepgramStt.connect(crypto.randomUUID())
  → binary frames → stream.sendAudio()
  → stream.onTranscript() → VoiceTranscriptPayloadSchema.safeParse → deltaEmitter.emitDelta(R1_VOICE_TRANSCRIPT_TYPE, payload)
  → cleanup on WS close
```

### Bridge: server.ts updates

- pino redact list extended with 4 new field paths (alphabetised insertion): `apiKey`, `deepgramKey`, `*.apiKey`, `*.deepgramKey`
- Step 10 (after /ws at step 9): `createDeepgramStt` + `registerAudioStreamRoute`
- `EVF_DEEPGRAM_URL_OVERRIDE` env var for test injection (no real Deepgram hit in CI)

### G2 App: Audio Capture (`audio-capture.ts`)

```
startAudioCapture({ bridgeUrl, bearer, logger?, _bridgeFactory?, _wsFactory? }) → AudioCaptureHandle

AudioCaptureHandle.start() → Promise<void>
  → bridge.audioControl(true)
  → new WebSocket(ws://bridge/v1/audio/stream, { Authorization: Bearer <bearer> })
  → bridge.onEvenHubEvent → ws.send(audioPcm)
  → T-12-09: unexpected close → audioControl(false)

AudioCaptureHandle.stop() → Promise<void>
  → unsubscribeEventCb()
  → ws.close()
  → bridge.audioControl(false)

AudioCaptureHandle.isCapturing() → boolean
```

### G2 App: boot-engine-core.ts voice-cap gate

Step 12b (after layer-manager mount, before returning handle):
```typescript
if (negotiatedCaps.has('voice' as ServerCap)) {
  audioCaptureHandle = startAudioCapture({ bridgeUrl: opts.bridgeUrl, bearer: opts.token });
  await audioCaptureHandle.start();
}
```
Teardown: `void audioCaptureHandle.stop().catch(...)` added first in teardown chain.

## ISM-12-01..06 Results

| ISM | Description | Status |
|-----|-------------|--------|
| ISM-12-01 | Bridge boots without key → /v1/audio/stream closes 1011 | PASS (ASR-04) |
| ISM-12-02 | Bridge with key + mock URL → accepts upgrade + child WS | PASS (ASR-05..08) |
| ISM-12-03 | Mock Deepgram Results → fans out r1.voice.transcript envelope | PASS (ASR-08 fireResults) |
| ISM-12-04 | VoiceTranscriptPayloadSchema.safeParse on emitted payload succeeds | PASS (VP-01..07 shared-protocol) |
| ISM-12-05 | Pino redact catches DEEPGRAM_API_KEY in 4 field paths — 0 'sk-fake' | PASS (VSR-01..05) |
| ISM-12-06 | audioControl(true) once on start / audioControl(false) once on stop | PASS (AC-01, AC-07) |

## Test Counts (Plan 12-03 contributions)

| Package | Tests added | Test IDs |
|---------|------------|---------|
| bridge | +26 | DG-01..13 (Deepgram adapter), ASR-01..08 (audio-stream-route), VSR-01..05 (secret-redact) |
| g2-app | +14 | AC-01..14 (audio-capture) + ISM-12-01/06 |
| Total added | +40 | |

Workspace total after Plan 12-03: **2280 tests pass** (151 test files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] clarify-detector.ts exactOptionalPropertyTypes TS2375**
- **Found during:** Task 4 verification (pnpm typecheck)
- **Issue:** `resolvedSpellId: id` where `id: string | undefined` fails `exactOptionalPropertyTypes` — cannot assign `undefined` to an optional property with the stricter semantics
- **Fix:** Conditional spread `...(lookup.dnd5eId != null ? { resolvedSpellId: lookup.dnd5eId } : {})`
- **Files modified:** `packages/foundry-mcp/src/voice/clarify-detector.ts`
- **Commit:** 82c4d4e

No other deviations — plan executed as specified.

## STRIDE Threat Dispositions (Phase 12)

| Threat | Status |
|--------|--------|
| T-12-01: audio egress to Deepgram | Accepted — opt-in via key, documented in voice-verification.md §2 |
| T-12-02: DEEPGRAM_API_KEY log leak | Mitigated — VSR-01..05 GREEN; 4 pino redact paths added |
| T-12-03: hallucinated spell IDs | Mitigated — SPELL_LOOKUP whitelist + SL-08 integrity test |
| T-12-06: WS audio flood | Accepted/deferred to Phase 13 (bearer-gated, single-tenant) |
| T-12-07: unauthorized /v1/audio/stream | Mitigated — tokenCache.validate; ASR-01 GREEN |
| T-12-08: docs key leak | Mitigated — placeholder pattern; gitleaks CI scan |
| T-12-09: mic-on state diverges | Mitigated — AC-10 defensive audioControl(false) on WS close |

## Operator Runbook Coordinates

Full operator verification procedure: `docs/voice-verification.md`

Sections:
1. Deepgram API key acquisition (console.deepgram.com)
2. Bridge env wiring (shell / Docker / systemd)
3. /v1/audio/stream route verification (wscat snippets)
4. SC-12-01 hardware measurement (p50 ≤ 800ms target, 10 utterances)
5. Claude Desktop wiring with GM_AGENT_SYSTEM_PROMPT

## Phase 12 Closure Commit

INV-3 atomic closure commit: **4106286** — covers `docs/voice-verification.md`, `.planning/phases/12-v2-voice-ux-tuning/12-VERIFICATION.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` in a single commit (mirrors Phase 11 11-04 precedent commit b10c95c, b4d5260).

Verification: `git show --name-only 4106286` lists all 4 files.

## 14-Socketlib-Handler Invariant

Phase 12 touches NOTHING in `packages/foundry-module/`. Count confirmed: **14** (`grep -c 'socketlib.registerComplexHandler' packages/foundry-module/src/pair/socketlib-handlers.ts`).

## Hardware-Pending SC

| SC | Status | Target |
|----|--------|--------|
| SC-12-01 | human_needed (ADR-0005 Branch A) | Real G2 + R1 + Deepgram, p50 ≤ 800ms |

Running total: 32 (Phase 10) + 1 (Phase 12) = **33 hardware-pending SCs**.

## Phase 13 Handoff

V2 voice path is software-complete. The full chain is operational at the software layer:

```
G2 mic (EvenAppBridge.audioControl + onEvenHubEvent)
  → audio-capture.ts (g2-app)
  → /v1/audio/stream (bridge WS)
  → Deepgram Nova-3 Multilingual (bridge → deepgram-stt.ts)
  → VoiceTranscriptPayload (shared-protocol)
  → DeltaEmitter.emitDelta(R1_VOICE_TRANSCRIPT_TYPE)
  → foundry-mcp BridgeClient (Phase 11)
  → GM_AGENT_SYSTEM_PROMPT + spell-lookup + clarify-detector (Phase 12-01/02)
  → Claude Desktop MCP tool calls (cast-spell, weapon-attack, etc.)
```

Phase 13 (V2 Stretch) is unblocked pending SC-12-01 hardware verification. Resume: `/gsd-plan-phase 13` once G2 + R1 + Deepgram key are available for the 800ms latency gate.

## Self-Check: PASSED

- `docs/voice-verification.md`: EXISTS
- `.planning/phases/12-v2-voice-ux-tuning/12-VERIFICATION.md`: EXISTS
- `packages/bridge/src/voice/deepgram-stt.ts`: EXISTS
- `packages/bridge/src/voice/audio-stream-route.ts`: EXISTS
- `packages/g2-app/src/engine/audio-capture.ts`: EXISTS
- Commits e489cca, 38c7763, 4106286, 82c4d4e: ALL PRESENT in git log
- `pnpm vitest run`: 2280 tests pass (151 files)
- `pnpm typecheck`: exit 0
- `pnpm lint:ci`: exit 0 (warnings only)
- 14-socketlib-handler count: 14
- DEEPGRAM_API_KEY grep gate: 0 runtime references outside bridge/voice/ and deploy/.env.example
