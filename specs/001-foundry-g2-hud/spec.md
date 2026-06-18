# Feature Specification: Foundry-to-G2 Glanceable HUD (EvenFoundryVTT MVP)

**Feature Branch**: `001-foundry-g2-hud`

**Created**: 2026-06-18

**Status**: Draft

**Input**: User description: "Study the spec from the old planning and requirements analyzing the whole repo. Delete the previous planning and create new one following Specify rules"

> This specification consolidates the product intent previously captured across `Specs.md`,
> `.planning/PROJECT.md`, `.planning/ROADMAP.md`, the ADRs, and the milestone history into a
> single Spec-Kit feature spec for the EvenFoundryVTT (EVF) MVP. It is technology-agnostic:
> the WHAT and WHY of the product. Implementation choices (bridge stack, raster pipeline,
> protocols) belong in the plan, not here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Glanceable character status without looking away (Priority: P1)

A player at a physical D&D 5e table wears AR glasses. During play they need their current
character status — hit points, armor class, active conditions, key ability scores and saves —
at a glance, without picking up a phone or turning to a laptop. The information mirrors what
the tabletop software (Foundry) holds and updates as the game changes.

**Why this priority**: This is the product's core value — the player never looks away from the
physical scene. Without a live, glanceable character view there is no product.

**Independent Test**: With a character active in Foundry, the player sees that character's HP,
AC, conditions, and abilities on the glasses; changing HP/conditions in Foundry is reflected on
the glasses shortly after, with no screen interaction required.

**Acceptance Scenarios**:

1. **Given** a paired pair of glasses and an active player character in Foundry, **When** the
   session is running, **Then** the glasses display that character's HP, AC, conditions, level,
   and core abilities in a glanceable card.
2. **Given** the character takes damage in Foundry, **When** the HP changes, **Then** the
   glasses reflect the new HP within a few seconds without any gesture from the player.
3. **Given** a condition (e.g., poisoned) is applied in Foundry, **When** it changes, **Then**
   the conditions shown on the glasses update accordingly.

---

### User Story 2 - See the battle map on the glasses (Priority: P1)

The player needs to see the current encounter map — the scene, tokens, and their position —
rendered onto the glasses as a glanceable image, so they can keep tactical awareness while
looking at the physical table.

**Why this priority**: Spatial/tactical awareness is essential to combat play and is the second
pillar of the glanceable experience alongside the character sheet.

**Independent Test**: With a scene open in Foundry, the glasses show a recognizable rendering of
that scene's map; when the view changes (pan or token movement), the glasses update.

**Acceptance Scenarios**:

1. **Given** an active scene in Foundry, **When** the session is running, **Then** the glasses
   show a rendered map of that scene readable on the greyscale display.
2. **Given** tokens move or the view pans in Foundry, **When** the scene changes, **Then** the
   glasses map updates to reflect the change.
3. **Given** the map cannot be rendered as an image on the current connection, **When** quality
   degrades, **Then** the system falls back to a simpler readable representation rather than a
   blank screen.

---

### User Story 3 - Follow combat turn-by-turn (Priority: P1)

During an encounter the player needs to know the initiative order and whose turn it is, on the
glasses, so they are ready to act when their turn comes without watching a screen.

**Why this priority**: Combat is the highest-attention moment of play; missing your turn or the
order breaks the table experience.

**Independent Test**: With an active combat in Foundry, the glasses show the initiative order and
highlight the current combatant; advancing the turn in Foundry updates the glasses.

**Acceptance Scenarios**:

1. **Given** an active combat encounter, **When** the session is running, **Then** the glasses
   show the initiative order with the current turn indicated.
2. **Given** the turn advances in Foundry, **When** the combatant changes, **Then** the glasses
   highlight the new current combatant.

---

### User Story 4 - Control the HUD with ring gestures (Priority: P2)

The player navigates and acts entirely through the ring's limited gesture set — moving between
panels (character / combat / map / log / spellbook), opening a menu, selecting an item — without
touching a phone, so both hands and full attention stay on the physical table.

**Why this priority**: Glanceable display alone is not enough; the player must also act. The
interaction model must work within the ring's constrained gestures and never require text entry
or looking at another screen.

**Independent Test**: Using only ring gestures, the player can move between HUD views, open a
menu, and make a selection; every supported gesture produces a predictable, deterministic result.

**Acceptance Scenarios**:

1. **Given** the HUD is active, **When** the player performs a navigation gesture, **Then** the
   HUD moves to the adjacent panel deterministically.
2. **Given** a menu is available, **When** the player performs the menu-open gesture, **Then** the
   menu appears; a second gesture selects or dismisses it predictably.
3. **Given** any supported gesture, **When** it is performed, **Then** exactly one well-defined
   action occurs (no ambiguous or duration-based input).

---

### User Story 5 - Choose what the map shows (Priority: P2)

The player (or table owner) chooses the source of the glasses map: the Game Master's live view,
a shared overview, or a specific player character's real view (their own vision, lighting, and
fog of war), so the map matches the perspective they want — selected from the phone app.

**Why this priority**: Different moments want different perspectives (DM overview vs. a player's
own fogged view). Choosing the source from the app makes the map useful beyond a single fixed view.

**Independent Test**: Selecting a different map source / character in the app changes the map
shown on the glasses to that perspective when that perspective is available.

**Acceptance Scenarios**:

1. **Given** the map-source selector, **When** the player picks the GM view, **Then** the glasses
   show the GM's live, correctly-lit view.
2. **Given** a player character has consented to sharing their view, **When** that character is
   selected, **Then** the glasses show that character's real view (vision + lighting + fog).
3. **Given** a character whose owner has not consented is selected, **When** chosen, **Then** the
   system does not show that private view and indicates the source is unavailable.

---

### User Story 6 - Each player sees their own character on their own glasses (Priority: P3)

At a multi-player table, each player pairs their own glasses and sees their own character and a
view appropriate to them, independently of the other players.

**Why this priority**: The real table is multi-player; one shared device is a demo, not the
product. This is a scale-out of the single-player experience, hence lower initial priority.

**Independent Test**: Two players each pair their glasses to the same session and each sees their
own character's data and chosen view, without cross-talk.

**Acceptance Scenarios**:

1. **Given** two paired devices on one session, **When** both are active, **Then** each device
   shows the data and view bound to its own paired identity.
2. **Given** one player changes their own selection, **When** they do so, **Then** the other
   player's glasses are unaffected.

---

### User Story 7 - Adjust display and language on the glasses (Priority: P3)

The player tunes the readability of the HUD (brightness, dithering, map frame rate) and the
language (Italian or English) to their environment, without changing the shared game world.

**Why this priority**: Readability and locale make the HUD usable for a real person in a real
room, but they are refinements on top of the core experience.

**Independent Test**: Changing a display setting or the on-glasses language changes the glasses
output accordingly and does not modify the shared Foundry world settings for others.

**Acceptance Scenarios**:

1. **Given** the settings, **When** the player changes brightness/dither/frame rate, **Then** the
   glasses output reflects it promptly and the change is local to that device.
2. **Given** the on-glasses language override, **When** the player switches IT/EN, **Then** the
   HUD labels switch, without altering the world's language for other users.

### Edge Cases

- **Tabletop software unavailable**: When Foundry or the connection is down, the glasses show a
  clear "not connected" state rather than stale data presented as live, and recover automatically
  when the connection returns.
- **Service restart**: When the connecting service restarts mid-session, the glasses reconnect and
  resume showing live data without a manual re-pair.
- **Scene with no map / dynamic lighting off**: The map view still produces a readable result or a
  clear "no map" state.
- **Variable content overflow**: Long names, three-digit HP, many simultaneous conditions, and the
  longer of IT/EN labels MUST NOT break the layout alignment.
- **Private view without consent**: A player's personal fogged view is never shown unless that
  player has opted in.
- **Constrained bandwidth**: When the link is too weak for image rendering, the map degrades to a
  simpler readable representation instead of stalling.
- **Capture source unavailable**: If the chosen view's source is offline, the system either falls
  back to an available source or clearly reports the chosen source as unavailable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display, on the glasses, the active player character's status —
  hit points (current/max/temp), armor class, level, conditions, exhaustion, death saves, and
  core ability scores/saves — sourced from the tabletop game state.
- **FR-002**: The system MUST update the displayed character status to reflect changes in the
  game (damage, healing, conditions) without requiring a gesture from the player, within a few
  seconds of the change.
- **FR-003**: The system MUST render the active scene's map onto the glasses as a glanceable
  greyscale image, and MUST update it as the scene/view changes.
- **FR-004**: The system MUST degrade the map to a simpler readable representation (rather than a
  blank or frozen screen) when the connection cannot sustain image rendering.
- **FR-005**: The system MUST display the current combat's initiative order and indicate the
  current combatant, updating as turns advance.
- **FR-006**: Users MUST be able to navigate between HUD panels (character, combat, map, log,
  spellbook) and operate menus using only the ring's supported gestures
  (press / double-press / swipe-up / swipe-down), with each gesture mapped to exactly one
  deterministic action and no text entry required.
- **FR-007**: The system MUST let the player choose the map source — the GM's live view, a shared
  overview, or a selected player character's real view — and apply the selection to the glasses.
- **FR-008**: The system MUST only expose a player character's personal view (vision, lighting,
  fog of war) when that character's owner has explicitly consented; absent consent, the system
  MUST report the source as unavailable and MUST NOT reveal the private view.
- **FR-009**: The system MUST support multiple players, each with their own paired device, such
  that each device shows data and views bound to its own paired identity, independently.
- **FR-010**: The system MUST authorize each paired device to a specific game identity and MUST
  only serve that device the data that identity is permitted to see.
- **FR-011**: Users MUST be able to pair a device by installing the glasses app and entering the
  connection details and access credential provided by the tabletop module — without any camera
  or QR-scan step (the glasses have no camera).
- **FR-012**: Users MUST be able to adjust display settings (brightness, dithering, map frame
  rate) and an on-glasses language override (Italian or English) that affect only their own
  device and never modify the shared game world's settings.
- **FR-013**: Every HUD layout MUST remain character-perfectly aligned across all states,
  contents (e.g., HP `7` vs `700`, long names, condition overflow), and both supported locales —
  variable content MUST be width-budgeted, never best-effort.
- **FR-014**: Every player-facing action in the core experience MUST be deterministic — the
  result of a given gesture in a given state is always the same; AI/voice MUST NOT be required
  for any core function.
- **FR-015**: When the connection to the tabletop game is lost, the system MUST present a clear
  disconnected state (not stale-as-live data) and MUST automatically recover and resume live
  updates when the connection returns, without manual re-pairing.
- **FR-016**: The system MUST present a combat/event log and a spellbook view on the glasses,
  navigable by gesture, reflecting the player's character and the current encounter.
- **FR-017**: The system MUST keep the player's attention on the physical scene — no core task
  may require looking at a phone or laptop screen to complete.

### Key Entities *(include if feature involves data)*

- **Player Character**: The actor a player controls — identity, hit points, armor class, level,
  abilities/saves, conditions, inventory, spells. Sourced from the tabletop game; the unit a
  glasses device is bound to view.
- **Scene / Map**: The current encounter's visual field — background map, token positions,
  lighting, and fog of war. The source of the glasses map image and its per-perspective variants.
- **Combat Encounter**: The ordered set of combatants for the active fight — initiative order and
  the current turn.
- **Paired Device**: A pair of glasses bound to the session through an access credential and a
  game identity, with per-device display and locale preferences.
- **Map View Source**: The chosen perspective for the glasses map — GM live, shared overview, or a
  specific (consenting) player character's real view.
- **Streaming Consent**: A per-player opt-in that authorizes showing that player's personal view
  to a glasses device.
- **Display Settings**: Per-device, local-only preferences (brightness, dithering, frame rate,
  language override) that never alter the shared world.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can complete a full combat turn — check their HP, see whose turn it is, and
  take an action via gestures — without ever looking at a phone or laptop.
- **SC-002**: A change made in the tabletop game (HP, condition, turn) is reflected on the glasses
  within 3 seconds in at least 95% of cases under a normal connection.
- **SC-003**: The glasses map sustains at least 5 frames per second of updates during active play
  on a supported connection (with a stretch goal of 15).
- **SC-004**: Every HUD layout passes a character-perfect alignment check across all tested
  states, content extremes, and both locales (zero misalignment).
- **SC-005**: 100% of core player tasks (view character, follow combat, read the map, navigate,
  act) are completable using only the ring's supported gestures.
- **SC-006**: A player character's personal view is never shown without that player's consent
  (zero unauthorized disclosures across tests).
- **SC-007**: A new player can pair their glasses and reach a live HUD in under 5 minutes using the
  install-and-paste flow, with no camera/QR step.
- **SC-008**: After a mid-session connection drop, the glasses return to live data automatically
  within 30 seconds of the connection returning, with no manual re-pairing.
- **SC-009**: At a multi-player table, each player's glasses show only their own bound data with
  zero cross-talk between devices.

## Assumptions

- The tabletop game is FoundryVTT running the D&D 5e system (dual ruleset 2014/2024); the glasses
  HUD reflects that game's state and does not replace it.
- The glasses are Even Realities G2: a greyscale, fixed-font, thin-client display with no camera
  and no speaker; application logic runs on the paired phone, not on the glasses firmware. These
  are hard product constraints, not choices.
- The ring's input is limited to press / double-press / swipe-up / swipe-down; there is no text
  entry and no duration-based (long-press) input.
- A connecting service between the phone app and the tabletop game is part of the product's
  deployment (single-tenant homelab for the MVP); "no screen" refers to the player's attention,
  not to the absence of supporting infrastructure.
- Pairing is performed by installing the glasses app and pasting connection details + an access
  credential generated by the tabletop module; there is no camera/QR pairing path.
- Voice/AI assistance is explicitly out of scope for this MVP and is a later, optional capability;
  no core function may depend on it.
- Supported locales for the MVP are Italian (primary) and English (fallback).
- The physical tabletop, paper maps, miniatures, and a human Game Master remain the center of the
  experience; the HUD augments, never replaces, them.
