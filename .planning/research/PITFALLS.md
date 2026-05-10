# Pitfalls Research

**Domain:** FoundryVTT D&D 5e companion plugin streaming to Even Realities G2 AR glasses + R1 ring (BLE), with optional V2 MCP voice
**Researched:** 2026-05-10
**Confidence:** MEDIUM (HIGH on Foundry/dnd5e + BLE physics + i18n via official docs and Specs.md cross-validation; MEDIUM on Even Realities firmware/policy due to limited public surface; LOW on MCP streaming UX which is rapidly evolving 2025-2026)

> **Scope contract.** Specs.md §11 (Risk Assessment), §11.5.8 (Failure Modes), §12 (Open Questions) already enumerate the obvious risks. This document is the **gap layer**: the things experience teaches that the spec under-specifies, the second-order failure modes, and the "looks done but isn't" traps that bite during implementation. Each pitfall is **specific to this stack** (Foundry + dnd5e 5.x + BLE-bound G2 + 4-bit raster + R1 gestures + 3-tier settings + optional MCP) — not generic advice.
>
> Cross-references: §X.Y refers to Specs.md unless noted. Phase numbers refer to Specs.md §10 roadmap (Phase 0–10 MVP, 11–13 V2).

---

## Critical Pitfalls

### Pitfall 1: dnd5e 5.x Activity System "shim removed" assumption — code written against pre-5.0 patterns silently breaks

**What goes wrong:**
Pre-5.0 shims for the legacy roll/use API have been **fully removed in dnd5e 5.0.0**. Code paths that grep examples from blog posts, old modules, or Activities-wiki snippets older than ~Q3 2025 will reach `item.use({})` patterns that no longer route through the activity layer the way 5.x assumes. Symptoms: roll happens but card doesn't post, MidiQOL workflow doesn't fire, advantage state is dropped, `activity.use` returns a rolled `Activity` object whose shape differs from `Item5e#use`'s legacy return, and `system.method` (the new attack/save method discriminator) is read with the old key path. Spec §11 lists "MidiQOL breaking changes" but **understates** that the breakage is a **schema-level move**, not a function-rename.

**Why it happens:**
The dnd5e team committed to forward-only migration; documentation at `dnd5e/wiki/Activities` reflects current state but the broader ecosystem (forum threads, community macros, blog tutorials) still references pre-5.0 patterns. Devs grep for "how do I roll an attack programmatically" and land in 2023 examples.

**How to avoid:**
1. **Pin the adapter layer** (`packages/foundry-module/src/adapters/dnd5e@5.x`) to read **only** from `actor.items[i].system.activities[j]`. Do NOT touch `item.system.actionType` (legacy), `item.system.damage.parts` (legacy), or `item.system.activation.cost` (legacy) directly — these still exist for back-compat read but the **canonical write surface is the activity object**.
2. The "writer" boundary calls `activity.use({ configure: false, event: null })` and **never** falls back to `item.use(...)` even when an item appears to have only one activity.
3. Build the adapter against **dnd5e 5.3.x specifically** (Specs §3.4 mandate). When 6.x lands, write a parallel adapter — do NOT in-place upgrade.
4. Phase 0 fixture: dump `actor.items.find(i => i.type === 'spell')` **as JSON** for a level-3 Fireball-equipped spell, freeze the schema, snapshot-test the reader.

**Warning signs:**
- Phase 7 writer test "Shortsword attack via REST → chat card" produces a chat card but `MidiQOL.Workflow.workflows` is empty.
- `activity.use()` resolves with a value but `actor.system.spells.spell3.value` doesn't decrement (slot consumption depends on activity, not item).
- `actionType` exists on the item but the activity has no `attack`/`save`/`damage` activity child of the right kind.
- Fighter Extra Attack triggers the action twice but only one chat card posts (multi-attack route via activity is `attack.rollAttack({ count: 2 })` per Specs §12.B q15 — confirm in Phase 7).

**Phase to address:** Phase 0 (schema fixture freeze) + Phase 2 (reader implementation) + Phase 7 (writer implementation, where this bites hardest).

**Severity:** **CRITICAL** — entire write path is unusable if the wrong API is targeted.

---

### Pitfall 2: BLE bandwidth measurement that excludes WiFi 2.4 GHz coexistence is optimistic by 30–60% — Phase 0 §10.0.3 will lie

**What goes wrong:**
Specs §10.0.3 measures sustained throughput for 1 minute on a clean RF environment. **D&D sessions don't happen in clean RF environments.** They happen in living rooms with 2.4 GHz WiFi (channel 6, 11), microwave usage, neighbor APs, smart bulbs (Zigbee 2.4 GHz), Bluetooth speakers, and 4–6 phones doing WhatsApp. Spec §11 acknowledges "BLE bandwidth degraded" only as a single failure mode (§11.5.8.2); it doesn't capture **dynamic degradation mid-session** when someone microwaves popcorn at round 4. Specs §10.0.3 measures peak; reality has long-tail dropouts.

**Why it happens:**
BLE 4.2/5.x lives in 2.4 GHz ISM band, frequency-hopping across 37 data channels. Adaptive Frequency Hopping helps but doesn't eliminate co-channel WiFi blocking. Real-world phone↔glasses link is also affected by hand position (R1 ring on dominant hand can attenuate G2 signal when phone is in pocket on opposite side). DLE negotiation (§10.0.7) happens at connect time; if it fails to upgrade, you're stuck at 27-byte PDU for the entire session — and many phone BLE stacks will **silently fall back** without notifying the application layer.

**How to avoid:**
1. Phase 0 §10.0.3 must be run **three times**: clean RF, with 5 GHz WiFi loaded (control), and with 2.4 GHz WiFi + co-located Zigbee bulb (worst-case home). Document p50/p95/p99 separately for each.
2. Add a **continuous bandwidth telemeter** in the bridge → G2 path (already implied by Specs §5.6.6 telemetry). Surface a `⚠ DEGRADED` chip in the HUD header (sibling to `⌁ R1 92%`) when measured throughput drops below 100 kbps for >5 sec.
3. Make adaptive frame rate (Layer 6, §7.4b.6.1.2) listen to the telemeter, not just the dirty-region heuristic. **Specs only ties Layer 6 to scene activity** — that's a one-input control loop, brittle.
4. On DLE negotiation, log **exact negotiated MTU** at connect, abort raster path entirely if MTU < 64 bytes (Branch C glyph-only override, even if Phase 0 nominally OK).
5. Field test (Phase 10) **must include a microwave test**. Sounds silly. Isn't.

**Warning signs:**
- Sustained throughput in the lab is 250 kbps; first user reports 5–8 kbps "every now and then for ten seconds".
- Phase 0 §10.0.3 result shows median 200 kbps but p99 is 35 kbps — the long tail is the user-perceived experience.
- Dropped tile log shows clusters of 5–20 consecutive drops correlated with no app-level cause.

**Phase to address:** Phase 0 (extend §10.0.3 with multi-environment tests + telemeter spec) + Phase 4 (telemeter-driven Layer 6 input) + Phase 10 (real-world field test).

**Severity:** **CRITICAL** — degrades raster MVP from "works" to "works in lab" without this.

---

### Pitfall 3: Delta-encoding tile loss = silent corruption that survives reconnect

**What goes wrong:**
Spec §11.5.8.5 covers G2 firmware queue saturation ("frame skip if previous hasn't completed"). **It does not cover the delta-encoding correctness consequence**: when the bridge ships tile T_n as a delta against T_{n-1}, and T_{n-1} was dropped (firmware queue overflow, BLE retry exhaustion, app backgrounded), then T_n is applied to the wrong base. The G2 displays a corrupted tile **and the bridge has no idea** because the bridge doesn't get an ACK per tile in raw-data path. Visual symptom: ghosting where a token used to be, persistent for the rest of the session until that sub-tile fully rewrites.

**Why it happens:**
Delta encoding (§7.4b.6.1.2 Layer 1) is a one-way hash diff. The contract assumes lossless transport. BLE notifications are not fully reliable in the application sense — the link layer ACKs but if the GATT write times out from the app side and the firmware drops, there's no app-layer recovery. xxhash on the bridge side keeps a "last sent state" that diverges from G2's actual state.

**How to avoid:**
1. **Keyframe interval**: every N seconds (start with N=10, tune in Phase 0 §10.0.8/§10.0.9 results), force a full-tile push that ignores the delta cache. Refresh = correctness checkpoint. Cost: 4 tiles × ~3 KB / 10 sec = ~1.2 kbps overhead, negligible.
2. **Sequence numbers** on every tile. Bridge tracks `last_acked_seq` per tile. If gap detected on next-tile metadata response, force full re-push of the gap tile.
3. **Idle reconciliation**: when adaptive fps drops to 0.3 fps idle (Layer 6), use the spare BLE budget to round-robin-verify all 4 tiles' xxhash by re-pushing one tile/sec. Self-healing baseline.
4. On **reconnect** (§11.5.8.1), **mandatory full keyframe** of all 4 tiles regardless of delta state — never trust the local cache across a sync-lost event.

**Warning signs:**
- "Ghost tokens" that don't move when scene changes — tile delta saw no diff because the previous broken state happened to xxhash-collide with the current intended state.
- After a `⚠ SYNC LOST` clear, partial tiles remain stale.
- Player reports "the goblin is still there" but Foundry shows it dead and removed.

**Phase to address:** Phase 4 (raster engine — keyframe + seqno is core, not a nice-to-have).

**Severity:** **CRITICAL** — corrupts the primary surface invisibly.

---

### Pitfall 4: HUD information density that violates AR cognitive-load research — the §7.4 status HUD as designed is too dense for sustained wear

**What goes wrong:**
The §7.4 raster mode mockup has the right side perpetually showing: name + class + HP bar + HP numeric + temp HP + AC + SPD + Action/Bonus/Reaction status + Move + 3 spell slot levels with checkboxes. That's **~12 distinct data points**, monocular, phosphor green, **always on**. AR research (Meta Ray-Ban Display ergonomic studies, INAIRSPACE 2024 guidance, MDPI 2024 Logistics-Picking smart-glasses observational study) consistently shows that **persistent HUDs >5 active info chips cause sustained accommodation-vergence stress and eye fatigue measurable at the 30-minute mark**. D&D sessions are **3–6 hours**.

The Core Value commitment in PROJECT.md is "the player never looks away from the table." If the HUD causes them to consciously dim/dismiss it 90 minutes in, that commitment fails — they go back to looking at the laptop.

**Why it happens:**
The mockup was designed by analogy to a desktop sheet (Foundry-faithful, §SHEET-01) where information density is normal because the user has gaze controllability. AR has zero gaze-away affordance — the chip is in your visual field whether you focus on it or not. Persistent + unfocusable + constant illumination = fatigue.

**How to avoid:**
1. **Layered HUD priority** (extend §7.2 layered model): chips have a priority (P1 always, P2 active-condition-only, P3 demand-only). Default state: only HP + slot-summary visible. AC, SPD, Move, Action-economy chips appear **only during combat tracker active** (Specs §COMB-01). Bonus/Reaction chips appear only when their use-window is open (turn start, reaction trigger).
2. **Idle dimmer**: after 30 sec of no scene change AND no R1 input, dim the status HUD to 50% intensity (G2 supports brightness API per §3.1 SDK surface). Restore on R1 tap or scene event.
3. **User toggle**: Quick Action `[H] HUD` to cycle Off / Minimal (HP only) / Standard / Full. Default Standard. Persisted Tier 4 (G2 device-local).
4. **Field test gate**: Phase 10 field test must include a 90-minute continuous wear measurement with a self-report eye fatigue score (NASA-TLX subscale or Borg CR-10). If the median score crosses fatigue threshold, the default density needs reduction before MVP ship.

**Warning signs:**
- Phase 10 field test player says "I dismissed the chips after 30 min".
- Player blinks more frequently when HUD is on vs glyph mode.
- Player removes glasses to read paper sheet — sign that HUD became cognitively expensive.

**Phase to address:** Phase 4 (HUD layered priority + dimmer logic) + Phase 10 (field test verification with fatigue metric).

**Severity:** **CRITICAL** — directly contradicts the core value proposition if uncaught.

---

### Pitfall 5: R1 long-press → context-sensitive Quick Action menu is **input-mode-ambiguous**

**What goes wrong:**
Specs §NAV-01 maps long-press to "Quick Action menu" but Specs §7.13 / §7.14 also implies long-press is the entry point that **changes meaning depending on which overlay is open**. So:
- On main HUD long-press → Quick Action menu `[S][C][L][B][I][A][M][N][X]` (9 options).
- On Combat overlay long-press → quick-action `[A][S][I][M]` (4 options, different semantics).
- On Sheet overlay long-press → ??? (Specs underspecifies — it shows the panel close affordance via double-tap, but what does long-press do? Is it the same 9-option menu or context-different?).

Users will press long without checking which overlay is on top, get a different menu than expected, hit the wrong gesture, and either trigger an unintended action (Quick Action `[X] eXit` from inside Sheet might mean "close sheet" or "logout" depending on routing). Even simulator §7.14.4 verification checklist 10× catches **reachability and closability** but not **gesture polysemy**.

**Why it happens:**
Single gesture on a 3-input device (tap / scroll / long-press) is overloaded by necessity. Without an explicit visual "current input context" indicator, users can't disambiguate without trial-and-error, and trial-and-error during combat is socially expensive ("wait, what did I just cast?").

**How to avoid:**
1. **Universal long-press semantic**: long-press always opens the Quick Action menu of the **current top layer** — never something else, never close, never confirm. Document this as an INV (call it INV-5 "Gesture Determinism").
2. **Visible context chip** in the status HUD footer: `R1: tap=cycle  scroll=nav  long=quick[combat]` — the `[combat]` suffix names the menu that long-press would open *right now*. This is already partially in §7.14 footer but inconsistently applied in mockups.
3. **Confirm-before-execute** for any Quick Action that has destructive or game-state-altering effect (`[X] eXit`, any cast/use). Tap-to-confirm modal. Specs §7.11 has "Clarify Overlay" for V2 voice; reuse the same shape for MVP destructive Quick Actions.
4. **Phase 6 R1 integration test**: verification checklist line item — "from each of the 8 reachable screens, long-press opens a Quick Action menu, and the menu's title matches the current layer name shown in the footer chip".

**Warning signs:**
- Phase 6 field tester says "I keep pressing long to close the sheet".
- Telemetry shows users open Quick Action then immediately double-tap to back out (mispress signature).
- Same user opens sheet then opens Quick Action without doing anything in between (probably trying to close sheet).

**Phase to address:** Phase 6 (R1 integration — define INV-5 and footer chip explicitly) + Phase 8 (Manual Action UX — confirm-before-execute pattern).

**Severity:** **IMPORTANT** — degrades trust and creates "what did I just do?" moments. Not project-killing but corrosive.

---

### Pitfall 6: socketlib + MidiQOL + activity.use chain has an undocumented re-entrancy: GM-forwarded action invokes a hook that the player client also handles, double-firing

**What goes wrong:**
Specs §FOUN-03 routes write actions through `activity.use()` directly when the player owns the actor; Specs §ACT-03 routes "GM-side actions" via `socketlib.executeAsGM`. The socketlib README says "if multiple GMs are connected, only one will execute the function" — true — but it doesn't say what happens to **hooks that the originating player client also subscribes to**.

Concrete scenario: player triggers attack via R1 → Foundry module writer calls `activity.use()` locally → MidiQOL `preItemRoll` hook fires on the player client → player client also forwards the same activity to GM via socketlib (because the activity has an NPC target requiring GM-side damage application) → GM client picks up, calls some MidiQOL completion hook → MidiQOL workflow on GM tries to nest with the player's already-running workflow → result varies from "nothing happens" (workflow detects nested context and bails) to "damage applied twice" (workflow contexts diverge and both complete).

Specs §12.B q11/q12 already mark `completeItemUse`/`completeActivityUse` signature as Phase 7 validation TODO. The pitfall is that the **signature is the easy part** — the **hook re-entrancy semantics under socketlib are the hard part** and entirely undocumented upstream.

**Why it happens:**
MidiQOL was designed assuming workflows are initiated locally and don't span socket boundaries. socketlib was designed assuming function calls are stateless. Their composition is a third-party concern.

**How to avoid:**
1. **Single workflow origin rule**: never call `activity.use()` on the player client AND forward the same activity via socketlib in the same logical action. Either:
   - **(A) GM-side execution**: Bridge sends action to Foundry module via WS; module always uses `socketlib.executeAsGM` to run `activity.use()` on the GM client; player client never directly uses the activity. Pro: single workflow origin. Con: GM must be online (already a Foundry assumption).
   - **(B) Player-side execution + GM result forwarding**: Player client `activity.use()`; the *result* (damage rolls, effects to apply) is forwarded to GM via socketlib for application to NPCs. Pro: lower latency. Con: requires careful workflow boundary discipline.
2. **Decision: choose (A) for MVP.** It's simpler to reason about and matches the existing pattern of `foundryvtt-rest-api` + Foundry API Bridge that the project references.
3. **Hook tracking**: register MidiQOL hooks in the module's namespace (`evf:*`) and have them no-op when `workflow.context.evf.handled === true`. This protects against double-fire if (B) is later chosen.
4. **Phase 7 test**: end-to-end Shortsword vs NPC — confirm exactly **one** chat card, **one** damage application, **one** entry in MidiQOL.Workflow.workflows.

**Warning signs:**
- Phase 7 manual test: NPC takes double damage.
- MidiQOL chat card has `[error]` or `[duplicate workflow]` warning.
- Workflow promise rejects with "workflow already in progress for this item".

**Phase to address:** Phase 7 (write path — pick option A, document in ADR alongside the §10.0.10 P2 row 1 validation).

**Severity:** **CRITICAL** — silent double-damage breaks game integrity. Player can't trust the system.

---

### Pitfall 7: Even Realities SDK has no SemVer guarantee — firmware OTA can change `updateImageRawData` byte format mid-life

**What goes wrong:**
Even Realities is a young hardware company (CES 2026 award per Specs §13). The G2 firmware is OTA-updatable (per Even Support Center). The public SDK surface (hub.evenrealities.com/docs/guides/device-apis) does not commit to SemVer or backward compatibility — there is **no published API contract** that says "format version 1 will be supported through firmware version Y". Specs §11 lists "Even Hub G2 SDK rotture" as a single Medium-probability risk; this **understates the structural exposure**: the project ships an MVP keyed to a specific format identification done in Phase 0 §10.0.2, and a single OTA between launch and field test could invalidate that finding.

Worse: the Even Realities App that hosts the WebView plugin is also independently updated, and changes to the webview environment (CSP rules, available WebAPIs, app.json schema) can break the plugin without any G2 firmware change.

**Why it happens:**
Hardware SDK promises require a maturity stage Even Realities hasn't yet reached. The ecosystem precedents are:
- **Brilliant Labs Frame, Mentra, Vuzix**: small ecosystems, episodic SDK breakages.
- **Microsoft HoloLens 2 → 3**: years of stability, but huge investment.
Even is closer to the first cohort.

**How to avoid:**
1. **Capability-negotiation handshake** is already in Specs §5.6.3 — extend it to include `firmware_version` and `app_host_version` reported back to bridge on connect. Bridge logs every observed combination; you'll have telemetry to detect distribution drift.
2. **Format probe at every boot** (cheap version of §10.0.2): on first connect after app start, send a known test pattern to the image container and have the plugin self-test that the rendered output matches expected. Bail out to glyph mode automatically if mismatch detected.
3. **Pin the Even Realities App version** in setup documentation. Maintain a tested-against matrix: `(Even App vX.Y, G2 firmware Z) → status`. Update it after each tested OTA.
4. **Issue subscription**: monitor Even Realities forum + GitHub orgs (`even-realities`, `BxNxM/even-dev`, `i-soxi/even-g2-protocol` reverse-engineering) weekly. Specs §11 "monitoraggio changelog" is correct intent — operationalize it as a Phase 10 pre-ship checklist item and a Phase 13 ongoing.
5. **License + distribution risk**: there is no published "Even App Marketplace approval" policy. Don't assume your plugin URL whitelist will be honored long-term. **Have a cloud-hosted fallback plugin URL** ready and instructions for users to switch.

**Warning signs:**
- Image render arrives but is bit-shifted or vertically mirrored — format changed.
- Plugin loads but `bridge.audioControl()` returns undefined — webview API surface changed.
- Even App update on a user's phone bricks the plugin in field.

**Phase to address:** Phase 0 (boot-time format probe spec) + Phase 5 (capability handshake extension) + Phase 10 (compatibility matrix doc) + Phase 13 (continuous monitoring runbook).

**Severity:** **CRITICAL** — single firmware OTA can disable the project for all users with no warning.

---

### Pitfall 8: 3-tier settings model creates "world-vs-phone-vs-glasses" override conflict during live session — user mental model breaks at the seam

**What goes wrong:**
Specs §7.14.6 + §11.5.5 define three settings surfaces: **Foundry world** (DM-set, world-scope), **Even App phone** (player-set, device-scope, connection bootstrap), **G2 device-local** (gesture-set, runtime override). The decision tree is clean **on paper**. In practice, during a 4-hour session at round 6:
- DM changes world setting `view.dither.algo` from FS to Atkinson at the world level (because someone complained).
- Player has overridden `view.map.mode` to glyph on G2 device-local.
- Player's phone has stale `bridge_url` from a 3-month-old homelab move.

Conflict resolution in §11.5.5 says "Tier 3 phone wins for connection-bootstrap; Tier 4 G2 wins for gesture overrides; Tier 1/2 bridge invisible to user". But:
- The DM doesn't see what the player overrode.
- The player doesn't see what the DM changed.
- Neither knows the bridge URL is stale until handshake fails.

**Specs §7.14.7.4 covers some edge cases (bridge unreachable, token expired)** but doesn't cover **mid-session setting-conflict surfaces**: e.g., DM toggles world `core.modernRules` 2014→2024 mid-session — what happens to the player's open Sheet panel that's reading dual-edition data?

**Why it happens:**
3-surface settings models work when each surface owns disjoint settings AND state changes are infrequent. Live D&D sessions have frequent state changes (DM re-tunes), and the surfaces are remote from each other (DM laptop, player phone, player glasses) so visibility is asymmetric.

**How to avoid:**
1. **Setting change broadcast**: any world-scope setting change triggers a WS event from Foundry module → bridge → G2 plugin. G2 shows a brief toast "DM changed `dither` to Atkinson" so the user knows something just shifted, not "why is the map suddenly different?".
2. **Setting introspection screen**: Quick Action `[?] Settings` (add to the menu, currently `[S][C][L][B][I][A][M][N][X]`) shows a read-only summary: "Dither: Atkinson (world) · Map: glyph (your override) · Bridge: lan:8910 (phone)". User can see the resolved state.
3. **Settings reset per session**: G2 device-local Tier 4 overrides should auto-clear at end-of-session detection (no actor change or BLE disconnect for >2h). Prevents stale overrides leaking into next session. Make this a setting `view.overrides.persistAcrossSessions` (default false). Specs doesn't currently address this.
4. **`core.modernRules` change is a "soft restart"**: if the DM changes edition mid-session, force-close all open overlays on the G2 (Sheet, Spellbook with stale spell list will misrender), force-refetch character data, show toast "edition changed, sheet refreshed". Specs §11.5.1 covers dual-edition support but not the mid-session toggle path.
5. **Bridge URL staleness detection**: at handshake, if last successful connect was >7 days ago, prompt user to verify URL before connecting. Stale homelab IP after a router reboot is the classic case.

**Warning signs:**
- User says "the map looks weird" — DM changed dither, no broadcast.
- User says "where did my Fireball go?" — DM toggled `modernRules`, spell list changed.
- Field test reveals user has 4 different mental models of where settings live.

**Phase to address:** Phase 5 (settings introspection panel) + Phase 7 (write path — broadcast schema for world-scope changes) + Phase 10 (field test of mid-session setting changes).

**Severity:** **IMPORTANT** — degrades trust over time without immediate failure.

---

### Pitfall 9: Italian i18n width-budget overflow on combat-critical strings will silently truncate stat-relevant data

**What goes wrong:**
Specs §I18N-04 commits to "Width-budget per chiave + fallback EN (INV-1 i18n stress)". §7.16.6 covers truncate `…` + telemetry overflow event. **What's not covered**: which strings are **stat-critical** — meaning truncation changes meaning, not just cosmetic. Examples in IT (which is, per Specs, ~30% longer than EN on average for fantasy lexicon):
- "Vantaggio sui tiri di Forza" (29 char) vs EN "Advantage on Strength" (21 char) — fits the chip width budget at 21, gets truncated at 29 to "Vantaggio sui ti…" — user reads "I have advantage on… ti?".
- "Concentrazione: Benedizione" (27) vs "Concentration: Bless" (20) — truncates to "Concentrazione:…" hiding *which* spell the player is concentrating on.
- "Resistenza al freddo" → if a status chip needs to fit "Resist: Cold" but Italian needs "Res: Freddo" — abbreviating "Resistenza" to "Res" or "Resis" is a localization choice, not a free truncate.

The `…` truncate per §7.16.6 is **safe for cosmetic strings** (button labels, tab names) and **dangerous for status/effect chips** where the truncated portion is the variable.

**Why it happens:**
Width budgeting was sized against EN strings (the dnd5e default catalog) and IT strings inherit the budget. Domain knowledge required to identify which strings are stat-critical vs cosmetic isn't embedded in the catalog format.

**How to avoid:**
1. **String classification annotation** in the catalog: `{ "spell.bless": { "en": "Bless", "it": "Benedizione", "kind": "spell-name", "max_chars": 14 } }`. Add `"kind"` taxonomy: `spell-name`, `condition`, `status-effect`, `damage-type`, `cosmetic`, `narrative`. Stat-critical kinds (spell-name, condition, status-effect, damage-type) get **localized abbreviation tables** instead of `…` truncate.
2. **Localized abbreviations**: maintain `lang/it/abbreviations.json` with hand-curated short forms — e.g., "Concentrazione" → "Conc", "Benedizione" stays full, "Resistenza al freddo" → "Res. freddo". Specs §I18N-03 says "catalogi forniti da Foundry" — extend with **module-side** abbreviation overrides for IT.
3. **Phase 5 i18n stress test**: render every status chip and condition tag in IT, compare visual layout to EN, manually flag every truncation that loses semantic info. Add to verification checklist 14 (Specs §7.14.4 has an i18n line — make it concrete with this list).
4. **Spell-name canonical mapping** (also pitfall 13 below): "palla di fuoco" → `spell.fireball` is the **STT fuzzy mapping** problem (Specs §17 / §12.C.17); the **display problem** is keeping "Palla di Fuoco" full but having a stat-card-sized abbreviation "Palla di F." or just the icon. Make sure the spell-name kind uses the icon-prefix glyph (Specs §7.5.5) so the text width is maximally compressible.

**Warning signs:**
- IT user says "what's `…ti` mean?" → that's the truncated tail.
- Telemetry `i18n.overflow` events spike on combat overlay open with IT locale.
- Field test IT player asks "what spell am I concentrating on?" — chip truncated.

**Phase to address:** Phase 1 (catalog schema with `kind` field) + Phase 5 (panel rendering uses kind-aware truncation) + Phase 5 verification (stress test).

**Severity:** **IMPORTANT** — silent semantic loss in non-EN locale; not project-killing but discriminates against IT (the launch market alongside EN).

---

### Pitfall 10: BLE Layer 5 DLE detection succeeds at connect but degrades silently when phone OS reschedules BLE → user thinks they have 15 fps mode but it's actually 5 fps

**What goes wrong:**
Specs §10.0.7 tests BLE DLE at connect: if MTU ≥244, unlock Layer 5 → 15 fps mode. **In practice**, mobile OS (iOS especially) re-arbitrates BLE connection parameters when:
- Phone enters low-power mode (battery <20%).
- Phone backgrounded and foregrounded.
- Connection latency increased due to other BLE peripherals (smartwatch, AirPods).

The renegotiation can drop effective MTU back to 23 bytes silently, while the application still reports the connection-time MTU. App pushes 244-byte chunks expecting fast delivery; BLE link layer fragments to multiple 23-byte packets; throughput drops 10×; perceived fps tanks but Layer 6 adaptive fps doesn't know **why** because Layer 5 status didn't update.

Specs §11.5.8.5 covers firmware queue saturation (a downstream symptom) but doesn't cover **upstream MTU degradation** as a distinct failure mode.

**Why it happens:**
Mobile BLE stack abstractions hide the connection parameter changes from the application layer in many SDKs. iOS Core Bluetooth in particular doesn't expose a callback for "connection parameters changed mid-session". Re-querying MTU is also a privileged operation the WebView host may not expose.

**How to avoid:**
1. **Inferred MTU monitoring**: instead of trusting the connect-time MTU, infer current effective MTU by measuring the round-trip-time of fixed-size pushes. If observed throughput drops 50%+ relative to baseline for 10+ seconds, infer degradation, downgrade to Layer 5-disabled (sub-244 byte chunks) automatically.
2. **Heartbeat ping** every 2 sec: a 50-byte tile-keepalive that doubles as MTU canary. RTT spike beyond p95 baseline → degraded mode.
3. **Document the degradation in HUD**: when in degraded mode, show `⚠ BLE 5x→4x` or similar indicator in the header chip, so the user understands why fps dropped. Don't hide the failure mode — Specs core value is "user trusts the system".
4. **Phase 0 §10.0.7 needs a "30-min sustained DLE" run, not just a 30-sec measurement**. Real conditions reveal renegotiation; lab conditions don't.

**Warning signs:**
- Player reports "fps drops after 20 minutes" with no other system change.
- Telemetry shows tile arrival latency p95 doubling without app-side reason.
- Phone battery dipped below ~25% — common renegotiation trigger.

**Phase to address:** Phase 0 (extend §10.0.7 to sustained run) + Phase 4 (RTT canary in raster engine) + Phase 4 (HUD chip for BLE degraded state).

**Severity:** **IMPORTANT** — silent degradation undermines trust without an obvious failure.

---

### Pitfall 11: PIXI canvas extract under load blocks Foundry UI thread for the player — every map redraw stutters the player's *own* Foundry desktop

**What goes wrong:**
Specs §12.A q10 lists this as "deferred to Phase 4 internal performance test". In practice, `canvas.app.renderer.extract.pixels()` is **synchronous against the WebGL context** even though it returns a promise. PIXI must complete the current render frame, lock the GL context, read back framebuffer pixels, release. On a typical Foundry scene (1080p canvas, several lighting layers), this is **30–80 ms** per call (per Specs §11.5.7.1 benchmark). At 5 fps target, that's **5 × 80 = 400 ms / sec of UI-thread block on the player's own desktop Foundry**.

Result: the player who is wearing the G2 sees their Foundry browser window stutter. They probably also have the laptop open as a fallback. The stutter is **caused by their own G2 helper**.

This is a **second-order pitfall**: the canvas extract is a player-side feature that punishes the player.

**Why it happens:**
Server topology Option A (Specs §7.4b.8) is "player extracts from their own canvas". The motivation was to avoid headless Foundry on the bridge. The cost is direct UI-thread impact.

**How to avoid:**
1. **OffscreenCanvas hand-off**: capture the PIXI render-target texture into an OffscreenCanvas, transfer to Worker, then do the extract there. Modern browsers (Chrome, Edge, Firefox) support this; Safari iOS partially. Specs §11.5.7.1 already mentions OffscreenCanvas for resize but not for the extract step.
2. **Capture cadence throttling**: don't extract on every Foundry render tick. Extract on **scene-dirty events only** (token move, light change, fog update). Idle scene = no extract. Layer 6 adaptive fps already knows this; wire the extract scheduler to Layer 6's state, not to a fixed timer.
3. **WebGPU path** (forward-looking): when Foundry v14+ supports PIXI v8 with WebGPU (Specs §12.B q14), the read-back path is asynchronous and non-blocking. Until then, OffscreenCanvas is the pragmatic answer.
4. **Phase 4 measurement**: instrument main-thread frametime with the raster engine on vs off. If main-thread frametime exceeds 30 ms p95 with raster on, fall back to glyph mode for that player automatically.
5. **Server topology Option B (headless Foundry on bridge, §7.4b.8)** is Specs Phase 13 stretch for multi-player. Promote it to Phase 10 contingency: if Option A measurably degrades the player's own UX, ship Option B for the launch.

**Warning signs:**
- Phase 4 frametime instrumentation shows main thread blocked >30 ms during raster active.
- Foundry chat input feels sluggish on the G2-wearing player's machine but fine for others.
- DM observes the player's token movement is jittery in the world (player's Foundry stutters → less smooth movement broadcast).

**Phase to address:** Phase 4 (OffscreenCanvas hand-off + frametime instrumentation) + Phase 10 (decision gate to promote Option B if Option A degrades UX).

**Severity:** **IMPORTANT** — degrades the player's primary tool; not blocking but undermines value.

---

### Pitfall 12: G2 firmware queue depth assumption (4+ multi-tile) drives 15-fps target — but Specs §10.0.8 GO/NO-GO doesn't define behavior for queue=2 or queue=3

**What goes wrong:**
Specs §10.0.8 has three branches: queue ≥4 (15 fps multi-tile achievable), serialized linear (20 fps cap if 1-tile), drop/crash (4–5 fps cap). **There's no branch for queue=2 or queue=3**, which is the most likely real outcome on consumer-grade BLE peripheral firmware. With queue=2, multi-tile delta requires careful scheduling (push 2 tiles, wait for both ack-equivalent, push next 2) — a lockstep pattern that has different fps math from both the ≥4 and the linear=1 branches.

**Why it happens:**
Spec lookup tables in §7.4b.6.1.2 assume continuous push. Real firmware queues are bounded at small N. The test in §10.0.8 produces a number; the spec doesn't pre-commit to what happens at every value of that number.

**How to avoid:**
1. **Pre-commit branch table**: extend §10.0.8 GO/NO-GO with discrete behavior for queue depth ∈ {1, 2, 3, ≥4}:
   - 1 → serialized; 1-tile single-update mode; 5 fps committed.
   - 2 → 2-tile lockstep with 50% pipeline efficiency; 8 fps committed.
   - 3 → 3-tile rolling with 75% pipeline efficiency; 12 fps committed.
   - ≥4 → 4-tile parallel; 15 fps stretch.
2. **Adaptive queue probing**: at boot, after handshake, push 8 test tiles back-to-back and measure how many got coalesced/dropped. Empirical queue depth detection — don't trust documentation that may not exist.
3. **Phase 4 raster engine** parameterizes on detected queue depth — write the raster scheduler as queue-depth-aware from the start, not as a 4-tile-assumed implementation that's later patched.

**Warning signs:**
- Phase 0 §10.0.8 reports queue depth = 2; engineer assumes "close enough to 4" and pushes 4-tile bursts; firmware drops every other update silently.
- Field test fps lower than Phase 0 §10.0.8 lab measurement — engineer measured single bursts but the engine schedules differently in production.

**Phase to address:** Phase 0 (extend §10.0.8 with full queue-depth → behavior table) + Phase 4 (queue-depth-aware scheduler).

**Severity:** **IMPORTANT** — a misalignment here caps fps below target with no obvious cause.

---

### Pitfall 13: V2 STT for D&D vocabulary — Italian player saying "concentro su benedizione e lancio mago mano" doesn't map to MCP tools the way English does

**What goes wrong:**
Specs §8 has voice examples in IT ("Vedo un grosso gruppo di goblin… palla di fuoco"). Specs §12.C q17 acknowledges italiano-vs-inglese STT as a known unknown. The deeper issue is that **D&D vocabulary mixes**:
- Italian common words ("vedo", "lancio", "attacco").
- English-rooted spell names that even IT players use ("fireball" colloquially despite the official "Palla di Fuoco").
- Italian-localized spell names ("Mago Mano" for Mage Hand, "Benedizione" for Bless).
- Player nicknames for spells ("la PdF" for Palla di Fuoco).
- Mid-sentence code-switching ("dropp la concentrazione su Bless e lancio Hold Person").

A standard STT model (Whisper, Deepgram Nova-3, AssemblyAI) tuned for IT will mistranscribe English spell names; tuned for EN will mistranscribe IT verbs. The LLM tool-router downstream gets garbage in.

Specs §12.C q17 says "Lookup table fuzzy locale come pre-step" — this is the right shape but **understates the size**: the lookup table needs ~500 entries (every spell × edition × locale × common abbreviations), maintained, and the fuzzy-match needs to be tunable per-deployment because group-specific slang varies.

**Why it happens:**
D&D is fundamentally a multilingual TTRPG — official translations exist but tabletop groups develop pidgin. STT models don't have D&D-specific tuning unless you fine-tune them.

**How to avoid:**
1. **Two-stage STT**: stage 1 transcribes free-form using a multilingual model (Whisper large-v3 or Deepgram Nova-3 in `multi` mode). Stage 2 runs a lookup-table fuzzy match (`fuse.js` or `levenshtein` threshold) over recognized noun-phrase candidates against a curated `vocab_dnd.json` containing all spell/feature/condition names in {EN, IT, slang}.
2. **Vocabulary file source**: bootstrap from the dnd5e Foundry catalog (Specs §I18N-03) — every key whose `kind ∈ {spell, condition, feature}` (also pitfall 9 above) generates a vocab entry in EN + the active locale. Augment with a user-customizable `custom-vocab.json` for group slang.
3. **Confidence threshold + clarify modal**: if fuzzy match below threshold (e.g., Levenshtein ratio <0.85), trigger Clarify Overlay (Specs §7.11) showing top-3 candidate spells. R1 scroll → tap to confirm. This is the V2 voice equivalent of a typeahead.
4. **Phase 12 V2**: explicit IT↔EN spell-name lookup test is already in the roadmap. Make the test corpus include the slang case ("PdF", "fireball" said by IT speaker, "magic missile" said as "magic missoul") not just clean canonical strings.

**Warning signs:**
- Phase 12 STT pipeline test: 9/10 IT spells map correctly when said in canonical IT; 6/10 when said in conversational IT mixing EN.
- Player frustrated: "I said 'palla di fuoco' three times and it kept asking me to clarify".

**Phase to address:** Phase 11 (foundry-mcp tool registry — vocab schema) + Phase 12 (V2 voice tuning — lookup table and threshold tuning).

**Severity:** **IMPORTANT** for V2 voice (not MVP-blocking; V2 is opt-in).

---

### Pitfall 14: MCP tool-call streaming (post-2025-03-26 Streamable HTTP) UX with partial results during D&D combat — player sees "casting fireball…" then "rolling damage…" then "applying… wait you missed" — feels worse than synchronous

**What goes wrong:**
MCP roadmap 2026 commits to **Streamable HTTP with chunked progressive delivery** of tool call results. The G2 plugin during V2 voice operations renders intermediate states. Naively done, this surfaces *every* internal step of a multi-tool action ("calling check_concentration", "calling roll_attack", "calling apply_damage", "rendering chat card") to the player — who, on a 4-bit greyscale 576×288 phosphor display, just wanted "Fireball cast, 3 goblins fried".

Worse: a partial-result UX leaks the LLM's reasoning trace. If the Tool Registry runs check_concentration → it FAILS → LLM retries with a different approach → user sees a "ghost" step that wasn't part of their intent. Confidence in the system erodes.

**Why it happens:**
Streaming tool results are great for code-IDE UX (developer wants to see tool output progressively). They're wrong for end-user game UX where the user wants atomic feedback.

**How to avoid:**
1. **Coalesce intermediate states**: G2 plugin renders only **named milestones**, not every tool call. Define a milestone set in the Tool Registry (§5.3) — "PARSING", "CONFIRMING_TARGET", "ROLLING", "APPLYING", "DONE" — and map tool calls to milestones. Stream the milestones, not the underlying tool names.
2. **Fast-path threshold**: if a multi-tool action completes in <500 ms total (common for cast-on-known-target), skip the streaming UI entirely and show only the final result toast. Streaming UI is for actions that visibly take >500 ms.
3. **Cancellable**: any streaming-state UI must offer "double-tap = cancel" affordance. If the LLM is mid-clarify and the player realizes they meant a different spell, they can abort. Specs doesn't currently address tool-call cancellation.
4. **Phase 12 V2 worked examples §8.A/B/C**: re-render each example with streaming MCP semantics, identify which intermediate states the player should see vs not. This is design work, not engineering.

**Warning signs:**
- Phase 12 V2 user feedback: "it feels slower than typing into Foundry directly".
- Streaming UI shows tool names like `roll_attack_internal_v2` — leak of internal API names.
- Cancel during clarify causes orphaned partial-state in the workflow.

**Phase to address:** Phase 11 (MCP tool registry — milestone schema) + Phase 12 (V2 voice UX tuning — coalesce + cancellation).

**Severity:** **NICE-TO-HAVE** for MVP (V2 only); CRITICAL within V2 scope when shipped.

---

### Pitfall 15: 4-bit greyscale Floyd-Steinberg in sRGB color space (not linear) on phosphor green produces over-dark midtones that hide token outlines

**What goes wrong:**
Specs §11.5.7 + §7.4b.5 commit to Floyd-Steinberg via image-q with custom palette = 16-step greyscale ramp. The pitfall (per Floyd-Steinberg dithering literature, Wikipedia + every-algorithm.github.io 2024): **error diffusion in sRGB space (the default for image-q on `<canvas>` data) produces non-linear midtone behavior**. Specifically, midtones (luma 0.4–0.6 in sRGB) get pushed darker than perceptually correct because sRGB→linear gamma curve is non-linear in that region. On the G2's **phosphor green display**, where dark = invisible, midtone tokens (a goblin in normal lighting) will render as nearly-black, indistinguishable from background dungeon stone.

**Why it happens:**
image-q processes 8-bit sRGB pixel data directly without linearizing. The Foundry canvas is sRGB. The dither algorithm operates on whatever color space the input is in. For most use cases this is fine; for **monochrome low-bit-depth output where every level matters**, the non-linearity is visible.

**How to avoid:**
1. **Linearize before dither**: in the worker pipeline (Specs §7.4b.4 stage 3 greyscale conversion), apply sRGB → linear gamma correction (`pow(srgb/255, 2.2)`) before computing luma `Y = 0.299·R + 0.587·G + 0.114·B`. After dither + quantize, no need to convert back because the output palette is being mapped to phosphor levels by the G2 firmware.
2. **Phosphor-aware palette**: the 16-step greyscale ramp shouldn't be uniform 0/15, 1/15, … 15/15. The G2 phosphor luminance response is roughly linear in drive current but **perceived brightness** is logarithmic. Use a perceptually-spaced ramp (CIE L\* spacing) — image-q supports custom palette arrays. Phase 0 §10.0.2 result should include a palette calibration step (not currently in spec).
3. **Serpentine scan**: image-q v4.0.0 supports serpentine scan order for FS — enable it. Reduces directional artifacts (mentioned in dithering research) that on a low-resolution display look like horizontal banding.
4. **Phase 0 §10.0.2 add palette-calibration sub-step**: render a 16-step gradient on the actual G2, photograph (or use the simulator), measure perceived brightness per step, derive perceptually-correct palette.

**Warning signs:**
- Field test: "the goblin is invisible against the floor".
- Side-by-side comparison (G2 image vs Foundry canvas) shows midtone tokens missing.
- Bright tokens (player-character glowing weapon) render fine; mid-luma NPCs disappear.

**Phase to address:** Phase 0 (palette calibration sub-test) + Phase 4 (linearize-before-dither implementation).

**Severity:** **IMPORTANT** — affects the primary feature (raster map readability) but not project-killing (glyph mode is the alternative).

---

### Pitfall 16: QR-paired bearer token reuse if phone is lost — token is valid 24h, attacker has full bridge access

**What goes wrong:**
Specs §11.5.4 defines bearer token TTL = 24h with QR-pair provisioning. §7.14.7.4 covers some cases (token expired, whitelist mismatch) but **doesn't address phone-stolen-during-pairing-window**: if a player's phone is lost while a 24h token is active, the attacker can:
- Walk into BLE range of any G2 paired in the same world.
- Open the Even Realities App (no Even-App-level passcode required by default).
- Plugin auto-loads with cached token.
- Bridge accepts requests for the duration of the remaining TTL.

The Specs §11.5.4 lifecycle has no **revocation latency** SLA. It says "revoca dal Foundry module pairing registry" but the bridge doesn't poll the registry — it caches the token validity.

**Why it happens:**
Opaque bearer tokens with long TTL are simple but lose security by trading off freshness for UX. 24h is convenient; it's also a long attack window.

**How to avoid:**
1. **Short-TTL access + long-TTL refresh**: rotate to a refresh-token pattern (15-min access token, 24h refresh token). Bridge checks access token freshness at every request. Revocation propagates within 15 min worst case. Specs §11.5.4 mentions "JWT come future option" — the refresh-token pattern works with opaque tokens too.
2. **Bridge-side revocation list**: when DM clicks "Revoke" in the Foundry module pairing UI (§7.14.7.3), Foundry module pushes an invalidation event to bridge via WS. Bridge maintains an in-memory blacklist (Tier 1 storage, §11.5.5). Revocation latency = WS round-trip (~10ms LAN).
3. **Out-of-band session anchor**: every G2 connection includes a session-id + nonce that bridge tracks. If two G2s claim the same session-id from different MAC addresses within a window, both are invalidated and re-auth required. Defends against token-theft-and-replay.
4. **DM dashboard visibility**: Foundry module Settings UI (§7.14.7.3) shows currently-active connections, last-seen IP, last-seen R1 ID. DM can spot anomalies.
5. **Camera permission rejection** is already covered (§7.14.7.4 fallback to paste). Make the paste path **only available to operators**, not regular players, by adding a "Show paste fallback" admin toggle. Otherwise the QR security is undermined by an always-available paste path.

**Warning signs:**
- Pairing registry shows two active sessions for the same token.
- Bridge logs requests from an IP not matching the player's known network.
- DM revokes token; G2 continues serving requests for >5 min.

**Phase to address:** Phase 3 (bridge revocation list + WS invalidation channel) + Phase 7 (Foundry module pairing UI extension) + Phase 10 (security review pre-ship).

**Severity:** **IMPORTANT** — homelab single-tenant attack surface is small; cloud deploy (stretch) makes it real.

---

### Pitfall 17: Multi-device on same character (two G2s paired to one Foundry actor) is "no conflict" per spec — but HP/state shared means contradicting overlay states confuse the player

**What goes wrong:**
Specs §7.14.7.4 case "Multi-device same character" says: "Foundry module registra pairing distinte; nessun conflitto. Però **HP/state** sono shared → due G2 mostrano stessa view." This treats HP state as the only shared resource. **What's actually shared**:
- HP, AC, conditions, slot counts (Foundry actor state — yes, shared).
- Targeting (Foundry per-user TokenLayer.setTargets — **per-user**, NOT shared!).
- Open overlay state (Sheet open, which tab, scroll position — should be per-device, but if both G2s subscribe to the same actor's WS event stream, naive impl will sync them).
- Quick Action menu open state — definitely per-device.
- Concentration drop confirmation — per-device intent vs shared spell-effect state — ambiguous!

Two G2s on one character is the rare case but real (player has a backup pair, or co-DM watching the character). The pitfall is that the spec treats it as "easy mode" (no conflict) when it's actually a **state ownership question**.

**Why it happens:**
Naive WS broadcast model: bridge → all subscribed clients of the actor. Per-device UI state is conflated with per-actor game state.

**How to avoid:**
1. **Subscription scope clarification**: every WS event carries a `scope: "actor" | "device" | "broadcast"`. Bridge routes:
   - `actor` → all devices subscribing to actor (HP, slots, etc.).
   - `device` → originating device only (UI overlay state).
   - `broadcast` → all devices in the world (DM message).
2. **Targeting decision**: per Foundry v13, targeting is per-user (Specs §FOUN-04). If two G2s share a user account, they share targeting. If they're separate user accounts both authorized for the same actor, they have separate targeting. Document this in Phase 5 navigation map.
3. **Concentration drop is intent + result**: when player A on G2#1 says "drop Bless and cast Hold Person", the intent originates on device 1, but the *effect* (Bless drops, Hold Person concentration starts) is actor-state and reflects to G2#2. G2#2 should see a passive notification "Bless dropped on this character" not "you dropped Bless".
4. **MVP simplification**: gate multi-device-per-character behind a Phase 13 stretch feature flag. Default MVP enforces 1 device per actor per user, with a Foundry module check at handshake. Reject second pairing with "Actor already paired to another device — revoke first".

**Warning signs:**
- Phase 13 multi-player test: one player's overlay state mirrors another's.
- Concentration drop fires twice (one from each device).
- Targeting from G2#1 affects G2#2's view of "what is being cast at".

**Phase to address:** Phase 3 (WS subscription scope schema) + Phase 13 (multi-device feature flag).

**Severity:** **NICE-TO-HAVE** for MVP (single-device default avoids it) + **IMPORTANT** for Phase 13 multi-player.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems specific to this stack.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code dnd5e 5.3 schema paths in writers (skip adapter abstraction) | Saves ~3 days Phase 2 work | dnd5e 6.x migration becomes a rewrite, not an adapter swap (Specs §3.4 already commits to versioned adapters — don't backslide) | Never — INV-3 documentation coherence + Specs explicit "swap-friendly per futuro v6" requires it from day one |
| Skip Phase 0 §10.0.7 sustained DLE test ("I'll measure 30 sec, that's enough") | Saves ~1 day | Production discovers MTU degradation in field; root cause hunt takes weeks | Never |
| Use `…` truncation for all i18n overflow (no kind taxonomy) | Saves ~1 week catalog schema work | Italian launch ships with truncated combat-critical strings | Never for stat-critical strings; OK for cosmetic |
| Single workflow origin: only player-side `activity.use()` (no GM forward) | Simpler Phase 7 implementation | NPC damage application requires GM client manual step → defeats purpose of automation | Never for MVP — ship GM-side option (A) per pitfall 6 |
| Trust connect-time MTU forever (no RTT canary) | -1 day Phase 4 work | Pitfall 10 silent degradation in production | Never — sustained UX requires it |
| Skip linearize-before-dither (use sRGB direct) | -2 hours Phase 4 work | Pitfall 15 midtone token invisibility, hard-to-debug user complaint | OK only if Phase 0 calibration confirms negligible perceptual impact on this specific G2 phosphor |
| Persistent G2 Tier 4 settings across sessions (no auto-clear) | Simpler state model | Pitfall 8 stale overrides leak between sessions, user confused | Acceptable if explicitly user-set as "remember always" preference |
| QR token TTL = 24h with no rotation | UX simplicity (one pair per day) | Pitfall 16 lost-phone attack window | OK for MVP homelab; rotate to refresh-token before cloud stretch |
| Render every MCP tool call to G2 in V2 voice mode | Easier Phase 11 wiring | Pitfall 14 — UX leaks LLM internals, feels slower than synchronous | Never — coalesce to milestones from day one |

## Integration Gotchas

Common mistakes when connecting to external services in this domain.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Foundry module + dnd5e 5.x** | Reading `item.system.actionType` to dispatch | Read `activity.type` from `item.system.activities[i]` — activities are the canonical surface (pitfall 1) |
| **Foundry v13 targeting** | Using global `game.user.targets` from any context | v13 targeting is per-user; bridge must track per-user. `TokenLayer.setTargets()` per Specs §FOUN-04 expects user context (Specs §12.B q15 implicit) |
| **MidiQOL + socketlib** | Calling `activity.use()` on player + forwarding via socketlib | Pick one workflow origin (option A: GM-side via socketlib only) per pitfall 6 |
| **Even Realities WebView** | Assuming standard browser CSP, all WebAPIs available | Domain whitelist required in `app.json`; getUserMedia for QR scan needs explicit permission (Specs §7.14.7.1 note); some APIs may be missing — capability-detect at boot |
| **Even Realities G2 BLE** | Trusting connect-time MTU through session | Inferred MTU monitoring via RTT canary (pitfall 10); log every MTU observation as telemetry |
| **R1 ring SDK** | Treating tap and double-tap as truly separate events | Specs §10.0.1 confirms distinguishable, but timing window is firmware-defined; tune debounce in Phase 6, not Phase 0 |
| **MCP server (V2)** | Running pre-2025-03-26 HTTP+SSE transport | Use Streamable HTTP per Specs §4.7 + 2026 MCP roadmap; HTTP+SSE deprecated |
| **MCP client (V2)** | Streaming all tool-call events to UI | Coalesce to milestone events per Tool Registry (pitfall 14) |
| **STT (V2)** | Single-language model | Multilingual model + locale-aware fuzzy lookup table (pitfall 13) |
| **Sharp (Option B bridge raster)** | Expecting 4-bit indexed PNG output | Sharp produces 8-bit indexed; post-pass via upng-js to 4-bit (Specs §11.5.7 Option B note already documents — ensure Phase 13 implementer reads it) |
| **xxhash-wasm** | Rolling JS hash because "WASM is overkill" | 5–10× slowdown blows compute budget per Specs §11.5.7.1 — adopt the wasm path |
| **image-q npm** | Trusting npm version matches GitHub tag | Specs §11.5.7 documents npm 4.x vs git latest 2.1.2 mismatch; pin by hash in pnpm-lock |

## Performance Traps

Patterns that work at small scale but fail as session length / load grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-tile push every frame (no delta) | BLE saturated, fps caps at ~2 | Layer 1 xxhash delta from Phase 4 day 1 (Specs §7.4b.6.1.2) | Round 2 of any combat |
| Delta encoding without keyframe interval | Tile corruption persists across reconnect (pitfall 3) | Force keyframe every 10 sec; seqno tracking | After first BLE blip |
| Render Status HUD every Foundry render tick | UI thread blocked, player Foundry stutters (pitfall 11) | Schedule HUD updates on actor-state-change events only | After 30 min sustained play |
| Persistent BLE bandwidth telemetry only at connect | DLE renegotiation invisible (pitfall 10) | RTT canary every 2 sec | Phone battery <25% or background switch |
| Ship adaptive fps with only scene-activity input | Doesn't react to BLE degradation | Layer 6 reads both scene activity AND BLE telemeter | First user with bad WiFi |
| Cache PIXI canvas extract result | Stale tiles when scene changes | Invalidate on canvas-dirty events (e.g., `canvas.tokens.placeables` change) | First token move after extract caching |
| Hash 200 sub-tiles in JS instead of WASM | Compute alone exceeds 66 ms frame budget | xxhash-wasm per Specs §11.5.7.1 | At 8+ fps target |
| Catalog all i18n strings as cosmetic (no kind taxonomy) | IT/DE/ES strings truncate-lose-info | Kind taxonomy + per-kind truncation strategy (pitfall 9) | First non-EN field test |
| MCP tool-call results streamed verbatim | UI feels slower than synchronous | Coalesce to milestones (pitfall 14) | First V2 voice user not familiar with MCP semantics |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| 24h opaque bearer token with no rotation | Phone-loss attack window (pitfall 16) | Refresh-token pattern with 15-min access tokens; bridge revocation list with WS push |
| Token paste fallback always available alongside QR | Defeats the point of QR provisioning (Specs §11.5.4 attack-surface reduction) | Hide paste behind admin toggle; warn user when used |
| WS endpoint accepts any Origin header | Cross-site connection from malicious page | CORS whitelist enforced; Specs §FOUN-02 explicit "CORS-friendly" — make it CORS-correct, not CORS-permissive |
| Bridge URL stored in phone localStorage in cleartext | Local-device-compromise reads URL+token | Use platform secure storage (iOS Keychain via Even App SDK if available); document fallback to localStorage as MVP-only |
| Voice recordings (V2) sent to cloud STT without consent prompt | GDPR + Specs §11 "privacy audio cloud" | Default opt-in, explicit consent dialog at first activation, Specs §11 already captures this — surface it in Phase 12 |
| MCP tool exposes write actions without GM authority gate | Player AI bypasses DM judgement | Tool Registry §5.3 + Specs §FOUN-03 "GM veto power preserved" — every write tool must be cancellable from GM chat |
| QR payload includes raw token (not nonce → fetch-token) | Token captured if QR is photographed | QR contains a one-time pairing code; phone exchanges code for token over TLS at first connect |
| No audit log of pair/unpair events | Can't detect compromise | §7.14.7.3 mentions "Log pairing event in module event-log" — make it append-only, surface in DM Settings |

## UX Pitfalls

Common user experience mistakes specific to AR HUD + tabletop social context.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Constant-on full-density status HUD (pitfall 4) | Eye fatigue at 30-60 min mark; player removes glasses | Layered priority + idle dimmer + user toggle |
| R1 long-press meaning differs by overlay (pitfall 5) | Misclick shame in social setting; trust erosion | INV-5 gesture determinism: long-press always means Quick Action of current top layer |
| No visual indication of "system thinking" during BLE blip | Player thinks system froze; tries random gestures | Header chip `⚠ SYNC` during reconnect; greyed quick actions |
| Toast for every dice roll, all auto-dismiss 3s | Combat round 4: 20 toasts queued, miss critical info | Toast deduplication; long-press to pin; rolls below DC threshold suppressed (configurable) |
| Settings change broadcast as silent toast | User doesn't notice DM changed something, "why is the map weird?" | Banner notification with brief animation, dismissable explicitly |
| Confirmation modal for every action (defensive design) | Combat takes 3× longer; flow killed | Confirm only state-altering Quick Actions; simple navigation never confirms |
| Power user has no way to disable training overlays | Friction for experienced users | "Verbose UI" toggle in Tier 4 G2 device-local settings |
| Italian player reads truncated stat strings (pitfall 9) | Loses concentration target, mis-applies effect | Kind-aware truncation + abbreviation tables |
| MCP V2 streaming UI exposes tool names (pitfall 14) | Sees `roll_attack_v2` instead of "rolling attack" | Milestone naming; never leak internal tool names |
| QR pair flow timing out at exactly 60 sec (Specs §7.14.7.3 step 4) with no warning | Player tries to scan and gets "expired" | 50 sec countdown visible on QR display + 10 sec grace window |
| Ghost token after delta-encoding error (pitfall 3) | Player attacks empty square; embarrassment | Keyframe interval + visible chip when stale state detected |

## "Looks Done But Isn't" Checklist

Things that appear complete in demo but are missing critical pieces.

- [ ] **Raster pipeline:** Looks done in Phase 4 demo (a static scene renders); often missing **delta+keyframe correctness under reconnect** (pitfall 3) — verify by killing bridge mid-session and confirming rendered tiles are correct on reconnect, not stale.
- [ ] **R1 long-press menu:** Looks done with 9 quick actions visible; often missing **gesture-context disambiguation** (pitfall 5) — verify INV-5 by long-pressing from each of the 8 reachable screens and confirming each opens the correct context's Quick Actions menu, not the main one.
- [ ] **Foundry write path:** Looks done with attack producing chat card; often missing **single-workflow-origin discipline** (pitfall 6) — verify by attacking an NPC and confirming exactly one MidiQOL workflow runs (`MidiQOL.Workflow.workflows.size === 1` during the operation).
- [ ] **i18n IT support:** Looks done with strings translated; often missing **kind-aware truncation** (pitfall 9) — verify by rendering all status chips in IT and visually checking no semantic info is lost to `…`.
- [ ] **Phase 0 §10.0.3 BLE bandwidth:** Looks done with a number; often missing **environmental variation** (pitfall 2) — verify by repeating in 3 RF environments (clean, 2.4 GHz loaded, microwave-on).
- [ ] **Phase 0 §10.0.7 DLE test:** Looks done with MTU=244 confirmed at connect; often missing **sustained-run validation** (pitfall 10) — verify by running 30 min sustained, not 30 sec.
- [ ] **Settings UI:** Looks done with 3-tier model documented; often missing **mid-session change broadcast + introspection panel** (pitfall 8) — verify by having DM change a world setting mid-session and confirming player G2 toasts the change.
- [ ] **QR pairing:** Looks done with token provisioned; often missing **revocation latency SLA + revocation list propagation** (pitfall 16) — verify by clicking Revoke and confirming bridge rejects within <30 sec.
- [ ] **Floyd-Steinberg dither:** Looks done with map rendering on G2; often missing **linearize-before-dither + perceptually-spaced palette** (pitfall 15) — verify by rendering a luminance-ramp test pattern and inspecting on actual G2 phosphor.
- [ ] **Status HUD:** Looks done with all chips visible; often missing **layered priority + idle dimmer** (pitfall 4) — verify by 60-min wear with self-reported fatigue score.
- [ ] **MidiQOL integration:** Looks done with workflow firing; often missing **completeActivityUse signature validation** (Specs §10.0.10 P2 row 1, pitfall 1+6) — verify against installed MidiQOL version, document in ADR.
- [ ] **Multi-tile rendering:** Looks done with 4-tile mosaic; often missing **queue-depth-aware scheduler** (pitfall 12) — verify by measuring actual queue depth and confirming scheduler matches.
- [ ] **MCP V2 voice:** Looks done with `cast Fireball` working in clean case; often missing **streaming UX coalescing + cancellation** (pitfall 14) — verify by mid-action cancel and confirming clean state restoration.
- [ ] **Capability handshake:** Looks done with fields populated; often missing **firmware_version + app_host_version logging** (pitfall 7) — verify by checking telemetry coverage.
- [ ] **Even Realities firmware compatibility:** Looks done after first OTA test; often missing **boot-time format probe** (pitfall 7) — verify by simulating a format mismatch and confirming graceful degradation to glyph mode.

## Recovery Strategies

When pitfalls occur despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pitfall 1 (dnd5e 5.x activity API misuse) | HIGH | Adapter rewrite of writer module; Phase 7 work redone; can reuse readers if they followed activity-only path |
| Pitfall 2 (BLE under interference) | MEDIUM | Add multi-environment test results; tune Layer 6 thresholds; ship glyph fallback prominent; document in user-facing FAQ "if your fps drops, here's why" |
| Pitfall 3 (delta corruption) | LOW (if caught early) / HIGH (if shipped) | Add keyframe + seqno; Phase 4 internal — discoverable in field test; shipped → hotfix release with cache invalidation telemetry |
| Pitfall 4 (HUD fatigue) | LOW | Add idle dimmer + layered priority — config-only change, no architecture impact |
| Pitfall 5 (gesture polysemy) | MEDIUM | Add INV-5 + footer chip + confirm-before-execute; Phase 6 redo if not done at design time |
| Pitfall 6 (workflow re-entrancy) | HIGH | Pick option A (GM-side); rewrite writer module; Phase 7 redo |
| Pitfall 7 (Even SDK breakage) | VARIES | Capability handshake → glyph mode auto; if format change is total → ship update with new format; worst case → users wait for fix |
| Pitfall 8 (settings drift) | MEDIUM | Add introspection + broadcast events; Phase 5 redo for settings UI; backward-compat through schema versioning |
| Pitfall 9 (i18n width overflow) | LOW | Catalog augment with kind annotations + abbreviations; can ship as catalog-only update without code change if catalog format pre-supports it |
| Pitfall 10 (BLE silent degradation) | MEDIUM | RTT canary added; Layer 6 wired; HUD chip added; not a redesign, an instrumentation add |
| Pitfall 11 (PIXI extract blocking) | MEDIUM | OffscreenCanvas hand-off + cadence throttling; Phase 4 partial redo for capture path |
| Pitfall 12 (queue-depth misalignment) | LOW | Scheduler parameterization; Phase 4 internal — discovered by Phase 0 §10.0.8 measurement; if shipped, hotfix |
| Pitfall 13 (V2 STT vocab) | MEDIUM | Vocab file expansion + threshold tuning; iterative — Phase 12 + ongoing |
| Pitfall 14 (MCP streaming UX) | LOW | Tool registry adds milestone schema; Phase 11/12 work — fix before V2 ship |
| Pitfall 15 (sRGB FS dither) | LOW | Linearize step in worker; palette recalibration; Phase 0 + Phase 4 |
| Pitfall 16 (token reuse on phone loss) | MEDIUM | Refresh-token pattern + bridge revocation list; Phase 3 internal; if shipped without, hotfix release |
| Pitfall 17 (multi-device state collision) | LOW | Subscription-scope schema + flag-gate to Phase 13; MVP unaffected |

## Pitfall-to-Phase Mapping

How roadmap phases (Specs §10) should address each pitfall, including phase additions where Specs needs extension.

| Pitfall | Prevention Phase | Specs Phase Reference | Verification |
|---------|------------------|----------------------|--------------|
| 1 — dnd5e 5.x activity API | Phase 0 + 2 + 7 | §10 Phase 2 readers / Phase 7 writers; ADR after §10.0.10 P2 row 1 | Schema fixture freeze; one-workflow-per-action runtime check |
| 2 — BLE interference | Phase 0 + 4 + 10 | §10.0.3 (extend) + §11.5.8.2 (tighten) | Multi-environment §10.0.3 results; Layer 6 telemeter unit test; field test microwave |
| 3 — Delta tile corruption | Phase 4 | §7.4b.6.1.2 Layer 1 (extend with keyframe) | Reconnect+verify-tile integrity test |
| 4 — HUD information density | Phase 4 + 10 | §7.2 + §7.4 (extend with priority/dimmer) | NASA-TLX score in §10 Phase 10 field test |
| 5 — R1 long-press polysemy | Phase 6 + 8 | §7.13 + §7.14 (add INV-5) | Verification checklist 15× extended; long-press from every screen |
| 6 — Workflow re-entrancy | Phase 7 | §FOUN-03 + §10.0.10 P2 row 1 | One-workflow assertion in writer test |
| 7 — Even SDK SemVer absence | Phase 0 + 5 + 10 + 13 | §3.7 + §5.6.3 (extend) + §11 monitoring | Boot-time format probe; firmware compatibility matrix |
| 8 — Settings tier drift | Phase 5 + 7 + 10 | §7.14.6 + §11.5.5 (extend with broadcast + introspection) | Mid-session DM-change-detected toast verification |
| 9 — i18n IT width overflow | Phase 1 + 5 | §I18N-04 + §7.16 (extend with kind taxonomy) | All-chips IT visual stress test |
| 10 — BLE silent MTU degradation | Phase 0 + 4 | §10.0.7 (extend to sustained) | RTT canary unit test; degraded-mode HUD chip |
| 11 — PIXI extract blocking | Phase 4 + 10 | §7.4b.4 + §7.4b.8 (Option A → B fallback) | Frametime instrumentation p95 < 30 ms |
| 12 — Queue depth misalignment | Phase 0 + 4 | §10.0.8 (extend with full table) | Empirical queue probe at boot |
| 13 — V2 STT D&D vocab | Phase 11 + 12 | §4.5 + §12.C q17 | IT slang corpus test |
| 14 — MCP streaming UX | Phase 11 + 12 | §5.3 + §7.10 + §8 | Worked examples re-validated with milestones |
| 15 — sRGB FS dither | Phase 0 + 4 | §10.0.2 (extend with calibration) + §7.4b.5 | Luminance-ramp test pattern on G2 |
| 16 — Token reuse on phone loss | Phase 3 + 7 | §11.5.4 (extend with rotation + revocation list) | Revocation latency <30 sec test |
| 17 — Multi-device same character | Phase 3 + 13 | §7.14.7.4 (extend with scope schema) | Subscription-scope routing unit test |

**Phase ordering implications:**

- **Phase 0 expands** beyond Specs §10.0 to include: multi-environment §10.0.3, sustained §10.0.7, full queue-depth table §10.0.8, palette calibration sub-step in §10.0.2, boot-time format probe spec.
- **Phase 4 carries the most pitfalls** (3, 4, 10, 11, 12, 15) — flag as **highest-risk phase** in roadmap with extra time buffer beyond Specs §10 Phase 4 Week 4–7. Recommend 4 weeks → 5 weeks if buffer is available.
- **Phase 5 (panels)** addresses i18n + settings UX (8, 9) — relatively low risk if catalog schema is right from Phase 1.
- **Phase 6 (R1)** must establish INV-5 (gesture determinism) — small change, large UX impact.
- **Phase 7 (write path)** bundles Foundry/dnd5e pitfalls (1, 6) + token rotation (16); allocate full week.
- **Phase 10 (field test)** is verification-heavy: HUD fatigue, BLE microwave test, mid-session settings, firmware compatibility matrix. Specs commits to 4h session — extend to multi-session for fatigue measurement.
- **Phase 11/12 V2** carries 13 + 14; lower priority since V2 is opt-in.

## Sources

- **Specs.md (canonical)** — `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/Specs.md` v0.9.11, especially §11 risk register, §11.5.7/§11.5.8 library stack & failure modes, §12 open questions, §10.0 Phase 0 validation tests, §7.4b raster pipeline, §7.14 navigation map, §7.16 i18n
- **PROJECT.md** — `/home/aiacos/workspace/FoundryVTT/EvenFoundryVTT/.planning/PROJECT.md`
- [dnd5e 5.0.0 release notes — shim removal](https://newreleases.io/project/github/foundryvtt/dnd5e/release/release-5.0.0) (HIGH confidence on shim removal claim)
- [dnd5e 5.3.2 release](https://github.com/foundryvtt/dnd5e/releases/tag/release-5.3.2) (HIGH)
- [dnd5e issue tracker — current breakages](https://github.com/foundryvtt/dnd5e/issues) (HIGH)
- [More Activities module docs (3rd-party reference impl)](https://foundryvtt.com/packages/more-activities) (MEDIUM)
- [MidiQOL package page](https://foundryvtt.com/packages/midi-qol) (HIGH)
- [MidiQOL GitHub mirror](https://github.com/tposney/midi-qol) (HIGH)
- [socketlib package](https://foundryvtt.com/packages/socketlib) (HIGH)
- [Foundry v13 ApplicationV2 hook deprecation issue #12335](https://github.com/foundryvtt/foundryvtt/issues/12335) (HIGH)
- [Foundry API Migration Guides](https://foundryvtt.com/article/migration/) (HIGH)
- [Foundry v13 release notes](https://foundryvtt.com/releases/13.340) (HIGH)
- [Even Realities G2 engineering rebuild blog](https://www.evenrealities.com/blogs/even-insider/how-we-rebuilt-g2-from-the-inside-out) (MEDIUM — vendor blog)
- [Even Realities Known Issues (support)](https://support.evenrealities.com/hc/en-us/articles/14309475255183-Known-Issues) (MEDIUM)
- [Even G2 BLE protocol RE — i-soxi/even-g2-protocol](https://github.com/i-soxi/even-g2-protocol) (LOW — community RE, not authoritative)
- [BLE DLE negotiation — TI BLE-Stack Guide](https://software-dl.ti.com/lprf/simplelink_cc2640r2_latest/docs/blestack/ble_user_guide/html/ble-stack-3.x/data-length-extensions.html) (HIGH)
- [Punch Through — Maximizing BLE Throughput Pt 3 DLE](https://punchthrough.com/maximizing-ble-throughput-part-3-data-length-extension-dle-2/) (HIGH)
- [Punch Through — Maximizing BLE Throughput Pt 4](https://punchthrough.com/ble-throughput-part-4/) (HIGH)
- [Floyd-Steinberg Wikipedia](https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering) (HIGH)
- [Floyd-Steinberg implementation gentle intro 2024](https://every-algorithm.github.io/2024/10/19/floydsteinberg_dithering.html) (MEDIUM)
- [INAIRSPACE — AR ergonomics blog](https://inairspace.com/blogs/learn-with-inair/ergonomics-design-for-ar-glass-the-unseen-bridge-between-human-and-machine) (MEDIUM)
- [MDPI 2024 — Smart glasses logistics 6-month observational](https://www.mdpi.com/1424-8220/24/20/6515) (HIGH — peer-reviewed)
- [AR glasses comfort analysis — ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2405844024119305) (HIGH — peer-reviewed)
- [PubMed — AR glasses comfort during long-term wear](https://pubmed.ncbi.nlm.nih.gov/36377507/) (HIGH)
- [HUD Glasses Guide 2026](https://electronics.alibaba.com/buyingguides/hud-glasses-guide-what-actually-matters-in-2026) (LOW — buying guide tone)
- [MCP 2026 Roadmap (official)](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) (HIGH)
- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) (HIGH)
- [D&D 2024 IT translation gist (336 spells)](https://gist.github.com/vietts/bee17c5aaa7b74f470c8016085864202) (MEDIUM — community resource)
- [Italian D&D Wiki — Palla di Fuoco](https://dungeonsanddragons.fandom.com/it/wiki/Palla_di_Fuoco) (MEDIUM)
- [QR Code Authentication Guide — OLOID](https://www.oloid.com/blog/qr-code-authentication) (MEDIUM)
- [Token Replay Attacks — Obsidian Security](https://www.obsidiansecurity.com/blog/token-replay-attacks-detection-prevention) (MEDIUM)
- [Bearer token security — Auth0 refresh tokens](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) (HIGH)
- [Foundry Users & Permissions](https://foundryvtt.com/article/users/) (HIGH)
- [Foundry Tokens article](https://foundryvtt.com/article/tokens/) (HIGH)

---
*Pitfalls research for: FoundryVTT D&D 5e companion plugin streaming to Even Realities G2 AR glasses with optional V2 MCP voice*
*Researched: 2026-05-10 (consumer of Specs.md v0.9.11)*
*Confidence: MEDIUM overall — HIGH on Foundry/BLE/Floyd-Steinberg via authoritative sources, MEDIUM on Even Realities (limited public surface), LOW on MCP streaming UX (rapidly evolving, 2026 roadmap)*
