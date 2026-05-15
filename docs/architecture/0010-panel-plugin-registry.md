---
status: accepted
date: 2026-05-15
deciders: planner
consulted: planner-checker
informed: executor
---

# ADR-0010: Panel Plugin Registry — discovery, metadata contract, capability gating

## Status

**ACCEPTED** — 2026-05-15. Binds Phase 5 (Panel Plugin System + Read-Only Panels)
and all downstream phases that ship overlay panels (Phase 6 Quick Actions, Phase 7
Write Path, Phase 8 Manual Action UX).

### Confirmation

Plan 05-01 (Wave 0) produces the following test artifacts that prove the contract:

- `packages/g2-app/src/engine/__tests__/panel-router.test.ts` — PRT-DISC-01..04
  (discovery + exclusion), PRT-OPEN-01..04 (mount + cap gate + single-active),
  PRT-CLOSE-01..02 (destroy + no-op), PRT-IS-OPEN (state predicate).
- `packages/g2-app/src/locale/__tests__/locale-menu.test.ts` — LM-1..5 (7-entry
  constant, code uniqueness, budget tiers, `as const satisfies` brand).

Consumer plans 05-02..05-06 are READ-ONLY consumers of this contract — they call
`PanelRouter.openPanel(id, deps)` without touching `LayerManager.bundle` directly.

## Context

Phase 4b delivered the `OverlayPanel` interface, `PanelGestureBus`, and
`LayerManager.bundle()` with differential demolish (ADR-0009 Amendment 1). What
Phase 4b did NOT ship is a standardised mechanism for:

1. **Auto-discovering** panels at boot time without a hand-written registry.
2. **Validating** panel metadata at module-load time so a malformed panel cannot
   crash the app.
3. **Gating** panel mounts on negotiated server capabilities (Phase 4a handshake).
4. **Enforcing** the single-active-panel invariant without panels calling
   `LayerManager.bundle()` directly.

Phase 5 ships six read-only panels (CharacterSheet, CombatTracker, Log, Inventory,
Spellbook) and a locale override menu. Without a centralised router, each panel
would have to know about the LayerManager — violating the encapsulation principle
that ADR-0001 / ADR-0009 established (one flush per bundle, one authority for z=2).

Additionally, the locale override system requires a typed, ordered list of supported
locales with budget-tier annotations (I18N-05 canonical vs best-effort) — the
`LOCALE_MENU` constant serves this role for the Phase 6 Quick Action `[N] Language`
menu while Phase 5 ships the data model.

## Decision Drivers

- **Zero-boilerplate panel registration** — panels self-declare `static meta: PanelMeta`
  co-located with their implementation; no parallel registry file that can drift.
- **Type-safe metadata** — `PanelMetaSchema` (Zod) validates at discovery time;
  invalid panels are silently excluded with `console.warn`, never crashing boot.
- **Capability gate at mount entry** — `PanelRouter.openPanel()` checks
  `meta.requiredCaps` against the negotiated capability set (from
  `capability-handshake.ts`) BEFORE constructing the panel. Phase 5 panels all
  declare empty `requiredCaps`; future write-path panels (Phase 7+) will declare
  `'midi-qol'`, `'socketlib'`, etc.
- **LayerManager surface stays minimal** — panels never call `bundle()` directly
  (CONTEXT.md §Area 1 anti-pattern rule). The router owns ALL z=2 bundle ops.
- **INV-1 width-budget sacred** — `LOCALE_MENU.budget` tier annotation drives
  per-key EN fallback in `getLabel()` for best-effort locales (I18N-05).

## Considered Options

### Option A: Runtime filesystem scan (REJECTED)

- Scan `panels/` directory at boot using Node.js `fs.readdir`.
- **Why not:** The plugin runs in the Even Realities App WebView (iOS WKWebView).
  There is NO Node.js `fs` module in the browser. Verbatim from Specs.md §3.7:
  *"Plugins run on the paired phone WebView, not on G2 firmware."*
- **INV-2 source:** `hub.evenrealities.com/docs/getting-started/overview` (verified
  2026-05-15, no runtime filesystem access in WebView context).

### Option B: Parallel-file registry (REJECTED)

- Maintain a hand-written `panels/index.ts` that explicitly imports and registers
  each panel class.
- **Why not:** Two-file drift risk — adding a new panel requires editing both
  `<panel>-panel.ts` (the implementation) AND `panels/index.ts` (the registry).
  Past experience in every large codebase shows this pattern accumulates stale
  entries over time. INV-4 §0.1 zero dead code rule makes this unacceptable.

### Option C: `import.meta.glob` (CHOSEN)

- Use Vite's `import.meta.glob('../panels/**/*-panel.ts', { eager: false })` for
  lazy import promises. Bundle-time static analysis means Vite resolves the glob
  at build time — no runtime filesystem scan, no parallel registry file.
- **Why yes:** Tree-shakes unused panels. Lazy loading (`{ eager: false }`) means
  each panel is only instantiated when `openPanel(id)` is called — no upfront
  cost for panels the user never opens in this session.
- **INV-2 source:** `vite.dev/guide/features#glob-import` — Vite 8 documentation
  (verified 2026-05-15). Glob import with `eager: false` returns a map of lazy
  loader functions; `eager: true` returns the modules synchronously (not suitable
  here due to the lazy-mount lifecycle).

## Decision Outcome

**Chosen: Option C — `import.meta.glob` with `PanelRouter` orchestration.**

### Implementation

- `PanelRouter` class in `packages/g2-app/src/engine/panel-router.ts`.
- `PanelMetaSchema` (Zod) + `PanelMeta` type + `PanelConstructor` type + `PanelDeps`
  interface all exported from the same module.
- `LOCALE_MENU` constant + `LocaleMenuEntry` type in
  `packages/g2-app/src/locale/locale-menu.ts`.
- Per-key EN fallback for best-effort locales (ES/FR/PT-BR) in `getLabel()` in
  `packages/g2-app/src/status-hud/i18n-budgets.ts`.
- ADR-0009 Amendment 1 composition rules (differential demolish / z=1.5 toast
  carve-out / in-process gesture bus) are UNCHANGED — this ADR adds the router
  layer on top; it does not modify how `LayerManager.bundle()` operates internally.

### Composition rules unchanged from ADR-0009 Amendment 1

- **Rule 1 — Differential demolish:** `bundle(mount z=2)` auto-destroys z=0.5 idle
  infill; `bundle(destroy z=2)` auto-reinstates it. Router calls `bundle()`;
  `LayerManager` handles the differential logic.
- **Rule 2 — z=1.5 toast carve-out:** differential demolish does NOT affect the
  toast queue at z=1.5. Router is aware — `PanelDeps.toastQueue` is injected so
  the router can enqueue cap-denied notifications without remounting the toast layer.
- **Rule 3 — In-process gesture bus:** panels subscribe in `onMount` via
  `PanelDeps.gestureBus.subscribe(fn)` and unsubscribe in `onUnmount`. Router passes
  the bus to the panel constructor; the panel manages its own subscription lifetime.

## Pros and Cons

### Pros

- **Pluggable panels** — new panels are auto-discovered by adding a `*-panel.ts`
  file to `packages/g2-app/src/panels/`. No registry file to update.
- **INV-1 width-budget sacred** — `LOCALE_MENU.budget` tier drives per-key EN
  fallback in `getLabel()`. Canonical locales (IT/EN/DE) never fall back; best-effort
  locales (ES/FR/PT-BR) fall back to EN per-key when budget exceeded. INV-1
  cannot be violated by a best-effort locale rendering.
- **Boot safety** — a single malformed panel never crashes the app. Surviving panels
  remain available. Only a catastrophic zero-panel state triggers a boot-error.
- **Capability gate centralised** — one check point, not scattered across each panel.

### Cons

- **Build-time only** — panels must compile at build time. No runtime hot-load of
  third-party panels. This is ACCEPTED for MVP (single-binary homelab deploy per
  Specs.md §11.5.3). Third-party panel support is a Phase 13+ consideration.
- **Vite coupling** — `import.meta.glob` is a Vite-specific API, not a browser
  standard. The router is untestable without a mock (see `TestablePanelRouter` in
  the test file). This is acceptable because Vite is pinned at 8.x (CLAUDE.md
  technology stack lock) and test isolation via subclass is idiomatic for this case.

## More Information

- `@see ADR-0001 Amendment 1` — z=0.5 differential demolish rationale
- `@see ADR-0009 Amendment 1` — composition rules this ADR builds on top of
- `@see CONTEXT.md §Area 1 + §Area 4 + §Area 7` — locked decisions this ADR formalises
- `@see RESEARCH.md §Pattern 1 + §Pattern 5` — implementation pattern notes
- `@see vite.dev/guide/features#glob-import` — INV-2 canonical source for `import.meta.glob`
- `@see hub.evenrealities.com/docs/getting-started/overview` — INV-2 WebView constraint evidence
- `@see @evenrealities/even_hub_sdk@0.0.10` — Even Hub SDK API consumed by panels

## Confirmation

Plans that become READ-ONLY consumers of this contract after Plan 05-01 lands:

| Plan | Title |
|------|-------|
| 05-02 | CharacterSheetPanel — 6-tab strip + tab cycle + last-viewed persistence |
| 05-03 | CharacterSheetPanel — dual-edition rendering (modernRules branching) |
| 05-04 | InventoryPanel + SpellbookPanel |
| 05-05 | CombatTrackerPanel + LogPanel |
| 05-06 | Locale override + boot read-back + INV-1 stress fixtures |

## Amendment 1

_Reserved — not yet authored._
