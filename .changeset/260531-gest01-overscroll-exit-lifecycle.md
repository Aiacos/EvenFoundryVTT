---
"@evf/g2-app": minor
"@evf/shared-protocol": minor
"@evf/bridge": patch
"@evf/shared-render": patch
---

Retire the `long-press` R1 gesture (ADR-0012; GEST-01 / EXIT-01 / LIFE-01).

Canonical Even Realities docs (`guides/input-events`, INV-2 re-verified 2026-05-31)
confirm the complete hardware gesture set is **press / double-press / swipe-up /
swipe-down only** — there is no long-press / duration-based input.

- **GEST-01** — `long-press` removed from the wire enum (`R1GesturePayloadSchema`), the
  bridge gesture surface, the internal `R1Gesture` union, all 12 panels, the status-HUD
  hint chip (token `long=` → `qa=`, field `longPressLabel` → `quickActionLabel`), i18n
  keys, and tests. The Quick-Action menu now opens via **over-scroll** (swipe-up at the
  focused layer's top boundary) — new `Layer.isAtTopBoundary()` + the renamed
  `quick-action-overscroll-dispatcher`. Per-panel context actions remapped:
  `inventory`/`spellbook` Action Options → `tap`; `template-placement` cancel → `double-tap`.
- **EXIT-01 / LIFE-03** — new `root-exit-dispatcher`: a `double-tap` on the bare map root
  calls `bridge.shutDownPageContainer(1)` (Mode 1 graceful exit dialog), satisfying the
  Even Hub app-submission requirement.
- **LIFE-01** — INV-2 verification of the SDK lifecycle surface (`OsEventTypeList` 4/5/6 +
  `shutDownPageContainer`) documented in ADR-0012.

`Specs.md` §3.2/§7.13a/§7.14.x + ASCII mockups (INV-1), `README.md`, and the showcase were
updated atomically (INV-3).
