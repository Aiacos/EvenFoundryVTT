# Project Research Summary

**Project:** EvenFoundryVTT (EVF)
**Domain:** D&D 5e companion plugin for FoundryVTT, projected onto Even Realities G2 AR glasses (576×288 4-bit greyscale phosphor) controlled by R1 ring; optional V2 voice/AI via MCP server
**Researched:** 2026-05-10
**Confidence:** HIGH overall (live npm/registry verification + Specs.md v0.9.11 cross-validated 5 rounds; only Even Realities firmware policy + 2026 MCP streaming UX remain MEDIUM/LOW)

## Executive Summary

EVF is a hardware-constrained AR HUD product sitting at the intersection of three categories — VTT companion (D&D Beyond/Argon), AR smart-glass HUD (Mirrorscape/Glimmer), and Doom-on-exotic-device streaming (rp2040_doom_1b/Atari ST 16-color). The dominant production pattern that already-shipping systems converge on is a **5-tier 3-hop deployment**: G2 firmware ↔ Even App WebView (phone) ↔ Plugin host (static HTTPS) → Bridge (Node Fastify+ws+pino, single-tenant Docker Compose) ↔ Foundry+dnd5e module — with V2 MCP server as a sixth, decoupled tier. The spec's existing architecture maps 1:1 onto reference repos `foundryvtt-rest-api`, `foundry-api-bridge`, and the brianmatzelle G2 starter, so the structural risk is low.

Where risk concentrates is in the **physics layer** (BLE 4.2+ throughput in 2.4 GHz-loaded living rooms, G2 firmware queue depth, sRGB-vs-linear Floyd-Steinberg dither on phosphor green) and in the **dnd5e 5.x Activity API write-path** (pre-5.0 shims removed, MidiQOL workflow re-entrancy under socketlib forwarding). Eight CRITICAL pitfalls cluster in Phases 0, 4, and 7 — these three phases are the project's center of gravity and need extra buffer + verification gates. The recommended mitigation arc is: keep Phase 0 expansive (multi-environment BLE, sustained DLE, queue-depth probe, palette calibration), extend Phase 4 from 4 weeks to 5 to absorb 6 of 17 pitfalls (delta+keyframe, HUD cognitive load, PIXI extract OffscreenCanvas hand-off, RTT canary, sRGB-linear dither), and lock Phase 7 to single-workflow-origin discipline (option A: GM-side execution via `socketlib.executeAsGM` only).

The stack is fully pinned and verified live on 2026-05-10: Node 24 LTS + Fastify 5.8.5 + ws 8.20 + Zod 4.4 + pino 10 (bridge); TypeScript 5.8.5 + Vite 8 + image-q 4.0.0 + upng-js 2.1 + xxhash-wasm 1.1 (g2-app browser bundle); Vitest 4.1.5 + Biome 2.4.15 + pnpm 10.3.1 (workspace); MCP TS SDK 1.29.0 with stdio + Streamable HTTP only (HTTP+SSE deprecated 2025-03-26). Three differentiators define the moat: eyes-never-leave-the-table HUD model, faithful Foundry canvas raster on 4-bit greyscale (Doom-on-watch pattern applied to TTRPG), and MCP-first V2 voice that gives plug-and-play to any future LLM client.

## Key Findings

### Recommended Stack

Concrete pinned versions, all verified live via npm registry on 2026-05-10. Four picks drive ~80% of the technical surface and warrant special attention from the roadmapper:

**The four token-heavy decisions:**
- **Raster pipeline:** `image-q@4.0.0` (Floyd-Steinberg + custom 16-step greyscale palette, only library on npm with FS+Atkinson+Bayer + custom palette) + `upng-js@2.1.0` (only mature 4-bit indexed-palette PNG encoder) + `xxhash-wasm@1.1.0` (5-10× faster than JS hash on the delta hot path) + OffscreenCanvas + Web Worker. ~90 KB gz total. Specs.md §11.5.7 already settled this; no drift. Drift signal: image-q npm vs git tag mismatch — pin by hash in `pnpm-lock.yaml`.
- **MCP transport (V2):** `@modelcontextprotocol/sdk@1.29.0` with **stdio + Streamable HTTP only**. HTTP+SSE is deprecated since 2025-03-26 (verified verbatim on `modelcontextprotocol.io/specification/2025-06-18/basic/transports`). Stdio for Claude Desktop local; Streamable HTTP for remote/Docker.
- **Foundry compat:** Foundry VTT ≥13.347 (verified 14) + dnd5e ≥5.3.3 (mandatory — 5.0.0 removed all pre-Activity shims). v12 explicitly **not supported**. `socketlib` declared as Foundry module dependency (NOT on npm — `npm view socketlib` returns 404). MidiQOL is *de facto* required at MVP (see Vector B gap → Roadmap implications).
- **Lint/test/build:** Biome 2.4.15 (single binary replaces ESLint+Prettier, ~10× faster) + Vitest 4.1.5 + happy-dom 20.9 + Playwright 1.59 + pnpm 10.3.1 + Changesets 2.31. Biome covers both lint and format; do NOT add ESLint or Prettier. INV-4 grep blockers in CI.

**Bridge/runtime:** Node 24 LTS ("Krypton") + Fastify 5.8.5 + `@fastify/websocket` 11.2 + `ws` 8.20 + Zod 4.4.3 + pino 10.3.1 + prom-client 15.1.3 + qrcode 1.5.4. **No socket.io, no Express, no Redis** in MVP (in-memory `Map` is Tier 1; Redis is Phase 13 stretch only). **No React/Vue/Svelte** in g2-app — no DOM emitted to G2, virtual-DOM brings zero value.

Detailed rationale: see [STACK.md](./STACK.md).

### Expected Features

The spec already commits ~70 features across §5/§7/§10. Adversarial gap-hunt against three vectors (dnd5e Activity corners, MidiQOL workflow integration, AR-HUD primitives) surfaced 7 features that should join MVP. 14 differentiators identified, 20 anti-features formally rejected with rationale.

**Must have (table stakes — already in spec, confirmed by competitor analysis):**
- Persistent glanceable Status HUD (HP/AC/action economy/slots/conditions) always visible
- Foundry-faithful 6-tab character sheet with dual-edition support (`core.modernRules` 2014↔2024)
- Combat tracker with initiative + concentration source + effects + durations
- Spellbook + Inventory (two surfaces each: deep-dive Sheet tab + standalone overlay)
- Map raster mode (4-bit dithered, 4 image container 2×2 = 400×200 px) DEFAULT + glyph fallback
- Manual cast/attack/use via R1 (scroll → tap → confirm target)
- Quick Action menu (`[S][C][L][B][I][A][M][N][X]`) on long-press
- Boot splash + capability handshake + QR-paired bearer 24h tokens
- i18n auto-detect from `game.i18n.lang`, runtime override, IT+EN at MVP
- Layout integrity invariants (INV-1, snapshot-tested ck 11-15)
- Connection-lost graceful degradation (`⚠ SYNC LOST` chip, cached read-only)

**Should have (the strongest 5 differentiators — EVF's competitive moat):**
1. **"Eyes never leave the table" HUD model** — the *raison d'être*. No competitor (D&D Beyond, Argon, Mirrorscape, Tilt Five) augments physical play; they all replace it.
2. **Faithful Foundry canvas raster on 4-bit AR glasses** — Doom-on-watch pattern applied to TTRPG. 6-layer adaptive optimization stack (delta hash + sub-tile + static cache + RLE + BLE DLE + adaptive fps). No competitor stack exists.
3. **MCP-first V2 voice** — any MCP client (Claude Desktop, Claude Code, future LLM) drives Foundry tools without changing EVF. Plug-and-play; voice is purely additive to deterministic MVP.
4. **GM authority preserved as architectural invariant** — `socketlib.executeAsGM` + `MidiQOL.completeActivityUse` for all NPC-state writes. Player commands are veto-able. Explicit anti-pattern to AI replacing the DM.
5. **Three-surface settings model** (Foundry world / Even App phone / G2 device-local) — solves "configure a device with no keyboard" without compromising. Best-in-class for the problem domain.

**Adversarial gaps that should join MVP** (from FEATURES.md Vectors A/B/C — not in the spec; roadmapper should consider P1 inclusion):
1. Reaction *passive notification toast* (Shield, Counterspell, Opp Attack — Vector A)
2. Concentration drop confirm modal on cast (Vector A — 5e core mechanic, currently undefined)
3. Death saves status HUD (visceral D&D moment, missing from spec)
4. MidiQOL config requirement check at boot (autoFastForward mode — Vector B; without this, manual writes stall on chat-card buttons)
5. Boot error states (handshake failed, version mismatch, no character — Vector C; spec mockups happy-path only)
6. Toast queue/stack (max 2 visible, FIFO 3s — Vector C; Fireball + 8 saves overflows)
7. Multi-attack action tracker `Atk 1/2` (Fighter L5+ — Specs §12.B q.15 currently flagged open)

**Anti-features formally rejected (one-line list):**
3D scene rendering on G2 · DM-side glasses · multi-G2 simultaneous sync · AI replacing/arbitrating DM · D&D Beyond direct integration · voice/AI as MVP requirement · audio output (G2 has no speaker) · native EvenAI hijack · RTL languages · multi-tenant cloud SaaS · fully on-glasses execution (no phone WebView) · touch input on G2 frame · camera-based gesture recognition · biometric narrative as MVP · Foundry write ops bypassing GM authority · inline rich-text rules/spell tooltips · custom 3D dice on glasses · in-glasses chat input/typing · push notifications for non-game events · color-coded UI (G2 is monochrome).

**Defer (v2+ / Phase 13 stretch):** Voice/AI via MCP (Phase 11+, V2 OPZIONALE) · Reaction execution flow · Push notifications · Biometric narrative cues · Multi-target intelligent selection · Multi-player sync (4× G2) · Multi-tenant SaaS · Server-side canvas extract (Option B headless Foundry) · Advanced compression (Brotli/fflate) · In-glasses audio capture for V2.

Detailed analysis: see [FEATURES.md](./FEATURES.md).

### Architecture Approach

The spec's **5-tier 3-hop deployment** (Tier 0 G2 firmware → Tier 1 Even App WebView → Tier 2 Plugin host → Tier 3 Bridge → Tier 4 Foundry+dnd5e; V2 adds Tier 5 MCP client + Tier 5b foundry-mcp server) maps 1:1 onto reference repos `foundryvtt-rest-api`, `foundry-api-bridge`, and the brianmatzelle G2 starter. **Boundary count: 4 for MVP, 5 with V2 MCP.** No structural critique — the spec is right.

**Major components:**
1. **G2 plugin (`packages/g2-app`)** — TypeScript+Vite WebView bundle, ~250-500 KB gz. Layered HUD (z=0 map / z=1 status / z=2 overlay), exactly one capture layer, raster pipeline in Web Worker. Plain TS modules + observable state-store; no UI framework.
2. **Bridge (`packages/bridge`)** — Node 24 + Fastify + ws. Auth (24h bearer), rate limit, CORS proxy, **Tool Registry** (the most important abstraction — single source of truth shared by MVP gestures and V2 MCP), in-memory state cache, replay buffer, Prometheus metrics.
3. **Foundry module (`packages/foundry-module`)** — readers/writers, hooks, **versioned `FoundryAdapter`** (`adapters/dnd5e-5x/`) — highest-ROI abstraction in the entire spec, the only thing standing between you and a 2-week rewrite when dnd5e v6 ships. socketlib forwarding for GM-side actions.
4. **Shared protocol (`packages/shared-protocol`)** — zero-runtime TS types + Zod schemas, single source of truth across all packages.
5. **foundry-mcp (V2, Phase 11+)** — stateless MCP server; every tool is a 1-liner that POSTs to the same bridge endpoint MVP uses. Re-uses bearer auth.

**Biggest cross-cutting concern surfaced by research (not in spec):** **idempotency keys + explicit sequence numbers in WS frame envelope** (`{proto: "1.0", seq, ts, type, path?, value?, prev_seq?}`). Without these, R1-tap → POST → WS-replay-overlap can fire `activity.use()` twice → double damage. Phase 3 deliverable. Companion concerns: bearer rotation grace window (60s overlap during 24h refresh), WS connection cap per (player, device) for DoS resistance, snapshot fallback reuses `GET /v1/actor` rather than inventing a new full-state-dump message, telemetry event schema lock-in at Phase 1 (avoid thousand-paper-cut renames).

**Build-order delta vs Specs.md §10** (three concrete adjustments):
- **Phase 4 split into 4a (raster + status HUD, weeks 4-5) and 4b (overlay slot + map mode toggle, weeks 6-7)** so Phase 5 panel work has a stable layer-manager API at week 6 — current Phase 4/5 overlap (week 6) has implicit dep.
- **Pull a thin R1 event source stub into Phase 4** so Phase 5 panels can be tested with real R1 events. Phase 6 then becomes "Quick Action menu + telemetry" not "first time R1 events flow."
- **Pull pairing UI forward into Phase 2** (currently in Phase 7 implicitly via writers) — pairing UI doesn't depend on writers. Lets Phase 3+4 dev use real bearer tokens, not mocks.

Detailed analysis: see [ARCHITECTURE.md](./ARCHITECTURE.md).

### Critical Pitfalls

17 pitfalls identified, **all domain-specific** (no generic web-app advice). 8 CRITICAL severity, clustered in Phases 0/4/7. Top 5 by phase:

1. **[Phase 7 — CRITICAL] dnd5e 5.x Activity system "shim removed" assumption (Pitfall 1)** — pre-5.0 shims fully removed in 5.0.0; code grepped from 2023 examples (`item.use({})`, `item.system.actionType`, `item.system.damage.parts`) silently breaks the workflow. **Avoid:** writer boundary calls `activity.use({configure: false, event: null})` exclusively; never fall back to `item.use(...)`. Phase 0 fixture: freeze JSON schema of a level-3 Fireball-equipped spell.
2. **[Phase 7 — CRITICAL] socketlib + MidiQOL + activity.use re-entrancy → double damage (Pitfall 6)** — player-side `activity.use()` + socketlib forward of same activity = MidiQOL workflow nests with itself; outcomes range from "nothing happens" to "damage applied twice." **Avoid:** **single workflow origin rule, option A (GM-side execution only)** — bridge sends action to Foundry module, module always uses `socketlib.executeAsGM` to run `activity.use()` on GM client. Player client never directly uses the activity.
3. **[Phase 4 — CRITICAL] Delta-encoding tile loss = silent corruption surviving reconnect (Pitfall 3)** — bridge ships T_n as delta vs T_{n-1}; if T_{n-1} dropped (firmware queue overflow / BLE retry exhaustion), T_n applied to wrong base, ghost tokens persist for the rest of session. **Avoid:** keyframe interval every 10s + explicit sequence numbers per tile + mandatory full keyframe of all 4 tiles on every reconnect.
4. **[Phase 4 — CRITICAL] HUD information density violates AR cognitive-load research (Pitfall 4)** — the §7.4 mockup persists ~12 chips for a 3-6h session; AR research consistently shows >5 always-on chips cause measurable eye fatigue at 30 min. Directly contradicts Core Value ("eyes never leave the table") if uncaught. **Avoid:** layered HUD priority (P1 always / P2 combat-only / P3 demand-only) + idle dimmer at 30s of inactivity + Quick Action `[H] HUD` toggle Off/Minimal/Standard/Full + NASA-TLX field-test gate in Phase 10.
5. **[Phase 0 — CRITICAL] BLE bandwidth measurement excluding 2.4 GHz coexistence is optimistic by 30-60% (Pitfall 2)** — Specs §10.0.3 measures clean RF for 1 minute; living rooms have WiFi ch 6/11 + microwaves + Zigbee + 4-6 phones. **Avoid:** run §10.0.3 in 3 environments (clean / 5GHz-loaded / 2.4GHz+Zigbee worst-case), document p50/p95/p99 separately, add continuous bandwidth telemeter feeding adaptive fps Layer 6, abort raster if MTU<64 bytes. Phase 10 field test must include a microwave test.

**Proposed new project invariant — INV-5 "Gesture Determinism" (from Pitfall 5):** long-press always opens the Quick Action menu of the current top layer — never close, never confirm, never something else. Visible context chip in status HUD footer (`R1: tap=cycle scroll=nav long=quick[combat]`) names the menu that long-press opens *right now*. Confirm-before-execute for destructive Quick Actions. Phase 6 verification checklist: from each of 8 reachable screens, long-press opens correct menu matching the footer chip label.

**Proposed Phase 4 extension recommendation (from Pitfall mapping):** Phase 4 carries 6 of 17 pitfalls (3, 4, 10, 11, 12, 15) — flag as **highest-risk phase**. Recommend extending **from 4 weeks to 5 weeks** if buffer is available. This is the project's largest single risk concentration.

Detailed analysis (all 17 pitfalls + technical debt + integration gotchas + perf traps + security mistakes + UX pitfalls + recovery strategies): see [PITFALLS.md](./PITFALLS.md).

## Implications for Roadmap

Specs.md §10 already defines a 13-week MVP (Phase 0 → 10) + V2 (Phase 11 → 13). Research validates that ordering as fundamentally correct; the actionable bullets below are **adjustments**, not a rewrite.

### Must land in MVP (P1) — beyond what Specs.md already commits

The 7 adversarial gaps from FEATURES.md Vectors A/B/C should join Phase 5/7/8 P1:

- **Phase 5 (panels):** death-saves status HUD (HP=0 pivot); toast queue/stack design (max 2 visible, FIFO 3s); boot error states (handshake failed, version mismatch, no character).
- **Phase 7 (write path):** concentration-drop confirm modal on cast; multi-attack tracker `Atk 1/2`; reaction *passive notification toast* (execution still V2 / ACT-04).
- **Phase 0 entry gate:** MidiQOL config requirement check (autoFastForward mode required, OR build native fallback) — declare MidiQOL **required for MVP** in `module.json` `relationships.requires` (currently `recommends`); without this, manual writes stall on chat-card buttons.

### Phases that need extending

- **Phase 0 expands** beyond Specs §10.0 to include: multi-environment §10.0.3 (clean / 2.4GHz-loaded / microwave); sustained §10.0.7 (30 min, not 30 sec — pitfall 10); full queue-depth → behavior table for §10.0.8 (queue ∈ {1,2,3,≥4} — pitfall 12); palette calibration sub-step in §10.0.2 (pitfall 15: linearize before dither + perceptually-spaced palette); boot-time format probe spec (pitfall 7: Even SDK has no SemVer guarantee, OTAs can change `updateImageRawData` byte format mid-life).
- **Phase 4 extension from 4 to 5 weeks** — carries 6 of 17 pitfalls (3, 4, 10, 11, 12, 15). Highest single risk concentration. Specifically: keyframe+seqno discipline for delta; layered HUD priority + idle dimmer + `[H]` toggle; OffscreenCanvas hand-off for PIXI extract (pitfall 11 — synchronous extract blocks player's own Foundry desktop); RTT canary every 2s for inferred MTU monitoring; queue-depth-aware raster scheduler; linearize-before-dither + serpentine scan.
- **Phase 4 split into 4a/4b** so Phase 5 panel work has stable layer-manager API at week 6 (architecture critique).
- **Phase 10 field test extension** — multi-session for fatigue measurement (not just one 4h session); NASA-TLX/Borg CR-10 self-report eye fatigue score; **must include a microwave test** (pitfall 2); mid-session DM-setting-change broadcast verification (pitfall 8); firmware compatibility matrix doc (pitfall 7).

### Where invariants bind

- **INV-1 (layout integrity)** binds at Phase 1 (snapshot test framework with ASCII fixtures) and is verified at Phase 4 ck 11-15 + Phase 5 (panel rendering uses kind-aware truncation, pitfall 9 i18n width budget).
- **INV-2 (online cross-validation discipline)** binds continuously; specifically re-evaluate TypeScript 5.8 → 6.x at Phase 4 entry, image-q npm-vs-git drift in ADR-0006, Even SDK firmware version logging at every capability handshake.
- **INV-3 (doc coherence)** binds at every phase transition; Specs.md is canonical SoT.
- **INV-4 (code quality)** binds Phase 1 (Biome config, TS strict, CI grep blockers, Vitest coverage gate ≥80% on core).
- **NEW: INV-5 (gesture determinism)** — propose to ratify in Phase 6 (R1 integration). Specifically: long-press = Quick Action of current top layer, always; visible context chip in footer; confirm-before-execute for destructive actions.

### Cross-cutting concerns to schedule (not in Specs.md §10 explicitly)

- **Phase 1:** ADR template + first 5 ADRs (0001 layered-ui-model, 0002 protocol-versioning, 0003 tool-registry-pattern, 0004 voice-via-mcp-not-internal, 0008 code-quality-config); telemetry event schema lock-in (avoid thousand-paper-cut renames); i18n test fixture with `kind` taxonomy (`spell-name`/`condition`/`status-effect`/`damage-type`/`cosmetic`/`narrative`) + IT abbreviation tables (pitfall 9); Tier 4 G2 device-local settings get same versioned migration treatment as Tier 1.
- **Phase 2:** Pull pairing UI forward (currently implicit in Phase 7 writers); versioned `FoundryAdapter` from day one (highest-ROI abstraction).
- **Phase 3:** Idempotency keys on write-path POSTs (60s LRU dedupe); explicit `seq` + `proto` version field in WS envelope; replay buffer; `/healthz`+`/readyz`+`/metrics` from day 1; bridge revocation list + WS invalidation channel (pitfall 16); WS connection cap per (player, device).
- **Phase 5:** Settings introspection panel (Quick Action `[?] Settings` with tier badges — pitfall 8); world-scope setting change broadcast toast.
- **Phase 7:** Single-workflow-origin discipline option A (pitfall 6); permission re-validation in every `executeAsGM` handler (defense in depth); chat-message audit log for GM-side actions; bearer rotation grace window.
- **Phase 11/12 (V2):** MCP tool milestone schema (coalesce streaming UX — pitfall 14); cancellable streaming (double-tap = cancel); two-stage STT with locale-aware fuzzy lookup table for D&D vocab IT/EN/slang (pitfall 13).

### Phases needing deeper research during planning (research-phase flag)

- **Phase 0** — single most consequential phase; needs research on Even Realities `updateImageRawData` exact byte format (PNG indexed vs raw 4-bit packed nibble order), R1 SDK gesture timing windows, BLE DLE actual MTU on iOS vs Android, G2 firmware queue depth empirical probe. Spec §12 has open questions here that gate everything downstream.
- **Phase 4** — 6 of 17 pitfalls land here; needs research on PIXI canvas extract OffscreenCanvas hand-off browser support (especially Safari iOS WebView), Floyd-Steinberg sRGB-vs-linear measurable difference on actual G2 phosphor, queue-depth-aware scheduler design.
- **Phase 7** — needs research on `MidiQOL.completeActivityUse` signature against the installed MidiQOL version (Specs §12.B q11/q12 currently flagged open); `activity.use({count: 2})` for Fighter Extra Attack route (Specs §12.B q15).
- **Phase 11/12 (V2)** — needs research on MCP 2026 streaming UX patterns (rapidly evolving), STT D&D vocabulary tuning (Whisper large-v3 vs Deepgram Nova-3 for IT+EN code-switching).

### Phases with standard patterns (skip research-phase)

- **Phase 1 (foundation/scaffolding)** — pnpm workspace + Biome + Vitest + Changesets + tsconfig.base + Docker recipes are well-documented standard patterns; Specs.md §5.6.10 already settled the layout. Just execute.
- **Phase 2 (Foundry module readers)** — read-only `actor.system.*` traversal is well-trod once the Activity schema fixture is frozen in Phase 0.
- **Phase 3 (Bridge skeleton)** — Fastify + ws + bearer auth + Tool Registry dispatch table follows the `foundryvtt-rest-api` / `foundry-api-bridge` reference pattern exactly. No structural surprises.
- **Phase 5 (panels)** — auto-discovery via Vite `import.meta.glob` is build-time and well-understood. Watch out for i18n `kind` taxonomy + settings introspection (cross-cutting work, not new research).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Every version verified live via `npm view` on 2026-05-10; spec-pinned picks (raster pipeline §11.5.7, MCP transport §4.7) re-confirmed without drift; only image-q npm-vs-git mismatch flagged for ADR-0006 follow-up. |
| Features | **HIGH** | Spec-committed features cross-validated against 5 rounds of Specs.md review + competitor matrix (D&D Beyond / Foundry / Argon / Mirrorscape / Tilt Five). Adversarial-found gaps are MEDIUM (no production reference for AR-HUD D&D companion). |
| Architecture | **HIGH** | 5-tier 3-hop pattern confirmed by reference repos `foundryvtt-rest-api`, `foundry-api-bridge`, `cclloyd/planeshift`, brianmatzelle G2 starter. MCP TS SDK shape verified directly against npm + docs. Plugin contract granularity (§5.6) is MEDIUM — partially over-engineered for MVP, simplifications recommended. |
| Pitfalls | **MEDIUM** | HIGH on Foundry/dnd5e + BLE physics + Floyd-Steinberg via authoritative sources (dnd5e 5.0.0 release notes, MidiQOL package, BLE TI/Punch-Through guides, peer-reviewed AR ergonomics MDPI 2024 + ScienceDirect). MEDIUM on Even Realities firmware/policy due to limited public surface (vendor blogs + community RE only). LOW on MCP streaming UX due to rapidly evolving 2026 roadmap. |

**Overall confidence:** HIGH. The structural shape of the system (architecture, stack, table-stakes features) is locked with strong sources. Risk concentrates in physics-layer validation gates (Phase 0) and a few well-identified write-path edge cases (Phase 7) — all with clear mitigations.

### Gaps to Address (Phase-0-blocking only)

1. **`updateImageRawData` exact byte format** (Specs §10.0.2) — PNG indexed-palette? Raw 4-bit packed? Endianness? Nibble order? Determines whether `upng-js` is needed at all (could trim ~25 KB gz). Re-validate library choice after Phase 0. **Blocking for Phase 4 raster pipeline.**
2. **BLE bandwidth in real RF environments** (Specs §10.0.3, extended) — below 100 kbps blocks raster MVP entirely; degrades to glyph-only. **Blocking for Phase 4 MAP-01 vs MAP-02 default decision.**
3. **G2 firmware queue depth** (Specs §10.0.8, extended with full table) — drives 5/8/12/15 fps committed math; raster scheduler architecture parameterizes on this. **Blocking for Phase 4 scheduler design.**
4. **BLE DLE sustained over 30 min** (Specs §10.0.7, extended from 30s to 30min) — connect-time MTU is unreliable; iOS BLE re-arbitrates under low power / background switch. **Blocking for 15 fps stretch target commit.**
5. **R1 gesture timing windows** (Specs §10.0.1) — distinguishability of tap vs double-tap vs long-press is firmware-defined; INV-5 gesture determinism requires these locked. **Blocking for Phase 6 R1 integration.**
6. **MidiQOL `completeActivityUse` signature** (Specs §12.B q.11-12, §10.0.10 P2 row 1) — write-path bedrock; signature change between MidiQOL versions affects every action. **Blocking for Phase 7 write path.**
7. **Foundry palette calibration on actual G2 phosphor** (Pitfall 15, new sub-step in §10.0.2) — sRGB FS dither + non-linearized luma + uniform 16-step palette = midtone tokens invisible against background. Render luminance-ramp test pattern, photograph G2, derive perceptually-correct palette. **Blocking for Phase 4 dither pipeline.**

All other open questions (Even SDK SemVer policy, MCP streaming UX, V2 STT vocab, multi-tenant cloud) are non-blocking for MVP — they affect V2 / Phase 13 decisions, not the critical path.

## Sources

### Primary (HIGH confidence)
- Specs.md v0.9.11 (canonical SoT, ~4250 lines, 5 cross-validation rounds)
- PROJECT.md (GSD projection of Specs.md)
- npm registry — `npm view` for every pinned version verified 2026-05-10
- nodejs.org/en/about/previous-releases — Node 24 LTS Active confirmation
- modelcontextprotocol.io/specification/2025-06-18/basic/transports — Streamable HTTP / HTTP+SSE deprecation verbatim
- github.com/foundryvtt/dnd5e/releases — 5.3.3 + 5.0.0 shim removal release notes
- raw.githubusercontent.com/foundryvtt/dnd5e/release-5.3.3/system.json — `compatibility.minimum: 13.347, verified: 14`
- ThreeHats/foundryvtt-rest-api, alexivenkov/foundry-api-bridge-module, cclloyd/planeshift, foundryvtt.com/packages/foundry-api-bridge
- farling42/foundryvtt-socketlib — canonical executeAsGM pattern
- foundryvtt.wiki/en/development/api/sockets
- TI BLE-Stack DLE guide + Punch Through BLE Throughput Pt 3/4
- Floyd-Steinberg Wikipedia + every-algorithm.github.io 2024
- MDPI 2024 Sensors + ScienceDirect + PubMed AR-glasses ergonomics (peer-reviewed)
- WebSocket.org reconnection / best-practices guides
- @modelcontextprotocol/typescript-sdk + ts.sdk.modelcontextprotocol.io docs

### Secondary (MEDIUM confidence)
- hub.evenrealities.com/docs/getting-started/architecture
- evenrealities.com/blogs/even-insider/how-we-rebuilt-g2-from-the-inside-out (vendor blog)
- support.evenrealities.com Known Issues
- brianmatzelle/even-realities-g2-glasses GitHub starter
- foundryvtt.com/packages/enhancedcombathud-dnd5e (Argon HUD competitor reference)
- gist.github.com/vietts/bee17c5aaa7b74f470c8016085864202 — D&D 2024 IT translation gist
- jborza.com/post/2020-11-20-doom-on-a-watch + meadiode/rp2040_doom_1b
- surma.dev/things/ditherpunk
- dev.to MCP 2026 architecture guide

### Tertiary (LOW confidence)
- i-soxi/even-g2-protocol — community BLE protocol RE, not authoritative
- electronics.alibaba.com/buyingguides/hud-glasses-guide-2026 — buying-guide tone
- blog.modelcontextprotocol.io/posts/2026-mcp-roadmap — rapidly evolving streaming UX gap area

---
*Research completed: 2026-05-10*
*Files synthesized: STACK.md (35 KB) · FEATURES.md (43 KB) · ARCHITECTURE.md (54 KB) · PITFALLS.md (75 KB) · ~207 KB total → distilled here*
*Ready for roadmap: yes*
