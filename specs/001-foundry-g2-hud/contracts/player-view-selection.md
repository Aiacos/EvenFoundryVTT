# Contract — Map-view selection (unified roster, "Party" entry)

**Feature**: 001-foundry-g2-hud

## UI contract (g2-app settings)

- The settings panel exposes ONE selector — **"Personaggio / Ruolo"** — populated with:
  - a synthetic top entry **"Party"** (always present), then
  - each player character from the roster (`actorId`, `name`, optionally `userName`).
- The separate map-view **mode** dropdown (off / streaming / actor) is REMOVED.
- Changing the selection emits a player-view request and (for a real PC) the live actor re-pin.

## Pure mapping (unit-tested)

```text
toPlayerViewRequest(selection):
  selection == "party"  → { mode: "streaming" }
  selection == <actorId> → { mode: "actor", actorId: <actorId> }
```

## Wire contract (unchanged message type)

Emitted as the existing `client_player_view` WS message (shared-protocol
`ClientPlayerViewMessageSchema`):

```jsonc
{ "type": "client_player_view", "mode": "streaming" }                 // Party
{ "type": "client_player_view", "mode": "actor", "actorId": "<id>" }  // a PC
```

- No new message type or field is introduced; `foundryUrl?` remains optional.
- Bridge behavior is unchanged: `streaming` → streaming/overview source; `actor` → owner-elected,
  consent-gated capture of that PC (a non-consenting PC ⇒ `player_view_status: unavailable`).

## Acceptance

- Selecting "Party" results in the overview/streaming source on the glasses.
- Selecting a consenting PC results in that PC's view; a non-consenting PC yields a clear
  "unavailable" status, never the private view.
- Switching the selected PC re-drives the source within a few seconds (no reconnect).
