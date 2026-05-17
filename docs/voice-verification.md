# EVF Voice Path Verification Procedure

Step-by-step verification of the Phase 12 Deepgram Nova-3 voice path.
Target audience: EVF maintainers or a Claude Code session performing verification.
Expected time: < 15 minutes for software smoke; SC-12-01 hardware loop requires G2 + R1 + Deepgram key.

**Hardware-pending SC:** SC-12-01 (end-to-end voice flow on real G2 + Deepgram, p50 latency ≤ 800 ms speech-end → toast) is carried to ADR-0005 PROVISIONAL Branch A `human_needed` until hardware access is available.

## Prerequisites

- Node 24 installed (`node --version` → `v24.x.x`)
- pnpm installed (`pnpm --version` → `10.x.x`)
- All workspace packages built: `pnpm -r build` from repo root
- EVF bridge running (Phase 3 skeleton) with a valid `EVF_BEARER` env var set
- `DEEPGRAM_API_KEY` env var (see §1 below — optional for software-only smoke)

---

## 1. Obtain a Deepgram API Key

> Skip this section if you only need to verify the software-only smoke path (bridge without key, 1011 close).

1. Navigate to <https://console.deepgram.com/> and sign in (or create a free account).
2. Go to **API Keys** → **Create New Key**.
   - Name: `evf-voice-phase12`
   - Scope: `Member` or higher
   - Permission: **Speech** (required for Nova-3 streaming)
3. Copy the key. **Never paste it into source files.** Store in env or systemd EnvironmentFile only.
4. Verify model access: **Projects → Settings → Model Access** — confirm `nova-3` is listed.
   - Free-tier accounts may need explicit Nova-3 enablement; paid tier includes it by default.

---

## 2. Wire the Key to the Bridge

**Option A — Shell (development):**

```bash
export DEEPGRAM_API_KEY=<your-deepgram-key>
export EVF_BEARER=<your-24h-bearer>          # from Phase 2 QR-pairing flow
pnpm --filter @evf/bridge dev
```

**Option B — Docker Compose (production):**

```bash
# Add to deploy/.env (see deploy/.env.example Phase 12 section):
# DEEPGRAM_API_KEY=<your-deepgram-key>
cd deploy/
docker compose up -d --build bridge
```

**Option C — systemd (homelab):**

Add to the bridge `EnvironmentFile`:
```
DEEPGRAM_API_KEY=<your-deepgram-key>
```
Then `systemctl restart evf-bridge`.

**Software-only smoke (no key needed):**

```bash
# Omit DEEPGRAM_API_KEY — bridge boots in voice-disabled mode.
pnpm --filter @evf/bridge dev
```

Expected log line: `[voice] DEEPGRAM_API_KEY not set — voice path disabled (bridge still serves all MVP routes)`

---

## 3. Verify the /v1/audio/stream Route

### 3a. Without DEEPGRAM_API_KEY (voice-disabled path)

```bash
# Requires wscat: npm i -g wscat
wscat -c ws://localhost:8910/v1/audio/stream \
  -H "Authorization: Bearer $EVF_BEARER"
```

Expected: WebSocket closes immediately with code `1011` reason `voice-disabled`.

### 3b. With DEEPGRAM_API_KEY set (voice-enabled path)

```bash
wscat -c ws://localhost:8910/v1/audio/stream \
  -H "Authorization: Bearer $EVF_BEARER"
```

Expected:
1. Connection stays open (bridge has opened a child WS to Deepgram).
2. Bridge log shows: `[audio-stream] session <uuid> connected → Deepgram stream open`.

### 3c. Observe r1.voice.transcript envelopes (on /ws)

Open a second terminal and connect to the main EVF WS endpoint:

```bash
wscat -c ws://localhost:8910/ws \
  -H "Authorization: Bearer $EVF_BEARER"
```

While speaking (or injecting PCM binary frames via the first wscat connection), Deepgram Results frames flow back as:

```json
{
  "type": "r1.voice.transcript",
  "payload": {
    "transcript": "cast fireball at the goblins",
    "confidence": 0.94,
    "language": "multi",
    "isFinal": true,
    "timestamp": 1747468800000
  }
}
```

---

## 4. SC-12-01 Hardware Measurement (Real G2 + R1 + Deepgram)

> **ADR-0005 PROVISIONAL Branch A carry** — SC-12-01 requires physical G2 + R1 + a valid Deepgram key.

### Setup

1. Complete §1 (Deepgram key) and §2 (bridge env).
2. Connect the Even Realities App (with EVF g2-app loaded) to the bridge per the Phase 4a boot flow.
3. Verify the boot-splash shows the voice-cap line as **ENABLED** in the capabilities line (capability handshake gate sets `negotiatedCaps.has('voice')`).

### Procedure

1. Speak clearly near the G2 microphone: _"cast fireball at the goblins"_
2. Observe the `r1.voice.transcript` envelope via the §3c wscat subscriber (or Claude Desktop tool call log — see §5).
3. Measure **speech-end → toast-shown latency**: stop the utterance → note the timestamp when the EVF toast appears on the G2 display.

**SC-12-01 pass criteria:** p50 latency ≤ 800 ms speech-end → toast-shown across 10 utterances.

### Edge-case tests

| Test | Utterance | Expected outcome |
|------|-----------|-----------------|
| SC-12-01a | "palla di fuoco" | `spell.fireball` via IT→EN lookup; `cast-spell` MCP tool fires |
| SC-12-01b | "scorch 'em" | clarify-detector surfaces clarify prompt instead of executing |
| SC-12-01c | "fireball" (EN) | Direct match; no clarify needed |
| SC-12-01d | Utterance with code-switching (IT+EN) | Nova-3 Multilingual handles mid-sentence switch |

---

## 5. Claude Desktop Wiring (GM-Agent side)

Phase 12 ships the GM-Agent system prompt in `packages/foundry-mcp/src/voice/gm-agent-prompt.ts`.

### 5a. Print the full system prompt

```bash
pnpm --filter @evf/foundry-mcp exec node -e \
  "import('./dist/voice/gm-agent-prompt.js').then(m => console.log(m.buildGmAgentPrompt()))"
```

Copy the output.

### 5b. Configure Claude Desktop

In the Claude Desktop system prompt slot (or your `claude_desktop_config.json`), paste the printed `GM_AGENT_SYSTEM_PROMPT`.

Verify the MCP server is connected (Phase 11 docs/mcp-verification.md §1 or §2) and the 6 tools are listed.

### 5c. Test worked example A (Fireball gruppo)

Send: `palla di fuoco sul gruppo di goblin`

Expected tool call: `cast-spell` with `spell_id: "fireball"`, `targets: ["goblin-group"]`.

### 5d. Test worked example B (Dual-wield)

Send: `attacco con l'ascia e poi la spada corta`

Expected: `weapon-attack` (main hand) then `weapon-attack` (off-hand bonus action) — see `WORKED_EXAMPLES[1]` in `packages/foundry-mcp/src/voice/worked-examples.ts`.

### 5e. Test worked example C (Clarify detector)

Send: `scorch 'em`

Expected: Claude surfaces a clarify question ("Vuoi usare palla di fuoco o un'altra magia?") without executing any tool.

---

## 6. Pino Redact Verification

Confirm `DEEPGRAM_API_KEY` never leaks into logs:

```bash
pnpm --filter @evf/bridge test -- --run voice-secret-redact
```

Expected: `Tests 5 passed` — asserts zero `sk-fake` substring in captured pino output across 4 field paths (`deepgramKey`, `apiKey`, `*.deepgramKey`, `*.apiKey`).

---

## 7. Automated Test Gate

```bash
pnpm test
# Expected: all packages pass (bridge + g2-app + foundry-mcp + shared-protocol)
```

```bash
pnpm typecheck && pnpm lint:ci
# Expected: exit 0
```

SC-12-01 (hardware) is the only remaining open item — tracked in `.planning/phases/12-v2-voice-ux-tuning/12-VERIFICATION.md`.
