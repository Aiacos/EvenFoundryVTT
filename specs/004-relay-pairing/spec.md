# Feature Specification: Relay pairing — the player connects their glasses alone, with one QR

**Feature Branch**: `004-relay-pairing`

**Created**: 2026-09-25

**Status**: Implemented (2026-09-25) — ADR-0019 accepted; hardware UAT pending (tasks Phase 7)

**Input**: User description: "rifai una ricerca da zero per far fare il login all'utente sugli
occhiali e streammare la mappa ed interagire senza dover passare per il GM e senza perdere il
login sul browser … semplice e veloce (una soluzione con il QR va bene) … modo facile e veloce
anche per avere funzionante la versione di development e la release sull'hub"

Research: [research.md](./research.md) · Decision: [ADR-0019](../../docs/architecture/0019-relay-pairing-player-projector.md)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Pair my glasses alone in under 30 seconds (Priority: P1)

A player, logged into Foundry in their own browser, opens **«Collega occhiali G2»** (right-click
own name or Alt+G), scans the QR with the glasses app and sees their character sheet on the G2. No GM action, no
Foundry password on the phone, the browser stays logged in.

**Why this priority**: it is the whole request; today it needs a GM enablement, a second
Foundry user and a page Foundry v14 no longer renders (research F1/F2).

**Independent Test**: fresh world on Foundry v14.368, one Player user owning one actor, no GM
connected: QR → HUD S1 visible; the player's browser session unchanged (still connected,
no re-login).

**Acceptance Scenarios**:

1. **Given** a Player logged in with an owned actor and no GM online, **When** they open the
   pairing window and scan the QR, **Then** the glasses show S1 for that actor within 10 s of
   the scan.
2. **Given** a paired device, **When** the player reloads Foundry or the phone app restarts,
   **Then** the HUD reconnects without a new scan.
3. **Given** a paired device, **When** the player clicks «Scollega», **Then** the glasses
   show the unpaired screen and the old QR/code no longer works.
4. **Given** the player owns several actors, **When** pairing, **Then** they pick the actor
   in the window before the QR appears.

---

### User Story 2 — Map and actions stream through the player's own Foundry (Priority: P1)

While paired, the glasses show the pixelated scene map around the player's token and the
player can use actions (attack, spell, item, skill check) with R1 gestures; chat cards are
attributed to the player.

**Why this priority**: "stream the map and interact" is part of the request; without it
pairing is useless.

**Independent Test**: move the token in Foundry → the map tile updates on the glasses within
2 s; choose an attack → the chat card appears as the player.

**Acceptance Scenarios**:

1. **Given** a paired device, **When** the token moves, **Then** a map snapshot (no picture
   re-sent) goes out at most once per second (P4).
2. **Given** a paired device, **When** the player uses an action from the glasses, **Then**
   it runs through `dispatchTool` in the player's client (ADR-0011) exactly once.
3. **Given** the player's Foundry tab is closed, **When** the glasses are on, **Then** they
   show «Foundry del giocatore chiuso» (data frozen, never presented as live) and reconnect
   by themselves when the tab reopens.

---

### User Story 3 — Install once from Even Hub, survive phone lock (Priority: P2)

The player installs **FoundryVTT G2 HUD** from Even Hub (beta group first, store later),
opens it, taps **Scansiona QR** (or types the 16-char code) and plays; locking the phone for
5 minutes does not lose the session.

**Why this priority**: a QR-sideloaded page dies when the phone locks (research F4); real play
needs the installed app.

**Independent Test**: Beta build on iOS and Android: scan → play → lock 5 min → unlock →
HUD still live.

**Acceptance Scenarios**:

1. **Given** the store app, **When** the player scans the Foundry QR with the in-app camera,
   **Then** pairing completes like story 1.
2. **Given** the store app and no camera permission, **When** the player types the code,
   **Then** pairing completes.
3. **Given** a paired store app, **When** the app is killed and reopened, **Then** it
   reconnects without re-pairing.

---

### User Story 4 — One-command development loop (Priority: P2)

A developer runs one command and gets the relay, the app with hot reload and a QR; a local
Foundry (even plain HTTP on the LAN) pairs to that dev app.

**Independent Test**: `pnpm dev:glasses` on a clean clone → QR scanned → demo HUD and, with a
local Foundry, a live pairing.

---

### User Story 5 — GM pairs for a player without a device (Priority: P3)

A GM opens the same window for any actor and shows the QR; the GM's tab is that device's
projector.

### Edge Cases

- Player has Foundry open in two tabs → exactly one tab projects (the others stand by).
- Phone offline / relay unreachable → glasses show the cause; the pairing window shows
  «Relay ✗» with the URL tried.
- QR photographed by someone else → it stops working after the first successful connection
  (room + key rotate on `welcome`).
- Actor ownership removed by the GM → projector stops serving that actor and tells the
  glasses (revoked).
- Relay quota exhausted → connection refused → the glasses show «servizio non disponibile»;
  self-host relay URL documented.
- Foundry v13 and v14, self-hosted and The Forge (private game, User Manager on or off).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** The phone MUST NOT send any Foundry credential or open any connection to the
  Foundry origin.
- **FR-002** Pairing MUST need no GM action and no user creation (players can't create
  users: foundryvtt.com/article/users).
- **FR-003** The QR MUST encode `https://<app-origin>/…#evf=<payload v2>` with a 128-bit
  room id and a 256-bit key; the fragment never reaches any server.
- **FR-004** A 16-character code MUST be offered as fallback; room and key derive from it
  by HKDF.
- **FR-005** On first `welcome` room and key MUST rotate (single-use QR/code).
- **FR-006** Every relay frame MUST be a sealed envelope (AES-256-GCM, AAD `from>to`, 120 s
  anti-replay); the relay forwards opaque frames only.
- **FR-007** Pairings MUST persist on both sides (projector: client-scoped storage; phone:
  `localStorage` + `bridge.setLocalStorage`) and be revocable from the pairing window.
- **FR-008** Exactly one projector per device at a time (per-browser Web Locks; relay keeps
  one socket per role).
- **FR-009** The projector MUST send each scene picture once (downsized `asset` message) and
  map snapshots at most 1/s; the phone keeps rendering the map (ADR-0018).
- **FR-010** Actions MUST run only in the projector through `dispatchTool` (ADR-0011).
- **FR-011** The same app bundle MUST run as Even Hub `.ehpk`, as a GitHub Pages page and as
  the Vite dev server; the relay URL is a build-time constant with a QR-payload override for
  dev/self-host (sideload only; the store build accepts only its whitelisted origin).
- **FR-012** The store app MUST offer camera QR scanning and code entry on the phone page.
- **FR-013** The pairing window MUST show relay reachability (gate G1) before showing a QR.

### Key Entities

- **Pairing** — `{deviceId, room, key, actorId, label, createdAt}`; projector copy in client
  storage, phone copy in app storage.
- **Relay room** — ephemeral pair of sockets tagged `projector` / `glasses`; no stored data.
- **Pairing payload v2** — `{v:2, r, k, l?, relay?}` (fragment).

## Success Criteria *(mandatory)*

- **SC-001** Median time from opening the pairing window to S1 on the glasses ≤ 30 s
  (one scan, zero typing).
- **SC-002** Zero GM actions required for a player with Foundry open.
- **SC-003** The player's browser session is never disconnected by pairing or play.
- **SC-004** Works on Foundry v13.347+ and v14.368, self-hosted and The Forge private games.
- **SC-005** Store/beta build passes the Even Hub 5-minute lock test.
- **SC-006** Dev loop: clean clone → QR on screen with one command, ≤ 2 min.
- **SC-007** Relay cost stays within the Cloudflare free plan for ≥ 20 concurrent-day
  sessions (measured, gate G3).
