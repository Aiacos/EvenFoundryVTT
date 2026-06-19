# Contract — Composited FPS badge corner (`EVF_FPS_CORNER`)

**Feature**: 001-foundry-g2-hud

## Env var contract

- **Name**: `EVF_FPS_CORNER` (g2-app build-time: `VITE_EVF_FPS_CORNER`).
- **Domain**: `top-left | top-right | bottom-left | bottom-right`.
- **Default**: `bottom-right`.
- **Invalid/absent** → default (`bottom-right`), never a crash.
- Documented in `deploy/.env.example` and the g2-app config docs.

## Render contract

- The FPS readout is a small composited badge (smaller font than the status card), drawn into the
  existing z=1 status layer (no new bridge call).
- Position is computed from the corner against the 576×288 compositor with a fixed margin; the badge
  MUST stay fully on-screen and MUST NOT overlap the status card when they share a corner (status card
  yields, or they stack deterministically).
- `fpsBadgeRect(corner, size)` is a pure function, unit-tested for all four corners.

## Acceptance

- With no env var set, the FPS badge appears bottom-right with the smaller font.
- Setting `EVF_FPS_CORNER=top-left` (rebuild) places it top-left; all four corners verified by an
  INV-1 snapshot test.
- The badge is part of the composited raster (toggled by the existing `[F] FPS` quick action), not a
  separate display element.
