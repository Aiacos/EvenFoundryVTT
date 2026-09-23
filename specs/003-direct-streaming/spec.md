# Feature Specification: Direct Foundry → G2 Streaming (port onto `develop`, v0.12.0)

**Feature Branch**: `feature/direct-streaming-port`

**Created**: 2026-09-23

**Status**: In progress (merged onto `develop` history; code ports and hardware GO/NO-GO pending)

**Input**: Maintainer request: "port the direct-streaming branch (no bridge, player-owned glasses, D&D-sheet HUD) onto `origin/develop`, keeping the remote history and every real-hardware fix found there."

> This feature supersedes the bridge-era delivery of [`001-foundry-g2-hud`](../001-foundry-g2-hud/spec.md)
> (connection model, view selection, canvas sheet) and [`002-hybrid-native-raster-render`](../002-hybrid-native-raster-render/spec.md)
> (render substrate). The product intent of 001 (glanceable character status, combat, ring
> control, one character per player) is unchanged. Decisions:
> [ADR-0016](../../docs/architecture/0016-direct-foundry-streaming.md) ·
> [ADR-0017](../../docs/architecture/0017-player-owned-glasses-hybrid-projector.md) ·
> [ADR-0018](../../docs/architecture/0018-dnd-sheet-hud-pixel-renderer.md); gestures stay
> [ADR-0012](../../docs/architecture/0012-r1-gesture-model-overscroll-exit-lifecycle.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One thing to install (Priority: P1)

A GM installs a single Foundry module from the manifest URL. There is no bridge container, no
Docker Compose, no second HTTPS origin and no token to paste: the module itself serves the
glasses app.

**Why this priority**: the bridge-era install (module + Docker bridge + static plugin host +
per-host `.ehpk`) was the main adoption blocker and the main source of field failures.

**Independent Test**: on a Foundry world reachable over valid HTTPS, install the module from
`releases/latest/download/module.json`, enable it, and open `/modules/evenfoundryvtt/g2/` in a
browser: the glasses app loads same-origin.

**Acceptance Scenarios**:

1. **Given** a fresh world, **When** the module is enabled, **Then** no other service is needed for the glasses to connect.
2. **Given** a world upgraded from the bridge era, **When** the GM removes the bridge container and re-pairs, **Then** every device works without the old bearer tokens.

### User Story 2 - Each player pairs their own glasses (Priority: P1)

The GM enables players once; each player shows a QR from their own Foundry (or the GM does it
on their behalf from the Players list), scans it with the Even Realities App, and the glasses
open already bound to that player's character.

**Why this priority**: multiple players wear glasses at a physical table; pairing must not need
the GM for every device.

**Independent Test**: enable glasses for a player, pair from the player's client, disconnect
the player's client and verify an online GM holding the device key takes over as projector.

**Acceptance Scenarios**:

1. **Given** an enabled player, **When** they press *Pair my glasses*, **Then** a single-use QR appears (valid 5 min) and the key rotates on first connect.
2. **Given** a paired device, **When** its owner revokes it or loses actor ownership, **Then** reads and invokes are refused (live ownership check) and the refusal is audited.

### User Story 3 - The HUD reads like the character sheet (Priority: P1)

The glasses show portrait, header (AC shield, HP box, initiative/speed/proficiency, action
economy, conditions, YOUR TURN), a square map made from the scene's original art, a sheet
page (abilities · saves & skills · death saves) and one interactive context panel.

**Independent Test**: the 12 screens S1–S12 render pixel-identical to the golden fixtures in
IT and EN with min/max content; the Even Hub simulator screenshots match.

**Acceptance Scenarios**:

1. **Given** the real G2 host, **When** the sheet page is built, **Then** every image container sits on the 2×2 grid of 288×144 tiles anchored at (0,0) and the host accepts the page.
2. **Given** any state, **When** the player taps at the base view, **Then** the actions menu opens; double-tap goes back and exits at the root.

### User Story 4 - Actions resolve in Foundry without hanging (Priority: P2)

Attacks, spells, item uses and GM-requested checks run through the single write path in the
Foundry module and return a result to the glasses within seconds.

**Independent Test**: cast a spell and use an item from the glasses; the chat card and rolls
appear in Foundry and no call waits on a hidden dialog.

### Edge Cases

- Player client offline mid-session → projector hands over to an online GM holding the device key; with no projector the glasses show the offline screen.
- Foundry served with a self-signed LAN certificate → the phone WebView refuses it; setup guide requires a valid certificate.
- Portal trial upload of an `.ehpk` expires → testing uses QR sideload / `evenhub qr`, not trial uploads.
- Non-grid image offsets accepted by the simulator but rejected by the real host → layout is constrained to the proven grid and verified on hardware.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Foundry module MUST serve the glasses app (`packages/g2-app` built into `packages/foundry-module/g2/`) and the phone MUST reach Foundry same-origin over HTTPS.
- **FR-002**: Every glasses ⇄ Foundry message MUST be AES-256-GCM sealed with a per-device key on the `module.evenfoundryvtt` relay.
- **FR-003**: Pairing MUST be self-service per player (ECDH P-256 sealed credentials) with a GM-on-behalf path and per-device revocation.
- **FR-004**: Exactly one elected projector per device MUST execute invokes, through `dispatchTool` (ADR-0011).
- **FR-005**: Reads and invokes MUST be limited to actors the paired player owns, checked live.
- **FR-006**: The HUD MUST use the D&D-sheet layout on the pixel renderer (ADR-0018) with the hardware-proven 2×2 288×144 image-tile geometry, images declared before text, and no text under an image.
- **FR-007**: The map MUST be built on the phone from scene document data and original art, sent ≤ 1 fps and only when its hash changes.
- **FR-008**: The port MUST keep every real-Foundry fix from the bridge-era line (see plan).
- **FR-009**: `packages/bridge`, `packages/foundry-mcp`, `deploy/` and their docs MUST be removed with no dead references left.

### Key Entities

- **Device**: one pair of glasses — device id, AES key, owning player, bound actor, "(G2)" Foundry user.
- **Projector**: the Foundry client elected to serve a device (player's client, else a GM with the key).
- **Zone**: one of A portrait · B header · C map · D sheet · E context, with fixed rectangles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user reaches a working HUD with one module install and one QR scan.
- **SC-002**: `pnpm install --frozen-lockfile && pnpm lint:ci && pnpm typecheck && pnpm test:coverage && pnpm changeset:status` exits 0 on the port branch.
- **SC-003**: `validate:direct-sideload` and the sheet-layout tile check reach GO on real G2 + R1 (defer-hardware pattern until hardware is available).
- **SC-004**: `Specs.md`, `README.md`, the showcase and the wiki agree on v0.12.0 (INV-3); `node scripts/check-wiki-links.mjs docs/wiki` passes.

## Assumptions

- Foundry ≥ v13.347 (v14 verified), dnd5e ≥ 5.3.3, Even Hub SDK 0.0.15, Even Realities App ≥ 2.2.9 for long-press shortcuts.
- Voice/MCP is out of scope; it returns only with a new ADR as a client of the direct channel.
