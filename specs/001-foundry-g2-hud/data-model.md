# Data Model — Foundry-to-G2 HUD slice (connection, view selection, sheet UI, FPS)

**Feature**: 001-foundry-g2-hud · **Date**: 2026-06-18

This slice mostly reshapes existing state rather than introducing new persistent data. Entities below
are the in-app/in-protocol structures that the work touches.

## ConnectionProfile (g2-app — the "direct link")

The single source of truth for how the plugin reaches the bridge.

| Field | Type | Rules |
|-------|------|-------|
| `bridgeUrl` | string (https origin) | REQUIRED; full origin of the bridge that fronts Foundry/Forge (e.g. `https://evf-bridge.example`). Derived to `wss://…/ws` for the socket. |
| `token` | string | REQUIRED unless the bridge runs in explicit dev-no-auth; the 24h access credential pasted at pairing. |

- **Persistence**: Even Hub kv store (per device). No localStorage.
- **Precedence (replaces 4-source ambiguity)**: saved profile → (dev-only) explicit dev override,
  clearly gated. No silent `localhost` default in user builds.
- **State**: `unconfigured → configured → connecting → live → disconnected(auto-reconnect) → live`.

## MapViewSelection (g2-app settings → protocol)

The unified roster selection that replaces the separate mode dropdown.

| Field | Type | Rules |
|-------|------|-------|
| `selection` | `"party"` \| `actorId` | The roster entry chosen in the plugin options. `"party"` is a synthetic top entry. |
| derived `mode` | `"streaming"` \| `"actor"` | `"party"` → `streaming` (streaming/overview user); a real `actorId` → `actor` (that PC's owner-elected, consent-gated view). |
| derived `actorId` | string? | present only when a real PC is selected. |

- **Mapping rule** (pure, unit-tested): `toPlayerViewRequest(selection)` →
  `{ mode: selection === "party" ? "streaming" : "actor", actorId?: selection !== "party" ? selection : undefined }`.
- **Wire**: emitted as the existing `client_player_view { mode, actorId? }` (no new message type).
- **Removed**: the `off`/`streaming`/`actor` user-facing dropdown; "off/GM live" is reached via
  `"party"` falling back to the default election when no capture source is configured.

## RosterEntry (extended)

The character-list entry shown in the selector.

| Field | Type | Rules |
|-------|------|-------|
| `actorId` | string | existing |
| `name` | string | existing |
| `level` | number | existing |
| `userName` | string? | existing — owning user, present only for opted-in players |
| `isParty` (synthetic) | boolean | client-side only; the injected top "Party" entry, not a real actor |

## CharacterSheetTab (UI model — D&D restyle)

Render model for each composited sheet tab (canvas path).

| Field | Type | Rules |
|-------|------|-------|
| `tab` | `main \| skills \| inventory \| spells \| feats \| bio` | existing tab set |
| `bounds` | `{ x, y, w, h }` | INV-1: fixed, width-budgeted; identical geometry across states/locales |
| `chrome` | static bitmap | D&D-sheet frame, pre-baked once per tab |
| `icons` | `IconId[]` | drawn from the shared icon dictionary |

## Icon (new shared dictionary)

| Field | Type | Rules |
|-------|------|-------|
| `id` | `IconId` enum | e.g. `weapon, armor, consumable, proficient, unproficient, spell-slot, …` |
| `unicode` | string | glyph-path fallback (existing Unicode symbols, de-duplicated here) |
| `draw(ctx, bounds, fill)` | fn | canvas-path vector/text rendering at a fixed cell size |

- **Invariant**: one source for both render paths so glyph and canvas stay consistent (Constitution I).

## FpsBadge (status HUD z=1)

| Field | Type | Rules |
|-------|------|-------|
| `value` | number 0–99 | from `getFps()` (1 Hz) |
| `corner` | `top-left \| top-right \| bottom-left \| bottom-right` | from `EVF_FPS_CORNER`; default `bottom-right` |
| `fontPx` | number | smaller than the status-card font |
| geometry | derived | corner → `{ x, y }` computed from compositor 576×288 minus badge size + margin |

- **Pure geometry** `fpsBadgeRect(corner, size)` is unit-tested for all four corners (no overlap off-screen).
- Composited into the existing z=1 layer; not a new bridge call.

## DisplaySettings (existing, extended)

Per-device, local-only (Constitution III). Adds the FPS corner when surfaced as a runtime override
(else the build-time `VITE_EVF_FPS_CORNER` applies). Brightness/dither/captureFps/webp/normalize +
locale override unchanged; none modify the shared world.

## State transitions (view selection)

```text
[Party selected]      → client_player_view{streaming}            → glasses show overview/party source
[PC X selected]       → client_player_view{actor, actorId:X}     → owner-elected capture of X (consent-gated)
[PC X, no consent]    → bridge → unavailable                     → glasses show "source unavailable"
[selection unchanged] → no re-send                               → steady stream
```
