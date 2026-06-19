---
"@evf/g2-app": minor
"@evf/shared-protocol": patch
---

Feature 001 — Foundry-to-G2 HUD UX slice:

- **Direct-link connection** — one canonical connection profile to the bridge; removed the
  implicit `localhost:8910` default (the on-phone "unreachable bridge" bug). `bridgeUrl` is
  persisted; the bearer token stays in memory and is re-acquired by the wizard (T-02-01 upheld).
- **Unified view selection** — the map-view mode dropdown is removed; the roster selector gains a
  synthetic "Party" entry (→ streaming overview), a PC → actor (owner-elected). Pure
  `toPlayerViewRequest` mapping; `client_player_view` wire shape unchanged (shared-protocol doc only).
- **D&D-styled sheet + shared icon dictionary** — new `icon-dictionary` as the single source for
  glyph + canvas paths (consolidates item-type / proficiency / spell-slot / vitals glyphs,
  byte-identical → INV-1 fixtures unchanged); double-ruled canvas frame + corner brackets; Main-tab
  vitals drawn as icons.
- **Composited FPS badge** — FPS split into its own small corner widget via `EVF_FPS_CORNER`
  (build-time `VITE_EVF_FPS_CORNER`, default bottom-right); yields below the status card on overlap.
