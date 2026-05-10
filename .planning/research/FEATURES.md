# Feature Research

**Domain:** D&D 5e companion app on AR smart-glasses (Even Realities G2) — VTT-companion + glanceable AR HUD hybrid
**Researched:** 2026-05-10
**Confidence:** HIGH for spec-already-committed features, MEDIUM for adversarial-found gaps (validated against Specs.md v0.9.11), LOW for AR-HUD-specific UX claims that have no direct competitor on this hardware (G2 is novel)

---

## Scope of this research

EVF sits at the intersection of three product categories with different feature DNA:

1. **VTT companion apps** (D&D Beyond mobile, Foundry's player UI, Roll20 Companion, **Argon Combat HUD** for Foundry) — character sheet, dice, combat tracker, spellbook, inventory
2. **AR/smart-glass game HUDs** (Mirrorscape on Snapdragon Spaces, Tilt Five, Even Hub-native widgets, HoloLens RPG demos) — glanceable status, hands-free gestures, head-pose interaction
3. **Hardware-constrained streaming HUDs** (Doom-on-watch, fbDOOM, rp2040_doom_1b, Atari ST 16-color) — dithering, delta-tile streaming, adaptive frame rate

The Specs.md v0.9.11 already commits to ~70 features across §7 (UI/UX), §5 (components), §10 (roadmap). This research **does not duplicate the spec** — instead it:

- Re-classifies existing spec features as table-stakes vs differentiators vs anti-features for the **EVF product positioning**
- Surfaces **adversarial gaps** (features the spec implicitly assumes but doesn't enumerate) on three vectors:
  - dnd5e Activity system corners (legendary actions, lair actions, multi-attack, concentration drop, reactions other than Shield/Counterspell)
  - MidiQOL workflow integration (damage application asymmetry, save chain, advantage/disadvantage source resolution)
  - AR-HUD primitives the spec mentions but doesn't fully feature-gate (boot splash variants, error states, R1-disconnected fallback)

---

## Feature Landscape

### Table Stakes — D&D 5e Player Companion (must have or product feels broken)

These are non-negotiable. A player who installs EVF expects them on day 1; missing them means EVF "isn't a real D&D companion." All map onto Specs.md requirements already committed.

| Feature | Why Expected (table-stakes evidence) | Complexity | Specs ref | Notes |
|---|---|---|---|---|
| **Character sheet read-only view (HP/AC/abilities/saves/skills/senses)** | Universal across D&D Beyond mobile, Foundry player UI, Roll20 char sheet, Argon HUD. A D&D companion without a character sheet is unrecognizable as one. | LOW | SHEET-01, §7.5.2-7.5.7 | Foundry has the canonical layout; spec replicates 6 tabs faithfully. |
| **HP / temp HP display with color/visual state** | D&D Beyond, Argon, Foundry all show HP front-and-center. HP is the #1 thing a player checks mid-turn. | LOW | DISP-01, §7.3 Status HUD `HP ████████░░` | Spec uses glyph bar `████████░░ 45/68 +10t`. |
| **AC, initiative, speed at-a-glance** | Argon HUD core; Foundry desktop ABS displays. Combat math without these means rolling on paper. | LOW | DISP-01 | In Status HUD corner card. |
| **Action economy tracker (action/bonus/reaction/move)** | Argon's flagship feature. dnd5e 5.x activity system enforces; players need to see remaining slots for each. | LOW | COMB-02, §7.4 `Act ░ Bns ░ R░ Move 30/30` | Visible always, not just in Combat overlay. |
| **Spell slot tracker per level with used/remaining** | D&D Beyond, Foundry, Argon all surface this prominently. Wizard/cleric players cycle through this constantly. | LOW | SHEET-01, §7.4 `Slots 1° ▓▓░░ 2/4` | Spec uses `▓` used / `░` available — 3-level visible, +N overflow. |
| **Active conditions list (Bless, Concentrating, Poisoned, …) with duration** | Foundry Argon, D&D Beyond. Concentration drops and rounds-remaining decisions hinge on this. | LOW | DISP-01, §7.4 Conditions block | Spec caps at 4 visible with `+N` overflow. |
| **Combat tracker — initiative order, current turn marker, all combatants** | Foundry's combat tracker is *the* canonical reference; D&D Beyond launched its own in 2024. | MEDIUM | COMB-01, §7.6 | Spec includes effects + concentration source + range/direction. |
| **Spellbook organized by level with prepared/known/at-will markers** | Foundry's spellbook tab is the de-facto layout. Cantrips at top, levels below, slot tracker per level. | LOW | SHEET-01 (Tab 4), §7.5.5, SPLBK §7.8 | Two surfaces (deep-dive Sheet tab + quick-cast standalone overlay) — Specs.md §7.5.5 explicitly notes coexistence. |
| **Inventory with equipped/consumables/carried separation, weight/encumbrance** | D&D Beyond and Foundry organize inventory this way; encumbrance is a 5e rule that matters. | LOW | SHEET-01 (Tab 3), §7.5.4, §7.9 | Currency strip + encumbrance bar in Sheet; condensed in standalone. |
| **Event log / chat reflection (rolls, damage, status changes)** | Foundry chat log is the session record; Roll20 chat is the canonical narrative. Players review what happened. | LOW | DISP-01, §7.7 | Spec adds filter chips `[ALL] Rolls Damage Status Chat`. |
| **Map / scene awareness (player token visible, FoW, lighting)** | Foundry's canvas, Roll20 VTT, Owlbear Rodeo all are map-first. A "VTT companion" without map awareness is just a sheet viewer. | HIGH | MAP-01..05, §7.4 + §7.4a + §7.4b | The hardest single feature — see PITFALLS.md. |
| **Roll feedback (dice result, crit/fumble visual)** | Universal. Players want to *see* their roll, even if the GM/Foundry is the authority. | MEDIUM | §7.15 Dice & Roll Result Display | Toast banner over map + persistent in Log. |
| **Real-time sync with Foundry world state** | Foundry's hooks are the truth source; players need <1s latency to feel in-session. | HIGH | FOUN-01..04, §2.2 latency budget <500ms p95 | The whole architecture is designed around this. |
| **Boot/loading state (the "is this thing connected?" question)** | Every connected app has this. Without it, silent failures kill UX. | LOW | NAV-04, §7.12 Boot Splash | Spec shows handshake sequence with checkmarks. |
| **Connection-lost graceful degradation (last-cached read-only)** | Production VTT apps all degrade rather than blank-screen. Players forgive disconnect; they don't forgive lost state. | MEDIUM | §7.14.5 Edge Cases (Bridge disconnesso → cached read-only, write disabled) | Spec calls this out explicitly. |
| **Localization — at minimum auto-detect Foundry locale (IT/EN MVP)** | dnd5e ships ~10 language catalogs, players expect their lang to "just work." | MEDIUM | I18N-01..05, §7.16 | Spec relies on Foundry/dnd5e catalogs; G2 ships zero strings. |

### Table Stakes — AR HUD specific (must have for glasses to feel right)

These come from the AR/smart-glass form factor; missing them makes EVF feel like a phone app forced onto glasses.

| Feature | Why Expected | Complexity | Specs ref | Notes |
|---|---|---|---|---|
| **Persistent glanceable status (no menu dive to check HP)** | Google Glimmer principle: "glance, return to real world." Smart-glass UX research consistent. | LOW | DISP-01 (HUD persistente status PG sempre visibile in corner card) | Status HUD never hides except in modal. The single most important UX choice in the spec. |
| **Layered z-order (map base, status overlay, popup)** | All AR HUD design languages (Glimmer, Apple Vision OS, HoloLens) use z-layering for context. | LOW | DISP-02, §7.2 Layered Rendering Model | Spec is explicit: z=0 map / z=1 status / z=2 overlay. |
| **Hands-free gesture input (no phone touch needed mid-session)** | The whole point of glasses + ring — if user must reach for phone, the form factor failed. | MEDIUM | NAV-01, §3.2 R1 gestures | tap/scroll/long-press only — see anti-features for what's deliberately absent. |
| **Boot splash with capability handshake feedback** | Smart-glass apps need to show "I am ready" because there's no system tray. | LOW | NAV-04, §7.12 | Spec includes protocol version + panel count handshake feedback. |
| **Disconnect indicator (R1 / bridge / Foundry) without cluttering main view** | Glasses users can't have alarm modals — needs subtle persistent indicator. | LOW | §7.14.5 (`⚠ SYNC LOST` header glyph, `⌁ R1 DISC`) | Spec uses header glyphs. |
| **Battery indicator (R1) prominent** | R1 ring is a small device; running out mid-session = unplayable. | LOW | §7.4 header `⌁ R1 92%` | Spec puts it top-right header. |
| **Layout integrity invariants (text never disaligns regardless of HP=7 vs HP=7000)** | Monospace HUD with shifting columns looks broken; Glimmer-equivalent stability. | HIGH | INV-1, §7.1a (snapshot-tested ck 11-15) | Spec elevates this to project invariant. |
| **Quick Action menu (long-press R1 → modal list of jumps)** | Discovery/escape hatch — players need to know "I can always reach X." | LOW | NAV-02, §7.13a | Spec keys it to `[S][C][L][B][I][A][M][N][X]` — Sheet/Combat/Log/Spellbook/Inv/Attack/Map/laNguage/cancel. |

### Differentiators — what no other companion app does

These are EVF's competitive moat. Each derives from the unique form factor (G2 + R1 + Foundry as authority) and aligns with PROJECT.md Core Value (*"il giocatore non distoglie mai lo sguardo dalla scena fisica"*).

| Feature | Value Proposition | Complexity | Specs ref | Notes |
|---|---|---|---|---|
| **"Eyes never leave the table" HUD model** | The product's *raison d'être*. D&D Beyond mobile, Argon, Foundry all require looking at a screen. EVF projects to peripheral vision. | — (architectural) | PROJECT.md Core Value, §1.1 Vision | Mirrorscape/Tilt Five do AR table-replacement; EVF augments physical play. Different positioning. |
| **Faithful Foundry canvas raster on AR glasses (4-bit dithered)** | No competitor streams Foundry's actual canvas to glasses. "Doom-on-watch" pattern applied to TTRPG. | HIGH | MAP-01, §7.4b raster mode | 400×200 effective resolution, 5 fps standard / 15 fps stretch. Pipeline: Floyd-Steinberg dither + sub-tile delta + RLE + BLE DLE. |
| **Glyph-mode fallback (text-only 96×24 grid)** | When BLE is saturated or canvas extract fails, gracefully degrade to ASCII map instead of blanking. Doom-on-watch pattern equivalent. | MEDIUM | MAP-02, §7.4a | User-toggleable runtime via `[M] Map ctrl`. |
| **6-layer adaptive optimization stack** | Delta hash + sub-tile + static cache + RLE + BLE DLE + adaptive fps — published as a research pattern, no competitor stack exists. | HIGH | MAP-03, §7.4b.6.1 | Doom-on-watch / rp2040_doom_1b pattern lifted to TTRPG context. |
| **R1 ring as the *only* required input device** | Players never need to look at phone or laptop. Even the Settings UI is split 3-way (§7.14.6) so phone is only used for bootstrap. | MEDIUM | NAV-01, §7.14.6 (3-surface settings) | Even Hub native apps still expect phone touch; EVF ring-only is novel. |
| **Glasses-faithful Foundry sheet replication (6 tabs, identical iconography mapped to monospace Unicode)** | Argon HUD, D&D Beyond all simplify the sheet. EVF replicates *all* the data Foundry exposes — encumbrance, hit dice, multi-class spell slots, currency, container nesting. | MEDIUM | SHEET-01, §7.5.2-7.5.7 | Spec maps 30+ Foundry data fields to glyph display. |
| **Dual-edition rules support (PHB 2014 + PHB 2024)** | Argon and most VTT companions force a choice; EVF surfaces `core.modernRules` switch and re-renders. | MEDIUM | SHEET-03, §11.5.1 | Foundry dnd5e 5.x supports both — EVF passes through. |
| **GM authority preserved (`socketlib.executeAsGM` + `MidiQOL.completeActivityUse`)** | Player commands that touch NPC state are veto-able. Other AR demos (Mirrorscape, Tilt Five) tend toward player-authoritative. | MEDIUM | ACT-03, §2.3 Trust & Authority | The DM remains the human source of truth — explicit anti-pattern to AI replacing GM. |
| **MCP-first V2 voice (any MCP client → Foundry tools)** | No companion app speaks MCP. Means *any* future LLM client (Claude Desktop, Claude Code, OpenAI MCP) drives Foundry without changing EVF. | MEDIUM | VOICE-02, §5.7 | Plug-and-play — voice is purely additive. |
| **Three-surface settings model (Foundry world / Phone bootstrap / G2 device-local)** | Solves "how do you configure a device with no keyboard?" without compromising. Phone is bootstrap-only; G2 is gesture-only; Foundry is authoritative. | MEDIUM | §7.14.6 + CONN-01..05 | Most smart-glass apps mix surfaces unclearly; EVF assigns by decision tree. |
| **QR-pairing for player auth (24h bearer rotation)** | Avoids clipboard secrets, gives DM audit trail of paired G2s, revocable per-device. | LOW | CONN-03..05, §11.5.4 | Lifted from common 2FA patterns; novel for VTT context. |
| **Fixed-width layout invariants enforced at engine, not view** | Spec §7.1a.7: panels emit `Box`/`TextRun` trees, never concatenate ASCII. CI-enforced. Argon and other HUDs hand-build CSS. | HIGH | INV-1, §7.1a | Ditherpunk/Doom-port discipline applied to layout. |
| **Glyph-based combat overlay quick-actions `[A][S][I][M]` cycling** | Argon shows action panels; EVF cycles through 4 actions with one tap. Deeper hands-free integration. | LOW | COMB-03, §7.14.3 | Faster than menu navigation, learnable in <30 sec. |
| **Animated AoE template glyphs (`✦`/`◇` blink) on glyph-mode map** | Smart-glass static glyphs feel dead; 500ms alternation makes Fireball *pulse*. | LOW | §7.4a.3 | 4-bit hardware can't do sprite engines, only `updateText` periodicity. |
| **Aesthetic positioning — Alien Nostromo / VFD / CRT green** | Every other VTT app aims for "modern flat design." EVF leans into the hardware as a feature: phosphor-green retro HUD. Marketing differentiator. | LOW | §7.1 Design Language | Adopts the constraint as identity. |

### Anti-Features — deliberately NOT building (and why)

Anti-feature catalog is critical because the AR/D&D space has many "obvious" requests that violate Core Value or hardware reality. Each item here has been considered and rejected with rationale.

| Anti-Feature | Why Often Requested | Why We Don't Build | Spec ref / Alternative |
|---|---|---|---|
| **3D rendered scene on glasses** | "AR glasses should show 3D D&D scenes!" Tilt Five does this. | G2 is 4-bit greyscale 576×288, max 200×100 image containers, no GPU. Physically impossible on this hardware. Different product category. | §3.1 hardware constraints; spec frames G2 as "monitor floating in front of the player," not "AR scene replacement." |
| **DM/GM-side features on glasses** | "DM should also have glasses for narration / monster stats." | Doubles spec surface area and mixes player/GM permission models. DM keeps laptop. Out of MVP & V2. | PROJECT.md Out of Scope: "DM continua a usare laptop tradizionale." |
| **Multi-player simultaneous G2 instances synced** | "All players at the table should wear G2!" | Foundry already syncs 4 players via existing socket; multi-G2 sync is single-player × N, not new architecture, but operational complexity (4× pairing/auth/bandwidth) is huge. Phase 13 stretch. | PROJECT.md OoS; §10 roadmap Phase 13. |
| **AI replacing or arbitrating the DM** | "Let the AI run the encounter!" | The whole point of D&D is human storytelling. AI-as-tool yes (V2 MCP); AI-as-arbiter no, ever. | §1.4 Non-Goals: "Sostituzione del DM umano." |
| **Direct D&D Beyond integration (bypass Foundry)** | "I have my chars on D&D Beyond, why do I need Foundry?" | Two sources of truth = sync hell. Foundry already imports D&D Beyond via existing modules; EVF reads Foundry. | PROJECT.md OoS; §1.4. |
| **Voice/AI as MVP requirement** | "AR glasses should have voice control like Meta Ray-Ban." | EvenAI native is non-API for devs (§3.6 verbatim verified). External MCP V2 is correct architecture but adds STT/LLM cost + latency + dependency. MVP must work 100% without LLM. | §1.2 MVP / §1.3 V2; §5.7. |
| **Audio output (TTS spoken results)** | "Tell me my roll out loud!" | G2 has no speaker (§3.1 verified). Hardware impossibility. Output stays visual: toast banner + status update. | §3.1 hardware; §7.10 Voice State 3 visual-only. |
| **Native EvenAI hijack ("Hey Even" → Foundry tool)** | "Just use the built-in voice." | EvenAI is proprietary, not exposed as API for dev apps (§3.6 verbatim from Even Realities docs). | §3.6 + §1.4 OoS; V2 uses external MCP + STT. |
| **RTL languages (Arabic, Hebrew)** | "Localization should cover everyone." | G2 firmware is monospace LTR-only; right-to-left layout would require rendering rewrite + bidirectional text engine — months of work for <1% TTRPG audience. ADR-0007. | PROJECT.md OoS; ADR-0007. |
| **Multi-tenant cloud SaaS deployment** | "I want EVF as a service." | MVP is homelab Docker Compose — single-tenant. Multi-tenant requires per-user auth, isolation, billing, observability stack. Phase 13 stretch. | PROJECT.md OoS; §11.5.3. |
| **Fully on-glasses execution (no phone WebView)** | "Why does it need the phone? Just run on the glasses!" | G2 firmware does not execute developer code; the Even Realities App on phone hosts the WebView. Verbatim Even Hub architecture. Not negotiable. | §2.1; §3.1 plugin execution model. |
| **Touch input on G2 frame (capacitive temple-tap)** | "What if I want to control without the ring?" | G2 has no documented touch sensor exposed to plugins. R1 is the only input device. Adding fallback would need Even SDK extension. | §3.2 R1 gestures; §7.14.5 (R1 disconnected → input blocked, no fallback). |
| **Camera-based gesture recognition** | "Use the camera to see hand gestures over the table." | G2 has no camera (§3.1 verified). Hardware impossibility. | §3.1; PROJECT.md OoS. |
| **Real-time biometric narrative integration as MVP** | "HR up → tense music!" | Spec has this as V2 stretch (§1.3); requires MCP/audio stack on phone, not glasses, and is purely additive. Zero MVP value if HUD doesn't work. | §1.3 obj. secondari; PROJECT.md `Sync biometrici R1 → atmosfera narrativa`. |
| **Foundry write operations bypassing GM authority** | "Let players auto-apply damage to monsters." | Permission boundary is hard-coded: NPC state changes go through `socketlib.executeAsGM`. Player can request, GM can veto. | ACT-03, §2.3. |
| **Inline rich-text rules / spell tooltips** | "Show me the spell description!" | G2 monospace 96×24 char with no scrolling rich text. Spec shows compact 1-line spell summary; full description is in Foundry, not glasses. | §7.8 Spellbook layout; §7.4a glyph dictionary (no rich text). |
| **Custom dice (DSN-style 3D animations) on glasses** | "Cool dice rolling visuals!" | 4-bit greyscale + 5 fps + image container budget rules out 3D rendering. Spec uses Unicode `⚀` indicator + numeric result toast. | §7.15 dice display. |
| **In-glasses chat input / typing** | "Let me type to the GM." | No keyboard, no virtual keyboard surface large enough on 96×24 char. Output-only on glasses; chat happens via voice (V2) or by speaking to the table. | §3.2 R1 gestures; §7.14.6 (no text input on G2). |
| **Push notifications for non-game events (weather, calendar)** | "It's a smart glass, why not show my Slack?" | Even Hub already provides those native widgets. EVF is a TTRPG app, scope-creep into general HUD = lose focus. | PROJECT.md scope. |
| **Color-coded UI (red HP low, green HP full)** | "Use color for status!" | G2 is monocrome green only (no color channel). Spec uses density/glyph variation: `█` full → `░` low. | §3.1 + §7.1a glyph dictionary. |

---

## Adversarial Gap Hunt — features the spec implicitly assumes but doesn't fully enumerate

This section is the value-add of this research — running adversarial review against the spec's strongest claims.

### Vector A — dnd5e Activity system corners

The spec covers attack, cast, use-item, place-template — the common cases. dnd5e 5.x Activity system has more activity types and edge cases:

| Gap | Why it matters | Severity | Suggested classification | Spec coverage |
|---|---|---|---|---|
| **Reaction handling beyond Shield/Counterspell (Opportunity Attack, Hellish Rebuke, Sentinel feat triggers)** | dnd5e fires `dnd5e.preUseActivity` for reactions; player needs to *see prompt* and choose use/skip in <6 sec. The spec calls reaction handling V2 (ACT-04). | MEDIUM | Differentiator if MVP, otherwise V2 | ACT-04 explicitly V2; §1.3 obj. secondari. **Gap**: even passive notification ("you could react") is not in MVP — players miss reactions silently. Recommend: at least a passive toast ("Reaction available: Shield") in MVP. |
| **Multi-attack flow (Fighter Extra Attack — 2+ attacks per Action)** | Spec §12.B q.15 flags this as open. The Combat overlay `[A]ttack` quick-action implicitly assumes 1 attack per Action. | HIGH | Table stakes (any L5+ Fighter expects this) | Open Q in §12.B; **Gap**: needs UI design for "did you attack 1 or 2 times?" Spec does not show. Recommend: action economy widget tracks `Atk 1/2` not just `Act ░`. |
| **Concentration drop mid-cast (cast new conc spell while concentrating)** | dnd5e auto-prompts; the spec §12.C q.16 calls this open for V2 voice. **MVP path is undefined**: tap-to-cast Bless while Hex is up — what happens? | HIGH | Table stakes (5e core mechanic) | §12.C q.16 only addresses voice path; **Gap**: MVP manual cast must show concentration drop confirm dialog. Recommend: modal "Cast Bless? Drop Hex (concentrating)?" before action. |
| **Legendary actions / lair actions (DM-side, but player should see "Boss is taking legendary action")** | Foundry hooks fire; combat tracker should reflect. Spec's combat tracker shows initiative + effects but not "between-turn" actions. | LOW | Differentiator | §7.6 mockup doesn't show; **Gap**: log entry would suffice, but visibility in Combat overlay is more glanceable. |
| **Save chains (Fireball → 8d6, each target rolls DEX save independently)** | §8.1 shows the V2 voice path collapses this neatly. **MVP manual path**: GM rolls saves; what does the player see during the 5-10 seconds of save resolution? | MEDIUM | Table stakes (any AoE caster) | §7.10 State 3 toast shows result *after* resolution; **Gap**: during resolution the HUD is silent. Recommend: per-target streaming log entries as saves resolve. |
| **Attack with advantage/disadvantage source resolution (Bless + Pack Tactics + prone target)** | dnd5e roll dialog asks. Spec's `weapon_attack` tool has `advantage: "auto"|"yes"|"no"` but UI flow is undefined. | MEDIUM | Table stakes | §5.3 tool input includes advantage flag; **Gap**: MVP UI to *show* sources of advantage and override. Recommend: pre-roll modal listing active modifiers with toggle. |
| **Critical hit damage doubling visualization** | Foundry doubles dice automatically. Player wants to see the moment. | LOW | Table stakes | Implicit in roll result toast; **Gap**: the visual moment of crit (vs normal hit) isn't designed. Recommend: distinct toast styling — `★ CRIT ★` banner. |
| **Ammunition tracking (consume arrow on attack)** | dnd5e automates if configured. Player checks "do I still have arrows?" | LOW | Table stakes | Implicit in inventory; **Gap**: no surfacing in Combat overlay. Recommend: weapon line shows `Longbow [3 arrows]`. |
| **Death saves (HP=0, contested rolls)** | Visceral D&D moment. dnd5e has `actor.system.attributes.death.success/failure`. | MEDIUM | Differentiator | **Gap**: not in spec. Recommend: when HP=0, status HUD pivots to death save tracker `Death ✓✓✕ (1/3 fail)`. |
| **Exhaustion levels (PHB 2024 has 10 levels, very different from 2014)** | `core.modernRules` toggle changes mechanics; spec covers dual-edition support but doesn't surface exhaustion display. | LOW | Differentiator | **Gap**: condition `Exhaustion 3/6` (2014) vs `Exhaustion 4/10` (2024) needs distinct rendering. |
| **Inspiration (2014: 1 binary; 2024: heroic inspiration die pool)** | Same dual-edition issue. | LOW | Differentiator | §7.5.2 shows `★ INSP ░` (single pip) — works for 2014 but 2024 may differ. |

### Vector B — MidiQOL workflow integration

MidiQOL is an *optional* dependency in Specs.md (FOUN-03), but most production Foundry tables run it. The spec's write-path examples (§8.1) use MidiQOL. Risks if absent:

| Gap | Why it matters | Severity | Spec coverage |
|---|---|---|---|
| **MidiQOL absent → fallback to Foundry-native `activity.use()`** | dnd5e 5.x core supports the activity flow without MidiQOL, but the rolls pause at chat-card "Roll Damage" buttons. Player on glasses sees half-resolved cards. | HIGH | §12.B q.11-12 flag MidiQOL signature open. **Gap**: MVP needs to detect MidiQOL absence and either (a) require it or (b) implement a simpler "auto-roll" path. Recommend: spec should declare MidiQOL required for MVP, OR build native fallback. |
| **MidiQOL workflow timing (preItemRoll, midi-qol.preItemRoll, midi-qol.RollComplete)** | Toast streaming relies on these hooks firing in order. If a module breaks the chain, the HUD desyncs from chat. | MEDIUM | §7.7 log shows post-resolution state; **Gap**: streaming partial state during workflow is not designed. |
| **MidiQOL "fast forward" mode vs "Foundry-native dialog mode"** | MidiQOL has settings that change roll prompts. Player on glasses can't see Foundry desktop dialog → if MidiQOL not in fast-forward, action stalls. | HIGH | **Gap**: Phase 0 should include a MidiQOL config requirement check ("MidiQOL must be in autoFastForward mode for EVF"). |
| **Chat card visibility (MidiQOL hides some cards by default)** | Player log overlay reads from `createChatMessage`; if MidiQOL filters them, log is sparse. | MEDIUM | §7.7 log; **Gap**: filter design assumes all cards arrive. |
| **Damage application asymmetry (player rolls, GM clicks "apply")** | Without MidiQOL auto-apply, damage doesn't reflect on tokens until GM intervention. HUD HP display lags reality. | HIGH | **Gap**: MVP behavior undefined when GM hasn't clicked apply yet. Recommend: log shows "Damage rolled: 28 — awaiting GM apply" state. |
| **Concentration save prompts (when concentrator takes damage)** | MidiQOL auto-prompts; Foundry-native does not. Player on glasses needs the prompt as modal. | MEDIUM | **Gap**: not in spec. Recommend: concentration save prompt = modal overlay with R1 confirm. |

### Vector C — AR HUD primitives the spec mentions but doesn't fully enumerate

| Gap | Why it matters | Severity | Spec coverage |
|---|---|---|---|
| **Boot splash error states (handshake failed, version mismatch, no character)** | §7.12 shows happy-path only. What does the boot screen show when bridge is unreachable? | MEDIUM | §7.14.5 mentions "Bridge disconnesso" → MAIN_MAP with cached state, but boot-time failure (cold start, no cache) is not designed. **Gap**: spec needs error-boot mockups. |
| **First-run / onboarding (zero-state)** | §7.12 assumes paired G2, paired R1, character selected. New user sees what? | MEDIUM | CONN-01..03 spec the phone-side wizard, but **Gap**: G2-side first-run state (waiting for phone setup) has no mockup. |
| **R1 battery low warning (not just disconnect)** | R1 at 5% — does player get a warning before disconnect? | LOW | §7.4 header `⌁ R1 92%` shows %, but **Gap**: threshold-based warning (`⌁ R1 LOW` blink at <15%) not specified. |
| **G2 battery (HUD itself)** | Spec mentions R1 battery but not G2. G2 also has battery. | LOW | **Gap**: needs header indicator. |
| **Notification queue (multiple toasts overlapping)** | Player casts Fireball (3 saves stream in), then GM applies damage, then concentrate save fires. 4 toasts in 2 seconds. | MEDIUM | §7.15.2 mentions toasts; **Gap**: queue/stack design not specified. Recommend: max 2 toasts visible, FIFO with auto-dismiss 3s. |
| **Dim / always-on / off display states (G2 firmware likely has these)** | Smart glasses dim during inactivity. EVF needs to handle re-wake without losing state. | MEDIUM | **Gap**: not addressed. Even Hub `FOREGROUND` lifecycle event mentioned in references but spec doesn't bind it. |
| **Map ping / DM-attention request (player wants to draw GM's eye to a map cell)** | VTT companion apps support player pings; spec §7.14.2 says "MAIN_MAP tap = ping cella sotto cursore" but doesn't elaborate. | LOW | §7.14.2; **Gap**: ping visibility on GM canvas + duration + visual style not specified. |
| **Long-name overflow on combat tracker (NPC "Goblin Archer Lieutenant Vossnak")** | §7.6 shows `GOBLIN ARCHER` 13ch fitting; spec §7.1a.2 says `…` truncate but combat tracker per-row width budget not pinned. | LOW | §7.1a.2 establishes pattern; **Gap**: applied to combat-tracker row not explicitly enumerated. |
| **Targeting state visualization (Foundry token targeted by my activity)** | When player taps a target, the GM canvas should highlight; conversely GM-side targeting changes should reflect. | LOW | FOUN-04 (`TokenLayer.setTargets()` v13); **Gap**: G2-side display of "currently targeting tok-goblin1" not in mockups. Recommend: status HUD shows `Target: g1` line during targeting flow. |
| **Group initiative (Foundry has it for multiple identical NPCs)** | Combat tracker shows individual rows; group rolls collapse them. | LOW | §7.6 shows individual rows; **Gap**: group-init rendering. |
| **Combat round transitions (round 1 → round 2 visual moment)** | §7.7 log shows `── ROUND 3 begins ──` line. Persistent visual moment? | LOW | §7.7; **Gap**: optional "round X" full-screen flash for 1 sec? Probably anti-feature, but unspecified. |
| **Stealth / hidden combatant rendering (token visible to me, hidden from others)** | Foundry has visibility per-user. Combat tracker should reflect. | LOW | §7.4a.4 FoW for map; **Gap**: combat tracker hidden-row state not designed. |

---

## Feature Dependencies

```
[Status HUD persistence (DISP-01)]
    └──requires──> [Layered rendering model (DISP-02)]
                       └──requires──> [Layout integrity invariants (INV-1)]
                                         └──requires──> [Snapshot test framework (Phase 4)]

[Map raster mode (MAP-01)]
    └──requires──> [PIXI canvas extract pipeline (Phase 4)]
                       └──requires──> [Phase 0 §10.0.2 updateImageRawData validation]
    └──requires──> [BLE bandwidth ≥200 kbps (Phase 0 §10.0.3)]
    └──enhances──> [6-layer optimization stack (MAP-03)]
                       └──unlocks──> [15 fps stretch target]

[Map glyph mode (MAP-02)]
    └──requires──> [SceneSnapshot extraction (Foundry hooks)]
    └──fallback-for──> [Map raster mode] when BLE saturated

[Character sheet 6-tab (SHEET-01)]
    └──requires──> [actor.system.* binding via dnd5e 5.x adapter]
    └──requires──> [Foundry adapter versioned (§5.6.2)]
    └──reads-from──> [actor.items + activity system]

[Combat tracker (COMB-01)]
    └──requires──> [Combat document hooks (updateCombat, updateActor)]
    └──enhances──> [Action economy widget (COMB-02)]
                       └──requires──> [dnd5e activity system access]

[Spell cast manual (ACT-01)]
    └──requires──> [activity.use() write path (FOUN-03)]
    └──requires──> [AbilityTemplate.fromActivity() (ACT-02)]
    └──requires──> [TokenLayer.setTargets() v13 (FOUN-04)]
    └──enhances──> [MidiQOL workflow integration]
                       └──critical-for──> [Damage auto-apply, concentration saves]

[Quick Action Menu (NAV-02)]
    └──requires──> [R1 long-press gesture (Phase 0 §10.0.1)]
    └──unlocks──> [Cross-overlay navigation reachability (NAV-03)]

[Boot handshake (NAV-04)]
    └──requires──> [Capability negotiation (§5.6.3)]
    └──requires──> [Bearer token + QR pairing (CONN-03..05)]
                       └──requires──> [Phone setup wizard (CONN-01)]

[Voice/AI V2 (VOICE-01..05)]
    └──requires──> [MCP server foundry-mcp (§5.7) — independent module]
    └──requires──> [Tool registry parity with manual path (§5.3)]
    └──independent-from──> [MVP] (zero MVP coupling)
    └──conflicts──> [Native EvenAI hijack] (anti-feature)
```

### Critical dependency notes

- **MAP-01 (raster) requires Phase 0 GO/NO-GO §10.0.2 + §10.0.3** — if either fails, fallback is MAP-02 (glyph) only, raster moves to Phase 13 stretch (per spec §10.0.5 decision tree)
- **All write actions require working MidiQOL OR Foundry-native fallback** — see Vector B gap above; spec §12.B has open questions
- **R1 disconnect blocks all input** (§7.14.5) — there is *no* fallback gesture model on G2 native; this is a single-point-of-failure
- **Sheet portrait image (§7.5.8) takes 1 of 4 image containers when overlay open** — degrades raster from 2×2 to 3-tile during sheet view; `sheet.portrait.enabled` feature flag is OFF until Phase 0 validates

---

## MVP Definition (re-validated against spec)

The spec's Phase 0–10 = MVP (13 weeks). Re-classified per this research:

### Launch With (v1 = MVP)

Specs.md commits these and they are table-stakes per this research:

- [x] **Persistent Status HUD** (DISP-01..03) — non-negotiable for AR-form-factor
- [x] **Map raster mode default + glyph fallback** (MAP-01..05) — Core Value enabler
- [x] **6-tab Foundry-faithful sheet** (SHEET-01..04) — table-stakes
- [x] **Combat tracker + action economy** (COMB-01..03) — table-stakes
- [x] **Manual spell cast / weapon attack / item use via R1** (ACT-01..03) — only viable input model
- [x] **Quick Action menu (long-press R1)** (NAV-01..04) — discovery escape hatch
- [x] **Foundry module + bridge service + Docker Compose deploy** (FOUN-01..04) — architecture foundation
- [x] **Boot splash + capability handshake + QR pairing** (CONN-01..05, NAV-04) — first-run UX
- [x] **i18n auto-detect + runtime override** (I18N-01..05) — multi-locale table-stakes

**Adversarial gaps that should join MVP** (from Vector A/B/C above):

- [ ] **Reaction *notification* (passive toast)** — without this, players silently miss reactions in 5e (Vector A). Recommend MVP, even if execution is V2 (ACT-04).
- [ ] **Concentration drop confirm modal on cast** — 5e core mechanic, spec gap (Vector A)
- [ ] **Death saves status HUD** — visceral D&D moment, missing from spec (Vector A)
- [ ] **MidiQOL config requirement check at boot** — Phase 0 should validate MidiQOL present + autoFastForward (Vector B)
- [ ] **Boot error states (handshake failed, version mismatch, no character)** — spec mockups happy-path only (Vector C)
- [ ] **Toast queue/stack (max 2 visible, FIFO 3s)** — Fireball + saves chain overflows visible area (Vector C)
- [ ] **Multi-attack action tracker `Atk 1/2`** — Fighter L5+ flagged in spec Open Questions §12.B q.15 (Vector A)

### Add After Validation (v1.x — Phase 11+)

- [ ] **Voice/AI via MCP** (VOICE-01..05, §5.7) — purely additive, post-Phase 10 (V2 OPZIONALE)
- [ ] **Reaction execution (Shield, Counterspell auto-trigger flow)** (ACT-04) — V2
- [ ] **Push notifications (turn start, concentration drop, HP critical)** (§1.3) — V2
- [ ] **Biometric narrative cues (R1 HR → audio cue)** (§1.3) — V2 stretch
- [ ] **Multi-target intelligent selection** — V2
- [ ] **Group initiative collapsing** (Vector C gap)
- [ ] **Stealth / hidden combatant separate row in tracker** (Vector C gap)
- [ ] **Advantage/disadvantage source modal** (Vector A gap)
- [ ] **Ammunition tracking display** (Vector A gap)
- [ ] **Per-target streaming save resolution log** (Vector A gap)

### Future Consideration (v2+ / Phase 13 stretch)

- [ ] **Multi-player sync (4× G2 simultaneously)** — Phase 13 stretch
- [ ] **Multi-tenant cloud SaaS** — Phase 13 stretch
- [ ] **Server-side canvas extract (no PIXI in player WebView)** — Phase 13 stretch (§7.4b.8 Option B)
- [ ] **Advanced compression (Brotli, fflate)** — Phase 13 open question (§11.5.7)
- [ ] **In-glasses audio capture for V2 voice** (§7.10 note: "evoluzione futura")

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| Status HUD persistent | HIGH | LOW | **P1** |
| Layout integrity invariants | HIGH (failure = product feels broken) | HIGH | **P1** |
| Sheet 6-tab faithful | HIGH | MEDIUM | **P1** |
| Combat tracker | HIGH | MEDIUM | **P1** |
| Spellbook with cast | HIGH | MEDIUM | **P1** |
| Inventory with use/equip | HIGH | MEDIUM | **P1** |
| Quick Action menu | HIGH | LOW | **P1** |
| R1 gesture model | HIGH | MEDIUM (Phase 0 dependent) | **P1** |
| Map raster default | HIGH | HIGH | **P1** (with glyph fallback) |
| Map glyph fallback | MEDIUM | MEDIUM | **P1** (de-risks raster) |
| Boot splash + handshake | MEDIUM | LOW | **P1** |
| QR pairing + bearer token | MEDIUM | LOW | **P1** |
| i18n auto-detect | MEDIUM | MEDIUM | **P1** |
| 6-layer optimization stack | HIGH (15 fps stretch) | HIGH | **P2** (5 fps committed = P1 layers, 15 fps stretch = P2) |
| Concentration drop modal | HIGH (Vector A gap) | LOW | **P1** (needs MVP add) |
| Death saves HUD | HIGH (Vector A gap) | LOW | **P1** (needs MVP add) |
| Reaction passive toast | MEDIUM (Vector A gap) | LOW | **P1** (needs MVP add) |
| MidiQOL config check | HIGH (Vector B gap) | LOW | **P1** (needs MVP add) |
| Boot error states | MEDIUM (Vector C gap) | LOW | **P1** (needs MVP add) |
| Toast queue | MEDIUM (Vector C gap) | LOW | **P1** (needs MVP add) |
| Multi-attack tracker | HIGH (Vector A gap) | MEDIUM | **P1** (needs MVP add) |
| Voice/AI via MCP | HIGH (differentiator) | HIGH | **P2** (V2 OPZIONALE, post-Phase 10) |
| Reaction execution flow | MEDIUM | MEDIUM | **P2** (V2) |
| Biometric narrative cues | LOW | MEDIUM | **P3** (V2 stretch) |
| Multi-player sync | LOW (single-player MVP works) | HIGH | **P3** (Phase 13 stretch) |
| Multi-tenant SaaS | LOW (homelab MVP works) | HIGH | **P3** (Phase 13 stretch) |
| 3D scene rendering | — | impossible on G2 | **anti-feature** |
| DM-side glasses | — | scope explosion | **anti-feature** |
| AI as DM | — | violates Core Value | **anti-feature** |

**Priority key:**
- **P1** = MVP must-have
- **P2** = V2 (Phase 11+, opzionale)
- **P3** = Phase 13 stretch / deferred

---

## Competitor Feature Analysis

| Feature | D&D Beyond mobile | Foundry desktop UI | Argon Combat HUD | Mirrorscape (AR) | Tilt Five | EVF (our approach) |
|---|---|---|---|---|---|---|
| Character sheet | Full, official | Full, system-defined | Subset (combat-focused) | Via Foundry | Via Fantasy Grounds | Foundry-faithful 6-tab on G2 |
| Combat tracker | Beta (2024+) | Yes | Yes (its main feature) | Limited | Via VTT integration | Yes, with effects + concentration source |
| Spellbook | Yes (subscription) | Yes | Quick-cast subset | Yes | — | Two surfaces (deep+quick) |
| Inventory | Yes | Yes | Subset | — | — | Two surfaces (deep+quick) |
| Map / VTT view | No (companion only) | Canvas | No (HUD only) | AR table replacement | 3D holographic table | 4-bit dithered raster + glyph fallback |
| Voice control | No | No | No | "Coming" via Snapdragon Spaces | No | V2 OPZIONALE via MCP (any LLM client) |
| Hands-free | No (touch app) | No (mouse) | No (mouse) | Hand+eye tracking | Wand controller | R1 ring (3 gestures) |
| GM authority | Yes (DM tools subscription) | Yes (built-in) | Yes (Foundry-rooted) | Player-authoritative | Mixed | **Strict** via socketlib + MidiQOL |
| Form factor | Phone | Desktop monitor | Desktop monitor | AR glasses (Lenovo proto) | AR glasses (proprietary) + game board | Even G2 (4-bit greyscale) + R1 ring |
| Eyes-on-table | No (look at phone) | No (look at monitor) | No (look at monitor) | Yes (look at AR table) | Yes (look at table through glasses) | **Yes** (peripheral HUD, real table center) |
| Cost (player) | $0–$60/yr | $0 (paid by GM) | $0 (Foundry module) | Hardware TBD | $359 set | G2 ~$650 + R1 + Foundry |
| Hardware-constrained streaming | N/A | N/A | N/A | High-end AR | Custom holographic | **Doom-on-watch pattern** (4-bit + dither + delta + RLE + adaptive fps) |

**Positioning insight:** EVF is the only product in this space that:
1. Augments **existing physical play** (paper map, miniatures, human DM) rather than replacing it (vs Mirrorscape/Tilt Five)
2. Speaks **MCP-native** so any LLM client integrates (vs none)
3. Treats **Foundry as authoritative source of truth** while running on glasses (vs D&D Beyond, which is its own silo)
4. Uses **Doom-on-watch** streaming pattern for hardware-constrained AR (novel application)

---

## Sources

### Spec / project (canonical)
- [Specs.md v0.9.11 (project canonical)](file:///home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/Specs.md) — §1, §5, §6, §7, §8, §10, §12 referenced
- [PROJECT.md (GSD projection)](file:///home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/PROJECT.md)

### VTT companion landscape
- [Argon - Combat HUD (DND5E)](https://foundryvtt.com/packages/enhancedcombathud-dnd5e) — canonical Foundry HUD module reference
- [Argon - Combat HUD (CORE)](https://foundryvtt.com/packages/enhancedcombathud)
- [D&D Beyond Mobile App – D&D Beyond support](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193137684-D-D-Beyond-Mobile-App)
- [Plans for Encounters/Combat Tracker in Mobile App? - D&D Beyond Forums](https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/d-d-beyond-mobile-app-feedback/116190-plans-for-encounters-combat-tracker-in-mobile-app)
- [Best D&D Apps for Players and GMs in 2026 — StoryRoll](https://storyroll.app/blog/best-dnd-apps-2026)
- [Best Virtual Tabletops for D&D in 2026 — StoryRoll](https://storyroll.app/blog/best-virtual-tabletops-dnd-2026)
- [VTT Quality of Life & Feature Improvements – Roll20 Help Center](https://help.roll20.net/hc/en-us/articles/25289127045143-VTT-Quality-of-Life-Feature-Improvements)

### AR / smart-glass tabletop & HUD design
- [Mirrorscape's new AR tabletop platform — TechCrunch](https://techcrunch.com/2023/07/26/gaming-startup-mirrorscape-tabletop-gaming-ar/)
- [Tilt Five — AR Made To Crowd Around](https://www.tiltfive.com/)
- [Google Glimmer UI design language for AR HUD glasses — UploadVR](https://www.uploadvr.com/google-details-glimmer-its-ui-design-language-for-hud-ar-glasses/)
- [Smart Glasses With Display: HUD vs Virtual Screen Guide 2026 — Even Realities](https://www.evenrealities.com/blog/smart-glasses-with-display)
- [Even Realities Even Hub Launches — Next Reality](https://virtual.reality.news/news/even-realities-even-hub-launches-can-constrained-smart-glasses-build-an-app-ecosystem/)
- [Dashboard – Even Support Center](https://support.evenrealities.com/hc/en-us/articles/14269247458319-Dashboard)

### Doom-on-exotic-devices pattern (raster pipeline lineage)
- [DOOM on a watch (jborza, 2020)](https://jborza.com/post/2020-11-20-doom-on-a-watch/)
- [rp2040_doom_1b](https://github.com/meadiode/rp2040_doom_1b)
- [Ditherpunk (surma.dev)](https://surma.dev/things/ditherpunk/)
- [DOOM 16-color Atari ST port — Tom's Hardware](https://www.tomshardware.com/video-games/retro-gaming/doom-slithers-and-dithers-its-way-with-a-16-color-atari-st-port)

### Foundry / dnd5e API references (cited from Specs.md §13)
- [dnd5e source (5.3.x)](https://github.com/foundryvtt/dnd5e)
- [Activity classes (dnd5e 5.3.x)](https://github.com/foundryvtt/dnd5e/tree/5.3.x/module/documents/activity)
- [MidiQOL](https://gitlab.com/tposney/midi-qol)
- [socketlib](https://github.com/farling42/foundryvtt-socketlib)

### MCP (V2 voice path)
- [Model Context Protocol spec](https://modelcontextprotocol.io/)
- [Anthropic MCP docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)

---

*Feature research for: D&D 5e companion app on Even Realities G2 AR glasses (greenfield)*
*Researched: 2026-05-10*
*Confidence: HIGH on spec-committed features (cross-validated v0.9.11), MEDIUM on adversarial-found gaps, LOW on AR-HUD-specific UX claims (G2 product is novel, no direct competitor on this hardware)*
