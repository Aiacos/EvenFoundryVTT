# Domain Pitfalls

**Domain:** FoundryVTT D&D 5e companion plugin streaming to Even Realities G2 AR glasses + R1 ring (BLE), with optional V2 MCP voice
**Researched:** 2026-05-10 (baseline) + 2026-06-05 (v0.10.0 raster-substrate addendum)
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

## v0.10.0 Raster UI Substrate — Project-Specific Pitfalls

> **Scope:** The pitfalls below are specific to milestone v0.10.0 (converting the text-container HUD to a composited raster canvas substrate). They supplement the baseline pitfalls above. Cross-references: ADR-0013 (`docs/architecture/0013-hud-raster-rendering.md`), ADR-0005 (`docs/architecture/0005-phase0-go-no-go.md`), `TODO-hud-raster.md`.

---

### Pitfall R-1: Canvas text rendering is non-deterministic across engines — the INV-1 ASCII contract becomes meaningless without a new raster-snapshot contract

**What goes wrong:**
The existing INV-1 suite in `packages/shared-render/src/fixtures/` contains ~60 `.txt` ASCII fixtures that assert character-perfect output for every HUD state. Once the HUD substrate moves to canvas, those fixtures test the *text-container (glyph fallback) path* — not the production raster path. If the raster HUD ships without a replacement INV-1 contract, CI stays green while the primary rendering surface has zero fixture coverage.

Simultaneously, canvas `fillText()` with `'14px monospace'` is non-deterministic:
- Chrome (V8) renders fonts at slightly different sub-pixel positions than Safari WKWebView (the actual runtime on iOS).
- `measureText()` return values differ between engines.
- happy-dom (the Vitest test environment) has no real canvas 2D implementation — `renderHudFrame()` throws "no canvas API available" and cannot be called from unit tests.
- Linux CI runner uses a different font-renderer than macOS dev or iOS WebView.

A test that snapshots `canvas.toDataURL()` or PNG bytes across these environments will be **flaky by construction**.

**Why it happens:**
Canvas text rendering depends on font rasterizer, font file on disk, subpixel hinting, and the OS text engine. Cross-platform canonical output for `ctx.fillText()` does not exist.

**Consequences:**
- Old ASCII INV-1 suite passes but tests a path exercised only in BLE-degraded glyph fallback.
- No automated guard on the primary raster HUD layout — visual regressions are invisible to CI.
- A refactor moves a draw call and nothing catches it.

**Prevention — the correct INV-1 raster contract:**

The only stable, cross-platform, deterministic output from the raster pipeline is the **pipeline itself applied to a synthetic RGBA buffer**. This pattern is already proven in `hud-raster-frame.test.ts`:

1. **Inject a synthetic RGBA fixture** — a deterministic pixel array that does NOT come from `renderHudFrame()`. This bypasses canvas text non-determinism entirely.
2. **Run `buildHudTiles(syntheticRgba)`** through the full dither + encode pipeline.
3. **Snapshot the tile PNG SHA-256 or xxhash** with `expect(hex).toMatchInlineSnapshot()`. The dither algorithm (`image-q` Floyd-Steinberg with the canonical 16-step palette) is deterministic for a given input — same bytes in, same PNG out, every platform.
4. **Content-correctness tests on pure functions**: `formatConditions`, `formatSlots`, `formatDeathSaves`, `hpFraction` are already pure and testable without canvas. Unit-test these independently of `renderHudFrame`.
5. **Visual layout gate**: use the EvenHub simulator HTTP screenshot API (`pnpm sim shot`) as a **manual gate** with `human_needed` verification mode — the same pattern established by ADR-0005. This is not a Vitest test; it is a manual inspection step.

The distinction: INV-1 raster tests pipeline determinism (dither → encode → bytes), not canvas font rendering. Canvas font rendering is validated visually via simulator screenshot.

**Phase to own the mitigation:**
- **Phase promoting raster to default (TODO-hud-raster #4)**: define the new INV-1 raster contract in a written note before retiring the text-container HUD as the primary path.
- **Phase wiring the production loop (TODO-hud-raster #1 + #2)**: add `toMatchInlineSnapshot` hash tests against at least one canonical synthetic input.
- **Do NOT retire the ASCII fixture suite** until glyph path is explicitly gated in a separate CI target.

**Warning signs:**
- CI green but `pnpm sim shot` shows a blank or garbled HUD.
- `hud-canvas-renderer.ts` renders on the developer's machine but not on the CI Linux runner (font missing → empty canvas).
- The `inv:all` orchestrator passes with 0 raster-specific assertions.
- A developer changes `renderHudFrame` draw order and no test catches it.

**Severity:** **CRITICAL** — gates the entire milestone's quality bar.

---

### Pitfall R-2: Hardware tile size (288×144) is unverified on real G2 — the 200×100 documented cap may be enforced on real hardware

**What goes wrong:**
ADR-0013 documents that the PoC "pushed 288×144 tiles and it WORKED in the simulator." ADR-0005 §OQ-INV2-1.b explicitly states the simulator does not enforce hardware-size constraints and the specific 200×100 size limit is unconfirmed. The entire v0.10.0 raster substrate is built on 288×144 tiles — 4× the documented container area (41,472 pixels vs 20,000 pixels).

If real hardware enforces the 200×100 cap, every `updateImageRawData` call for a 288×144 tile will either silently drop, crop to 200×100, or return non-success. The entire raster HUD fails on real hardware while appearing perfect in the simulator.

**Why it happens:**
The EvenHub simulator explicitly says it does NOT enforce hardware image size limits. This is a known, documented gap in ADR-0005 Branch A PROVISIONAL.

**Consequences:**
- v0.10.0 ships; field UAT fails immediately on the first hardware test.
- TILE_W=288, TILE_H=144 constants in `hud-raster-frame.ts` need complete rework.
- Fallback tiling scheme (4 tiles of 200×100, matching the existing `raster-worker.ts` map geometry) must be designed under pressure.

**Prevention:**

1. **INV-2 re-verify before TODO-hud-raster #4 (promote off flag)**: fetch `hub.evenrealities.com/docs/guides/device-apis` and `hub.evenrealities.com/docs/getting-started/overview` and check for image container size documentation updates. Log result with confidence level.
2. **Contingency tiling design ready**: design the fallback scheme (400×200 canvas → 4×200×100 tiles, matching `raster-worker.ts` geometry) as a parallel code path. Parameterize `HUD_TILE_GEOMETRY` so a config flag can switch between `FULL_SCREEN_2x2` (288×144, simulator-verified) and `DOCUMENTED_LIMIT_2x2` (200×100, spec-documented).
3. **ADR-0005 §OQ-INV2-1.b carry**: add a `human_needed` success criterion in the v0.10.0 phase plan explicitly gating "288×144 tile accepted by real G2 hardware" — following the established Branch A PROVISIONAL carry pattern.

**Phase to own the mitigation:**
- **INV-2 re-verify**: in the phase declaring TODO-hud-raster #4. Must complete before any PR makes the raster HUD the default boot page.
- **Hardware UAT**: carry as `human_needed` SC to the Hardware UAT closure milestone.

**Warning signs:**
- `pushHudTiles` logs non-success `updateImageRawData` results on real hardware.
- Real G2 shows a black screen or shows only the top-left 200×100 crop of each tile.
- `pnpm sim shot` shows correct rendering but the user reports black glasses.

**Severity:** **CRITICAL** — a single hardware test away from a complete rework.

---

### Pitfall R-3: Re-encoding all 4 tiles unconditionally on every `character.delta` is a BLE bandwidth bomb

**What goes wrong:**
`hud-live-render.ts` currently re-renders, re-dithers, and re-encodes all 4 tiles on every `character.delta` event. The file explicitly documents this: "TODO(ADR-0013): xxhash sub-tile delta diffing is TODO-hud-raster #2 — intentionally out of scope."

A full-frame push at 576×288 4-bit PNG after dithering produces approximately 4 tiles × ~12 KB each = ~48 KB per event. At 5 fps with no delta: 48 KB × 5 = 240 KB/sec sustained — which exactly saturates the Phase 0 Branch A p50 threshold of 200 kbps. In combat, `character.delta` fires 3–5 times per round for HP changes, condition toggles, spell slot use. Without delta: 3 events × 48 KB = 144 KB in one second on top of other BLE traffic.

**Why it happens:**
The PoC (TODO-hud-raster #1) intentionally omitted delta encoding to get a working single-frame render. This was correct PoC scope. The risk is that TODO-hud-raster #2 is deferred indefinitely while the no-delta path stays wired to `character.delta`.

**Consequences:**
- BLE saturation → queue depth exceeded → firmware drops tiles → visual corruption (baseline Pitfall 3).
- Even in the simulator (unconstrained BLE), 4 full Floyd-Steinberg encodes per delta event stalls the WebView main thread (see Pitfall R-5).

**Prevention:**

1. **Phase plan TODO-hud-raster #2 as a blocking item for #4**: never promote the raster HUD to default boot page while #2 (delta loop) is outstanding.
2. **Wire the existing xxhash infrastructure**: `TileDelta` in `tile-delta.ts` already implements sub-tile hash diffing. A HUD-specific `TileDelta(4, N)` instance (N sub-tiles per 288×144 tile) short-circuits re-encoding for unchanged tiles.
3. **Static pre-bake pattern** (ADR-0013 §Decision): pre-bake the chrome layer (dividers, labels, static backgrounds) once at boot. Only the dynamic data cells (HP number, slot pips, turn indicator) are re-rendered on delta. The chrome hash never changes → those sub-tiles skip re-encode.
4. **Immediate guard**: add `MIN_REDRAW_INTERVAL_MS = 200` in `makeSnapshotRenderHandler` before #2 is fully implemented. Prevents burst floods at negligible cost.
5. **Roadmap ordering constraint**: TODO-hud-raster #4 (promote) must be sequenced AFTER #2 (delta loop) in the phase plan.

**Warning signs:**
- CPU profiler shows the render loop consuming >30% of main thread budget.
- `pushHudTiles` logs non-success results during a simulated combat sequence.
- Bridge telemetry shows BLE outbound spikes >200 KB/event.

**Severity:** **CRITICAL** — BLE saturation breaks the primary feature on real hardware.

---

### Pitfall R-4: The existing ASCII INV-1 test suite becomes a false safety net — stale green tests hide raster regressions

**What goes wrong:**
The ~60 ASCII fixture files in `packages/shared-render/src/fixtures/` test the text-container rendering path. When the HUD substrate moves to raster canvas, these fixtures continue testing the glyph-fallback path. In the typical development + CI context (no real G2, no BLE), the glyph path is never triggered; tests pass vacuously. The result: passing fixtures give the impression the HUD is thoroughly tested while the primary rendering surface has zero fixture coverage.

**Prevention:**

1. **Annotate glyph-path fixtures** with a comment clarifying they test the BLE-degraded fallback, not the production path.
2. **Do NOT delete the ASCII fixtures** until the glyph fallback has its own dedicated CI target.
3. **Create a `raster-fixtures/` directory** in `packages/shared-render/src/` for raster INV-1 artifacts (synthetic-input tile hashes, pure-function content snapshots). Physically separate the two test domains.
4. **Update `inv:all`** to distinguish "glyph suite" (existing, BLE-degraded path) from "raster suite" (new, primary path). Both must green for `inv:all` to pass.

**Phase to own the mitigation:** Same phase as Pitfall R-1 mitigation — when defining the new INV-1 raster contract.

**Warning signs:**
- `pnpm inv:all` shows 60/60 passing with "raster" nowhere in the output.
- A developer changes `renderHudFrame` draw order and no test flags it.

**Severity:** MODERATE — creates a false quality signal; the real damage is silent regressions.

---

### Pitfall R-5: `renderHudFrame` runs on the WebView main thread — dither CPU cost causes main-thread jank and R1 gesture starvation

**What goes wrong:**
The current PoC calls `renderHudFrame()` synchronously in the WS subscription callback on the main thread. `getImageData(0, 0, 576, 288)` blocks the main thread until the GPU compositor finishes. `buildHudTiles()` then runs `image-q` Floyd-Steinberg on 4 × 288×144 = 165,888 pixel dither passes — also on the main thread. HUD tiles are 4× larger in area than map tiles (288×144 vs 200×100 per tile), and map tiles already required worker isolation per the raster-worker design.

Main-thread synchronous dither → jank → dropped R1 gesture events → player presses swipe-up and the HUD doesn't respond.

**Prevention:**

1. **Move `buildHudTiles()` into the Web Worker**: TODO-hud-raster #7 (generalize raster pipeline geometry) is the correct solution. Worker receives RGBA buffer via `Transferable` (zero-copy), runs dither + encode, posts tiles back.
2. **Interim mitigation**: yield the event loop between render and encode with `scheduler.postTask()` or `setTimeout(0)` to prevent gesture-event starvation.
3. **Architecture split**: `renderHudFrame()` stays main-thread (needs `document`/`OffscreenCanvas`); only `buildHudTiles()` moves to the worker.

**Phase to own the mitigation:**
- **TODO-hud-raster #7**: moves dither to worker.
- **TODO-hud-raster #1 (short-term)**: add `setTimeout(0)` yield between render and assemble as an interim guard.

**Warning signs:**
- R1 swipe-up input has >200 ms latency during a `character.delta` render cycle.
- Chrome DevTools timeline shows main thread blocked >100 ms during HUD render.
- Gesture events arrive with timestamps >3 frames behind the BLE receive time.

**Severity:** MODERATE — causes gesture-input degradation under combat load.

---

### Pitfall R-6: INV-3 doc drift — Specs §7 ASCII mockups become stale once the HUD is raster

**What goes wrong:**
Specs.md §7.4 (Status HUD) and §7.2 (Layered Rendering Model) contain ASCII mockups that describe the text-container layout. Once the HUD substrate is raster canvas, these mockups describe only the glyph-fallback path — but look like current specs to any reader. INV-3 mandates Specs.md + README + showcase update in the same commit for any cross-cutting change.

The README's "Rendering" section and the showcase stat of "10 rows × 50 chars" (the 27px SDK grid) become factually wrong once the raster HUD ships with 20+ canvas rows.

**Prevention:**

1. **Atomic INV-3 commit** for the PR that promotes the raster HUD to default (TODO-hud-raster #4) must update:
   - Specs.md §7.2 — add raster substrate section
   - Specs.md §7.4 — mark existing ASCII mockup as "glyph fallback" and add a raster canvas layout spec
   - README.md — update "Rendering" section
   - `docs/showcase/index.html` — update font size stat and rendering description
2. **Pre-promotion checklist**: add "Specs §7 ASCII mockups still accurate for glyph fallback?" as an explicit item in the phase plan.
3. **ASCII mockups are NOT deleted**: they describe the glyph-fallback path (still valid). Move them to a "Glyph Fallback Mode" subsection of §7.4, clearly labeled.

**Phase to own the mitigation:** TODO-hud-raster #6 (INV-3 coherence) — scoped to cover §7 ASCII mockup migration, not just a version bump.

**Warning signs:**
- Specs.md §7.4 still shows text-container ASCII after raster HUD is the default.
- A developer reads §7 and tries to add a new text container to the HUD.
- README hero stat says "10 rows × 50 chars" after the raster HUD ships.

**Severity:** MODERATE — INV-3 violation; causes incorrect future development.

---

### Pitfall R-7: The capture-container invariant (INV-5) breaks if the raster HUD page schema omits `isEventCapture: 1`

**What goes wrong:**
The text-container HUD page declares one container with `isEventCapture: 1`. The raster HUD PoC page (`buildHudPocPageSchema()`) declares `containerTotalNum: 4` with only `imageObject: [...]` and `textObject: []` — no capture container. The PoC boots via `?hud=raster` bypassing `LayerManager`. When TODO-hud-raster #4 promotes the raster HUD to the default boot page through `LayerManager`, the capture invariant check fires: `LayerManagerError('capture_invariant_violated')` on every page transition.

Since the raster HUD uses all 4 image containers for tiles, there is no room for a dedicated image capture container. The capture container must either be an additional text container (`containerTotalNum: 5`) or a zero-size invisible container — both untested on real hardware.

**Prevention:**

1. **Design capture container placement explicitly** before TODO-hud-raster #4. Record the decision in ADR-0013 as a §Consequences addendum.
2. **Test the zero-size capture container pattern in the simulator** before promoting.
3. **Add a capture-container assertion** to `hud-poc-page.test.ts` once the schema includes the capture container.
4. **The `LayerManager._flushPage()` raster path must include the capture container** once it learns to flush the raster HUD schema.

**Phase to own the mitigation:** TODO-hud-raster #4 — capture container placement is a hard prerequisite.

**Warning signs:**
- `LayerManagerError('capture_invariant_violated')` in the boot log after promotion.
- R1 gesture events stop arriving after page transitions.
- The simulator accepts the 4-image-only schema but real G2 requires a capture container for R1 events.

**Severity:** MODERATE — breaks gesture input entirely on page transition.

---

### Pitfall R-8: `buildGreyscalePalette` + `ditherTile` are duplicated from `raster-worker.ts` — divergence produces different pixel output for the same input

**What goes wrong:**
`hud-raster-frame.ts` explicitly documents that `buildGreyscalePalette()` and `ditherTile()` are "replicated MINIMALLY from `raster-worker.ts`" because the worker cannot be imported in the main thread. This creates two canonical implementations of the core raster pipeline.

If a future change updates the palette algorithm or dither options in `raster-worker.ts` (e.g., enabling serpentine scan per baseline Pitfall 15's mitigation), the HUD pipeline is not automatically updated. Map tiles and HUD tiles dither the same input differently, visible as mismatched brightness across the screen.

**Prevention:**

1. **TODO-hud-raster #7 (pipeline generalization)** is the correct fix — one worker, one pipeline. This pitfall is explicitly a PoC-only compromise.
2. **Until #7 lands**: add a cross-file constant comparison test asserting palette constants in `hud-raster-frame.ts` match `raster-worker.ts`.
3. **Track the divergence explicitly**: ADR-0013 §Scope item "Generalize the raster pipeline geometry" must be sequenced before any palette calibration work.

**Phase to own the mitigation:** TODO-hud-raster #7 — eliminate duplication entirely.

**Warning signs:**
- Map tile midtones render at different apparent brightness than HUD tile midtones on the same screen.
- A palette parameter change is committed to `raster-worker.ts` without updating `hud-raster-frame.ts`.

**Severity:** MODERATE — visual artifact on real hardware; low priority in simulator.

---

## Minor Pitfalls

### Pitfall R-9: Small font legibility on 4-bit greyscale — anti-aliased text + FS dither = muddy characters at 14px

**What goes wrong:**
At 14px monospace, character strokes are 1–2 pixels wide. Anti-aliasing fringe pixels (intermediate greyscale, ~0.3–0.7 luma) are dithered individually. With only 16 palette levels, the dither pattern at this scale is visible as noise within the character strokes, not just in the background. Thin characters (`a`, `e`, `s` at 14px) may become illegible.

**Prevention:**

1. **Bitmap/pixel font**: a 1-bit pixel font (no anti-aliasing) eliminates the dither-fringe problem. This is explicitly the scope of TODO-hud-raster #3.
2. **Pre-test in simulator**: `pnpm sim shot` before finalizing the font choice.
3. **Minimum stroke width**: at ≥16px, strokes are reliably 2px and dither cleanly. A pixel font at 8px (every pixel exactly 0 or 255) outperforms system monospace at 14px on legibility.

**Phase to own the mitigation:** TODO-hud-raster #3 — the explicit scope for font choice.

**Warning signs:**
- `pnpm sim shot` shows "grainy" text where lowercase characters are hard to distinguish.
- Character strokes thinner than 2px visible in the screenshot.

**Severity:** MINOR (addressed by TODO #3, already planned) but HIGH USER IMPACT if font is finalized without visual validation.

---

### Pitfall R-10: `FontFaceSet` not available in `WorkerGlobalScope` on older WKWebView — custom font loading in the worker silently falls back to system font

**What goes wrong:**
If TODO-hud-raster #7 moves `renderHudFrame()` into the Web Worker, `document.fonts` is unavailable. `FontFace` + `self.fonts.add(face)` in a worker exists in modern browsers but is NOT supported in older WKWebView versions (iOS 15 and earlier). If the font fails to load silently, `ctx.font = '8px MyPixelFont'` falls back to system monospace — different size, anti-aliased, different layout — without any error.

**Prevention:**

1. **Font loading test in the worker**: assert font is available after worker init; emit error to main thread and fall back to glyph mode if not.
2. **Data-URI embedded font**: inline the font as base64 in the TypeScript source. Eliminates the network round-trip and the `FontFaceSet` availability issue.
3. **Stick to system fonts in the worker if portability matters**: `'monospace'` is available everywhere. Custom pixel font + worker = must solve this explicitly.

**Phase to own the mitigation:** TODO-hud-raster #7 — if rendering moves to the worker, font loading strategy is a prerequisite.

**Warning signs:**
- Worker logs font load failure; HUD renders with fallback font at wrong size.
- Layout breaks on iOS 15 but works on iOS 17.
- `pnpm sim shot` (Chromium) shows pixel font; real iPhone shows system monospace.

**Severity:** MINOR — only relevant when TODO #3 (custom font) AND #7 (worker rendering) are both implemented.

---

### Pitfall R-11: The text-HUD-to-raster migration leaves a half-migrated codebase if the transition scope is not tracked explicitly

**What goes wrong:**
The current codebase has parallel paths:
- `packages/g2-app/src/status-hud/status-hud-renderer.ts` — text-container HUD (default boot)
- `packages/g2-app/src/hud/hud-canvas-renderer.ts` — raster canvas HUD (PoC, `?hud=raster`)
- `packages/g2-app/src/engine/container-registry.ts` — text container registry (drives default boot page)
- `packages/g2-app/src/hud/hud-poc-page.ts` — raster page schema (PoC-only)

Without an explicit migration scope in the TODO-hud-raster #4 phase plan, the codebase risks: the default boot page still uses the text-container path but `status-hud-renderer.ts` is half-refactored; the `?hud=raster` guard is never removed (INV-4 dead code); the old renderer is neither deleted nor clearly labeled as glyph fallback.

**Prevention:**

1. **Explicit migration checklist in the #4 phase plan**:
   - Is `status-hud-renderer.ts` retired, kept for glyph fallback (rename to `glyph-hud-renderer.ts`), or merged?
   - Is `container-registry.ts` default page schema updated to 4-image-tile schema?
   - Are all `?hud=raster` guards removed or converted to explicit feature flags with a defined retirement date?
2. **INV-4 dead-code enforcement**: Biome will flag unreachable code. TSDoc must be updated on every module that changes responsibility.
3. **Rename rather than delete**: `status-hud-renderer.ts` → `glyph-hud-renderer.ts` with a TSDoc header clarifying it is the BLE-degraded fallback.

**Phase to own the mitigation:** TODO-hud-raster #4 — explicit promotion scope defines what gets retired, kept, and renamed.

**Warning signs:**
- `status-hud-renderer.ts` has no callers but no `@deprecated` tag.
- The `?hud=raster` flag guard is still in the codebase 2 phases after promotion.
- INV-4 CI gate catches dead imports in `container-registry.ts` after the raster page becomes default.

**Severity:** MINOR — technical debt; not a user-facing bug.

---

## Phase-Specific Warnings (v0.10.0)

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| TODO #1: Live re-render wiring | Raw WS events call renderRasterHudFrame without debounce → BLE saturation | Add 200 ms debounce gate BEFORE wiring; document as prerequisite for #2 |
| TODO #2: Delta loop | TileDelta geometry hardcoded for 200×100 map tiles; HUD needs 288×144 geometry | Parameterize TileDelta sub-tile geometry; do not copy-paste 200×100 constants |
| TODO #3: Final font | System monospace at 14px + FS dither = muddy characters (R-9) | Test pixel/bitmap font via `pnpm sim shot` before committing |
| TODO #4: Promote off flag | Missing capture container (R-7); INV-2 re-verify of 288×144 size limit (R-2); INV-3 §7 mockup drift (R-6) | All three are hard prerequisites; no PR merge until all three green |
| TODO #5: INV-1 raster contract | Fixture snapshots hash the pipeline output, not `renderHudFrame` canvas output (R-1) | Synthetic RGBA → `buildHudTiles` → hash tile PNG bytes; content tests on pure functions only |
| TODO #6: INV-3 coherence | Specs §7 describes text-container layout; README says "10 rows × 50 chars" (R-6) | Update §7 ASCII mockups as "glyph fallback" section; update README font stat |
| TODO #7: Pipeline generalization | `buildGreyscalePalette` / `ditherTile` duplication between worker and HUD (R-8) | Merge into shared worker export; delete replicated functions in `hud-raster-frame.ts` |
| Hardware UAT (any future milestone) | 288×144 tile size rejected by real G2 hardware (R-2) | `human_needed` SC must gate the hardware closure milestone; fallback tiling design ready before UAT |

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
| Re-encode all 4 HUD tiles on every character.delta (no delta loop) | Simpler PoC implementation | Pitfall R-3 — BLE bandwidth bomb; saturates link at 5 fps with no delta | Never in production — TODO-hud-raster #2 must precede #4 |
| Promote raster HUD before INV-2 re-verify of tile size | Faster milestone close | Pitfall R-2 — first real-hardware test fails entirely | Never — INV-2 re-verify is a 30-min task; no excuse to skip |

## Integration Gotchas

Common mistakes when connecting to external services in this domain.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Foundry module + dnd5e 5.x** | Reading `item.system.actionType` to dispatch | Read `activity.type` from `item.system.activities[i]` — activities are the canonical surface (pitfall 1) |
| **Foundry v13 targeting** | Using global `game.user.targets` from any context | v13 targeting is per-user; bridge must track per-user. `TokenLayer.setTargets()` per Specs §FOUN-04 expects user context |
| **MidiQOL + socketlib** | Calling `activity.use()` on player + forwarding via socketlib | Pick one workflow origin (option A: GM-side via socketlib only) per pitfall 6 |
| **Even Realities WebView** | Assuming standard browser CSP, all WebAPIs available | Domain whitelist required in `app.json`; some APIs may be missing — capability-detect at boot |
| **Even Realities G2 BLE** | Trusting connect-time MTU through session | Inferred MTU monitoring via RTT canary (pitfall 10); log every MTU observation as telemetry |
| **R1 ring SDK** | Treating tap and double-tap as truly separate events | Timing window is firmware-defined; tune debounce in Phase 6, not Phase 0 |
| **MCP server (V2)** | Running pre-2025-03-26 HTTP+SSE transport | Use Streamable HTTP per Specs §4.7 + 2026 MCP roadmap; HTTP+SSE deprecated |
| **MCP client (V2)** | Streaming all tool-call events to UI | Coalesce to milestone events per Tool Registry (pitfall 14) |
| **STT (V2)** | Single-language model | Multilingual model + locale-aware fuzzy lookup table (pitfall 13) |
| **Sharp (Option B bridge raster)** | Expecting 4-bit indexed PNG output | Sharp produces 8-bit indexed; post-pass via upng-js to 4-bit |
| **xxhash-wasm** | Rolling JS hash because "WASM is overkill" | 5–10× slowdown blows compute budget per Specs §11.5.7.1 — adopt the wasm path |
| **image-q npm** | Trusting npm version matches GitHub tag | Specs §11.5.7 documents npm 4.x vs git latest mismatch; pin by hash in pnpm-lock |
| **HUD raster tile geometry** | Using 288×144 as confirmed hardware limit (not just simulator-confirmed) | 288×144 is PROVISIONAL per ADR-0005 §OQ-INV2-1.b; always carry `human_needed` SC until real hardware confirms |
| **HUD INV-1 contract** | Snapshotting canvas output bytes as the regression gate | Canvas output is non-deterministic across engines; snapshot `buildHudTiles` output from synthetic RGBA instead |

## Performance Traps

Patterns that work at small scale but fail as session length / load grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-tile push every frame (no delta) | BLE saturated, fps caps at ~2 | Layer 1 xxhash delta from Phase 4 day 1 (Specs §7.4b.6.1.2) | Round 2 of any combat |
| Delta encoding without keyframe interval | Tile corruption persists across reconnect (pitfall 3) | Force keyframe every 10 sec; seqno tracking | After first BLE blip |
| Render Status HUD every Foundry render tick | UI thread blocked, player Foundry stutters (pitfall 11) | Schedule HUD updates on actor-state-change events only | After 30 min sustained play |
| Persistent BLE bandwidth telemetry only at connect | DLE renegotiation invisible (pitfall 10) | RTT canary every 2 sec | Phone battery <25% or background switch |
| Ship adaptive fps with only scene-activity input | Doesn't react to BLE degradation | Layer 6 reads both scene activity AND BLE telemeter | First user with bad WiFi |
| Cache PIXI canvas extract result | Stale tiles when scene changes | Invalidate on canvas-dirty events | First token move after extract caching |
| Hash 200 sub-tiles in JS instead of WASM | Compute alone exceeds 66 ms frame budget | xxhash-wasm per Specs §11.5.7.1 | At 8+ fps target |
| Catalog all i18n strings as cosmetic (no kind taxonomy) | IT/DE/ES strings truncate-lose-info | Kind taxonomy + per-kind truncation strategy (pitfall 9) | First non-EN field test |
| MCP tool-call results streamed verbatim | UI feels slower than synchronous | Coalesce to milestones (pitfall 14) | First V2 voice user |
| Re-encode all 4 HUD tiles per character.delta without debounce | BLE saturation in combat; main-thread jank on every delta event | 200 ms debounce + delta hash (pitfall R-3) | First combat encounter |
| Run `renderHudFrame` + `buildHudTiles` synchronously on main thread | R1 gesture events dropped during render (pitfall R-5) | Move `buildHudTiles` to Web Worker (TODO-hud-raster #7) | Heavy combat with frequent delta events |
| Finalize tile geometry at 288×144 without INV-2 re-verify | First real-hardware push returns non-success; blank screen | INV-2 re-verify + fallback tiling path ready before promotion (pitfall R-2) | First hardware UAT session |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| 24h opaque bearer token with no rotation | Phone-loss attack window (pitfall 16) | Refresh-token pattern with 15-min access tokens; bridge revocation list with WS push |
| Token paste fallback always available alongside QR | Defeats the point of QR provisioning | Hide paste behind admin toggle |
| WS endpoint accepts any Origin header | Cross-site connection from malicious page | CORS whitelist enforced |
| Bridge URL stored in phone localStorage in cleartext | Local-device-compromise reads URL+token | Use platform secure storage |
| Voice recordings (V2) sent to cloud STT without consent prompt | GDPR | Default opt-in, explicit consent dialog at first activation |
| MCP tool exposes write actions without GM authority gate | Player AI bypasses DM judgement | Tool Registry §5.3 — every write tool must be cancellable from GM chat |
| QR payload includes raw token (not nonce → fetch-token) | Token captured if QR is photographed | QR contains a one-time pairing code; phone exchanges code for token over TLS |
| No audit log of pair/unpair events | Can't detect compromise | Append-only pairing event log in DM Settings |

## UX Pitfalls

Common user experience mistakes specific to AR HUD + tabletop social context.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Constant-on full-density status HUD (pitfall 4) | Eye fatigue at 30-60 min mark; player removes glasses | Layered priority + idle dimmer + user toggle |
| R1 long-press meaning differs by overlay (pitfall 5) | Misclick shame in social setting; trust erosion | INV-5 gesture determinism: long-press always means Quick Action of current top layer |
| No visual indication of "system thinking" during BLE blip | Player thinks system froze; tries random gestures | Header chip `⚠ SYNC` during reconnect; greyed quick actions |
| Toast for every dice roll, all auto-dismiss 3s | Combat round 4: 20 toasts queued, miss critical info | Toast deduplication; long-press to pin; rolls below DC threshold suppressed |
| Settings change broadcast as silent toast | User doesn't notice DM changed something | Banner notification with brief animation, dismissable explicitly |
| Confirmation modal for every action (defensive design) | Combat takes 3× longer; flow killed | Confirm only state-altering Quick Actions |
| Italian player reads truncated stat strings (pitfall 9) | Loses concentration target, mis-applies effect | Kind-aware truncation + abbreviation tables |
| MCP V2 streaming UI exposes tool names (pitfall 14) | Sees `roll_attack_v2` instead of "rolling attack" | Milestone naming; never leak internal tool names |
| Ghost token after delta-encoding error (pitfall 3) | Player attacks empty square; embarrassment | Keyframe interval + visible chip when stale state detected |
| HUD raster font too small/noisy (pitfall R-9) | Player squints to read HP during combat | Validate font choice with `pnpm sim shot` before production; bitmap font preferred |

## "Looks Done But Isn't" Checklist

Things that appear complete in demo but are missing critical pieces.

- [ ] **Raster HUD (v0.10.0):** Looks done when `pnpm sim shot` shows a rendered canvas frame; often missing **delta loop + INV-1 raster contract + capture container + INV-2 re-verify + INV-3 doc update** — verify all 5 are complete before the raster HUD is the default boot page.
- [ ] **INV-1 raster contract:** Looks done with any passing Vitest tests; often missing **synthetic-RGBA tile hash snapshots** — verify `inv:all` includes a `raster suite` entry in addition to the existing `glyph suite`.
- [ ] **Raster pipeline:** Looks done in Phase 4 demo (a static scene renders); often missing **delta+keyframe correctness under reconnect** (pitfall 3) — verify by killing bridge mid-session and confirming rendered tiles are correct on reconnect, not stale.
- [ ] **R1 long-press menu:** Looks done with 9 quick actions visible; often missing **gesture-context disambiguation** (pitfall 5) — verify INV-5 by long-pressing from each of the 8 reachable screens.
- [ ] **Foundry write path:** Looks done with attack producing chat card; often missing **single-workflow-origin discipline** (pitfall 6) — verify `MidiQOL.Workflow.workflows.size === 1` during the operation.
- [ ] **i18n IT support:** Looks done with strings translated; often missing **kind-aware truncation** (pitfall 9) — verify by rendering all status chips in IT.
- [ ] **Phase 0 §10.0.3 BLE bandwidth:** Looks done with a number; often missing **environmental variation** (pitfall 2) — verify in 3 RF environments.
- [ ] **Phase 0 §10.0.7 DLE test:** Looks done with MTU=244 confirmed at connect; often missing **sustained-run validation** (pitfall 10) — verify 30 min sustained, not 30 sec.
- [ ] **Settings UI:** Looks done with 3-tier model documented; often missing **mid-session change broadcast + introspection panel** (pitfall 8).
- [ ] **QR pairing:** Looks done with token provisioned; often missing **revocation latency SLA** (pitfall 16).
- [ ] **Floyd-Steinberg dither:** Looks done with map rendering on G2; often missing **linearize-before-dither + perceptually-spaced palette** (pitfall 15).
- [ ] **Status HUD:** Looks done with all chips visible; often missing **layered priority + idle dimmer** (pitfall 4) — verify with 60-min wear.
- [ ] **Multi-tile rendering:** Looks done with 4-tile mosaic; often missing **queue-depth-aware scheduler** (pitfall 12).
- [ ] **Hardware tile size:** Looks done in simulator; missing **real-hardware confirmation of 288×144 acceptance** (pitfall R-2) — always carry `human_needed` SC.

## Recovery Strategies

When pitfalls occur despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Pitfall 1 (dnd5e 5.x activity API misuse) | HIGH | Adapter rewrite of writer module; Phase 7 work redone |
| Pitfall 2 (BLE under interference) | MEDIUM | Multi-environment test results; tune Layer 6; ship glyph fallback prominent |
| Pitfall 3 (delta corruption) | LOW (if caught early) / HIGH (if shipped) | Add keyframe + seqno; hotfix release with cache invalidation telemetry |
| Pitfall 4 (HUD fatigue) | LOW | Add idle dimmer + layered priority — config-only change |
| Pitfall 5 (gesture polysemy) | MEDIUM | Add INV-5 + footer chip + confirm-before-execute |
| Pitfall 6 (workflow re-entrancy) | HIGH | Pick option A (GM-side); rewrite writer module |
| Pitfall 7 (Even SDK breakage) | VARIES | Capability handshake → glyph mode auto; if total format change → ship update |
| Pitfall 8 (settings drift) | MEDIUM | Add introspection + broadcast events |
| Pitfall 9 (i18n width overflow) | LOW | Catalog augment with kind annotations + abbreviations |
| Pitfall 10 (BLE silent degradation) | MEDIUM | RTT canary; Layer 6 wired; HUD chip added |
| Pitfall 11 (PIXI extract blocking) | MEDIUM | OffscreenCanvas hand-off + cadence throttling |
| Pitfall 12 (queue-depth misalignment) | LOW | Scheduler parameterization |
| Pitfall 13 (V2 STT vocab) | MEDIUM | Vocab file expansion + threshold tuning; iterative |
| Pitfall 14 (MCP streaming UX) | LOW | Tool registry adds milestone schema |
| Pitfall 15 (sRGB FS dither) | LOW | Linearize step in worker; palette recalibration |
| Pitfall 16 (token reuse on phone loss) | MEDIUM | Refresh-token pattern + bridge revocation list |
| Pitfall 17 (multi-device state collision) | LOW | Subscription-scope schema + flag-gate to Phase 13 |
| Pitfall R-1 (INV-1 raster contract missing) | MEDIUM | Define synthetic-RGBA hash tests; annotate glyph suite; creates testing debt |
| Pitfall R-2 (tile size hardware failure) | HIGH | Rework TILE_W/TILE_H to 200×100; redesign page schema; 1-2 days full rework |
| Pitfall R-3 (BLE bandwidth bomb from no delta) | MEDIUM | Add debounce + delta hash as hotfix; promoted path must be patched before next hardware session |
| Pitfall R-4 (ASCII fixtures as false safety net) | LOW | Annotate fixtures; add raster suite; no code rework |
| Pitfall R-5 (main-thread jank from dither) | MEDIUM | Move buildHudTiles to worker; requires TODO-hud-raster #7 |
| Pitfall R-6 (INV-3 doc drift) | LOW | Atomic spec update; 1-2 hours |
| Pitfall R-7 (capture container missing) | LOW-MEDIUM | Add capture container to page schema; test in simulator; 1-3 hours |
| Pitfall R-8 (palette duplication divergence) | LOW | Cross-file constant test; eliminated by TODO #7 |

## Sources

- `docs/architecture/0013-hud-raster-rendering.md` (ADR-0013) — ADR context, consequences, scope, tile geometry decision
- `docs/architecture/0005-phase0-go-no-go.md` (ADR-0005) — OQ-INV2-1.b hardware tile size PROVISIONAL, Branch A PROVISIONAL pattern
- `.planning/PROJECT.md` — v0.10.0 milestone goals, TODO-hud-raster reference, constraints
- `.planning/TODO-hud-raster.md` — 7 next-step items, delta loop scoping, INV-1 / INV-3 items
- `packages/g2-app/src/hud/hud-raster-frame.ts` — 288×144 tile geometry, palette replication comment, `buildHudTiles` API
- `packages/g2-app/src/hud/hud-canvas-renderer.ts` — main-thread canvas rendering, 14px monospace font, happy-dom exclusion note
- `packages/g2-app/src/hud/hud-live-render.ts` — TODO(ADR-0013) delta loop deferral comment, all-tiles re-push pattern
- `packages/g2-app/src/hud/hud-poc-page.ts` — no-capture-container page schema, PoC isolation note
- `packages/g2-app/src/hud/hud-raster-frame.test.ts` — proven synthetic-RGBA test pattern (baseline for INV-1 raster contract)
- `packages/g2-app/src/raster/raster-worker.ts` — map pipeline 200×100 geometry, worker isolation rationale
- `packages/g2-app/src/raster/tile-delta.ts` — TileDelta API, sub-tile geometry constants
- `packages/g2-app/src/engine/layer-manager.ts` — capture-container invariant enforcement
- `packages/shared-render/src/snapshot.ts` — `matchAsciiFixture` pattern (text-container only; baseline for INV-1 architecture)
- `packages/shared-render/src/fixtures/` — ~60 ASCII fixture files (text-container glyph-fallback path)
- CLAUDE.md §Project Invariants — INV-1..5 definitions
- Baseline pitfalls (v0.9.11 research, 2026-05-10): Pitfall 15 (greyscale dithering in sRGB), Pitfall 2 (BLE bandwidth), Pitfall 3 (delta encoding loss)

---

*Baseline pitfalls researched: 2026-05-10 (consumer of Specs.md v0.9.11)*
*v0.10.0 raster addendum researched: 2026-06-05 (consumer of ADR-0013, ADR-0005, TODO-hud-raster.md, hud-raster-frame.ts, hud-canvas-renderer.ts, hud-live-render.ts)*
*Overall confidence: MEDIUM — HIGH on raster pipeline determinism via source code review + image-q/canvas API analysis; MEDIUM on hardware tile size (simulator confirmed, real-hardware pending ADR-0005 OQ-INV2-1.b); HIGH on INV-1 raster contract via existing test pattern analysis*
