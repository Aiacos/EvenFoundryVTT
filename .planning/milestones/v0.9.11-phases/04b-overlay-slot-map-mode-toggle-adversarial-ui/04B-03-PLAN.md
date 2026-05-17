---
phase: 4b
plan: 03
type: execute
wave: 2
depends_on: ["04b-01"]
files_modified:
  - packages/g2-app/src/status-hud/toast-types.ts
  - packages/g2-app/src/status-hud/toast-queue-layer.ts
  - packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts
  - packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts
  - packages/shared-render/src/fixtures/toast-queue.single.it.txt
  - packages/shared-render/src/fixtures/toast-queue.dual.it.txt
  - packages/shared-render/src/fixtures/toast-queue.squashed.it.txt
autonomous: true
requirements: [TOAST-01]
subsystem: g2-app
user_setup: []
tags: [g2-app, status-hud, toast, queue, fifo, squash, inv-1, fixtures, wave-2]
must_haves:
  truths:
    - "ToastQueueLayer implements Layer at z=1.5 (ZIndex.Z1_5_TOAST from Plan 01) with a single text container 'toast-block' (1-container strategy per UI-SPEC §3.2 + §7 budget audit row 'Idle + 1-2 toasts mounted, no overlay = 12 total at budget')"
    - "Toast capacity: max 2 visible at any time, dwell 3 s each (Date.now()-driven timers via setTimeout, cleared on destroy)"
    - "FIFO ordering: oldest visible toast occupies row 1 of the block, newest occupies row 2; on dwell-out the older is removed and the next queued is promoted; queue is internally an array with shift()/push() (or equivalent) — implementation chooses the simpler structure (CONTEXT Discretion)"
    - "Squash badge: when 3+ toasts buffered AND 2 visible, the HEAD toast's content gets a '[+N]' suffix where N is the queue length (toasts buffered but not visible). N cap 99; overflow above 99 displays '[+99]' AND triggers a telemetry warn (RESEARCH §Q5 + Open Question 4)"
    - "Severity prefix is language-neutral (Pitfall 6): 'i: ' for info, '!: ' for warn, 'x: ' for error. Single-char + colon + space. NOT in i18n-budgets.ts."
    - "Survives overlay open: ToastQueueLayer mounted at z=1.5 does NOT get demolished when z=2 panel mounts (verified by Plan 01 LMT-DD-04 unit test; Plan 05 integration test ratifies under real toast content)"
    - "ASCII fixtures (3 INV-1): toast-queue.single.it.txt (1 toast), toast-queue.dual.it.txt (2 toasts FIFO no badge), toast-queue.squashed.it.txt (head with [+7] = Fireball + 8 saves stress case SC #3); all 96×24 page-wide with Status HUD at cols 68-95 preserved"
    - "i18n-budgets.ts keys (toast_squash_badge_template + toast_row_padding_target) are READ-ONLY here — Plan 01 already landed them in Wave 0. This plan does NOT modify i18n-budgets.ts to avoid Wave-2 file-overlap with Plan 04."
    - "Soft cap on queue length: 100 buffered toasts; above the cap, oldest queued (NOT visible) is dropped + telemetry warn (RESEARCH Open Question 4 DoS mitigation)"
  artifacts:
    - path: "packages/g2-app/src/status-hud/toast-types.ts"
      provides: "ToastSchema (Zod) + ToastSeveritySchema + Toast type + ToastSeverity type + SEVERITY_PREFIX const map"
      exports: ["ToastSchema", "ToastSeveritySchema", "Toast", "ToastSeverity", "SEVERITY_PREFIX"]
    - path: "packages/g2-app/src/status-hud/toast-queue-layer.ts"
      provides: "ToastQueueLayer class implementing Layer interface; enqueue(toast: Toast) public method; getVisibleCount() + getBufferedCount() for tests; getContainerCount returns { image: 0, text: 1 } (Plan 01 Strategy A)"
      exports: ["ToastQueueLayer"]
    - path: "packages/shared-render/src/fixtures/toast-queue.single.it.txt"
      provides: "96×24 INV-1 fixture: 1 info toast 'i: Danno 12 slashing' at rows 19-20 of map area; cols 26-67"
      contains: "Danno 12 slashing"
    - path: "packages/shared-render/src/fixtures/toast-queue.dual.it.txt"
      provides: "96×24 INV-1 fixture: 2 toasts FIFO no squash"
      contains: "Tiro Salv. DES superato"
    - path: "packages/shared-render/src/fixtures/toast-queue.squashed.it.txt"
      provides: "96×24 INV-1 fixture: head with [+7] squash badge (Fireball + 8 saves)"
      contains: "[+7]"
    - path: "packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts"
      provides: "NEW dedicated test file (not the Phase 4a snapshot.test.ts — separate to avoid Wave-2 file-overlap) covering INV-1 ck 11/12 for toast-queue states"
      contains: "matchAsciiFixture"
  key_links:
    - from: "packages/g2-app/src/status-hud/toast-queue-layer.ts"
      to: "packages/g2-app/src/engine/layer-types.ts"
      via: "implements Layer; declares ZIndex.Z1_5_TOAST as its mount target (caller invokes layerManager.mount(Z1_5_TOAST, toastLayer))"
      pattern: "implements Layer|Z1_5_TOAST"
    - from: "packages/g2-app/src/status-hud/toast-queue-layer.ts"
      to: "@evenrealities/even_hub_sdk EvenAppBridge.textContainerUpgrade"
      via: "bridge.textContainerUpgrade({ containerName: 'toast-block', content }) on every redraw"
      pattern: "textContainerUpgrade|toast-block"
    - from: "packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts"
      to: "packages/shared-render/src/fixtures/toast-queue.*.txt"
      via: "matchAsciiFixture('../../../../shared-render/src/fixtures/toast-queue.single.it.txt') et al"
      pattern: "matchAsciiFixture"
    - from: "packages/g2-app/src/status-hud/toast-queue-layer.ts (consumes i18n-budgets)"
      to: "packages/g2-app/src/status-hud/i18n-budgets.ts (Plan 01 read-only)"
      via: "imports HUD_WIDTH_BUDGETS.toast_squash_badge_template + toast_row_padding_target for max-width gates (assertWithinBudget calls)"
      pattern: "HUD_WIDTH_BUDGETS|toast_squash_badge_template|toast_row_padding_target"

threat_model:
  trust_boundaries:
    - description: "External callers invoke ToastQueueLayer.enqueue(toast) — Toast must be Zod-validated to prevent malformed payload reaching the renderer + bridge"
    - description: "Toast queue size unbounded by external producers — soft cap + drop-oldest prevents DoS via unbounded memory"
  threats:
    - id: "T-4b-03-01"
      category: "T"
      component: "ToastQueueLayer.enqueue receiving untrusted Toast objects"
      disposition: "mitigate"
      mitigation_plan: "Public enqueue() runs ToastSchema.safeParse() before pushing into the queue; failure → log + ignore (no throw, no rendering of bad content)"
    - id: "T-4b-03-02"
      category: "D"
      component: "Unbounded toast queue (memory exhaustion via flood)"
      disposition: "mitigate"
      mitigation_plan: "Soft cap MAX_BUFFERED_TOASTS = 100; on overflow, drop oldest queued (FIFO from buffer tail) + console.warn telemetry. Visible-slot toasts are never dropped (always cycle out via 3 s dwell)."
    - id: "T-4b-03-03"
      category: "D"
      component: "setTimeout dwell-timer leak on destroy"
      disposition: "mitigate"
      mitigation_plan: "ToastQueueLayer.destroy() clears all active dwell timers (Map<toastId, NodeJS.Timeout> or array); unit-tested via vi.useFakeTimers + assert timer count = 0 post-destroy"
    - id: "T-4b-03-04"
      category: "I"
      component: "Toast content displays game state to user"
      disposition: "accept"
      mitigation_plan: "Toasts are user's own session events; same disclosure surface as Status HUD. Not a new information leak."
---

<objective>
Ship the **z=1.5 toast queue** (`ToastQueueLayer implements Layer`) with FIFO ordering, 3-second dwell, `[+N]` squash badge on overflow, severity-prefix rendering, and the soft DoS cap. Land 3 INV-1 ASCII fixtures covering the single/dual/squashed states (Fireball + 8 saves stress case SC #3).

Purpose: Close TOAST-01 software-side. The Fireball + 8 saves stress case (SC #3 in ROADMAP) requires a 9th toast to squash into "+N more" without dropping any visible toasts — this plan delivers that semantic exactly per RESEARCH §Q5 interpretation. The toast layer integrates with Plan 01's differential demolish rule (z=1.5 survives z=2 mount); Plan 05 integration smoke ratifies under real overlay open.

Output: 2 new source modules (toast-types.ts + toast-queue-layer.ts) + 1 new test file (toast-queue-layer.test.ts) + 1 NEW dedicated snapshot test file (toast-snapshot.test.ts — separate from Phase 4a snapshot.test.ts to avoid Wave-2 file-overlap) + 3 INV-1 fixture files. Wave-2 parallel-safe with Plan 04: **zero files_modified overlap** (Plan 03 owns `packages/g2-app/src/status-hud/toast-*` + `__tests__/toast-*` + 3 toast-queue fixtures; Plan 04 owns `packages/g2-app/src/engine/boot-error-*` + `__tests__/boot-error-*` + 10 boot-error fixtures). i18n-budgets.ts is NOT in files_modified here — Plan 01 landed all Phase 4b keys atomically in Wave 0.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md
@.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md
@packages/g2-app/src/engine/layer-types.ts
@packages/g2-app/src/status-hud/i18n-budgets.ts
@packages/g2-app/src/status-hud/status-hud-layer.ts
@packages/g2-app/src/status-hud/idle-infill-layer.ts
@packages/shared-render/src/ascii-grid.ts
@packages/shared-render/src/snapshot.ts
@packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt

<interfaces>
<!-- Key types this plan exposes and consumes. -->

From packages/g2-app/src/engine/layer-types.ts (post-Plan-01):
- enum ZIndex with Z1_5_TOAST = 1.5
- interface Layer { id: string; draw(): Promise<void>; destroy(): void; getCaptureContainer?(): string; getContainerCount?(): { image: number; text: number } }   // getContainerCount from Plan 01

From @evenrealities/even_hub_sdk:
- bridge.textContainerUpgrade(payload: TextContainerUpgrade): Promise<boolean>

From packages/g2-app/src/status-hud/i18n-budgets.ts (post-Plan-01 — READ-ONLY):
- HUD_WIDTH_BUDGETS.toast_squash_badge_template = { it: '[+{n}]', en: '[+{n}]', de: '[+{n}]', max: 5 }
- HUD_WIDTH_BUDGETS.toast_row_padding_target = { it: '', en: '', de: '', max: 42 }
- assertWithinBudget(value, field) — Plan 03 may call to validate render output against the toast_row_padding_target.max
- getLabel(field, locale) — Plan 03 may call for the badge template (but template substitution {n} is done locally via String.replace)

NEW types ToastQueueLayer / toast-types.ts:
- export const ToastSeveritySchema = z.enum(['info', 'warn', 'error']) as const
- export type ToastSeverity = z.infer<typeof ToastSeveritySchema>
- export const ToastSchema = z.strictObject({
    id: z.string().min(1),                      // monotonic ID — caller-supplied or UUID; layer treats as opaque
    severity: ToastSeveritySchema,
    message: z.string().min(1).max(38),         // 38-char budget = 42 container width - 3-char severity prefix - 1-char right margin per UI-SPEC §3.2
    emittedAt: z.number().int().nonnegative(),  // Date.now() at emit; layer uses for dwell-timer scheduling
  })
- export type Toast = z.infer<typeof ToastSchema>
- export const SEVERITY_PREFIX: Readonly<Record<ToastSeverity, string>> = { info: 'i: ', warn: '!: ', error: 'x: ' }
- export const TOAST_DWELL_MS = 3000
- export const TOAST_VISIBLE_CAPACITY = 2
- export const TOAST_BUFFER_SOFT_CAP = 100
- export const TOAST_CONTAINER_NAME = 'toast-block' as const
- export const TOAST_ROW_WIDTH = 42 as const  // matches i18n-budgets toast_row_padding_target.max

NEW class:
- export class ToastQueueLayer implements Layer {
    readonly id = 'toast-queue';
    constructor(opts: { bridge: EvenAppBridge });
    async draw(): Promise<void>;
    destroy(): void;
    enqueue(toast: Toast): void;
    getVisibleCount(): number;
    getBufferedCount(): number;
    getContainerCount(): { image: 0; text: 1 };
  }

Squash semantics (RESEARCH §Q5, verbatim):
  - Visible slots: 2 (head + tail)
  - On enqueue when visible.length < 2: push to visible; schedule dwell timer
  - On enqueue when visible.length === 2: push to buffered
  - On dwell-out: remove from visible; promote oldest buffered to visible; reschedule dwell using Date.now()
  - Squash badge: when buffered.length > 0, HEAD content gets a ` [+N]` suffix (note the LEADING SPACE) where N = buffered.length, capped at 99

Soft cap (RESEARCH Open Question 4):
  - On enqueue when buffered.length === TOAST_BUFFER_SOFT_CAP: drop OLDEST in buffered (shift) + console.warn telemetry
  - Currently-visible toasts NEVER dropped

Render contract:
  - 2-row block: `${row0}\n${row1}` where each row is padded to TOAST_ROW_WIDTH (42 chars)
  - Row 0 (head): `SEVERITY_PREFIX[head.severity] + head.message + (buffered.length > 0 ? ` ${badge}` : '')` then right-pad to 42
  - Row 1 (tail): `SEVERITY_PREFIX[tail.severity] + tail.message` right-padded to 42
  - If visible.length === 1: row 0 has the toast, row 1 is 42 spaces
  - If visible.length === 0: content empty (caller should not draw)

Delta detection (avoid spamming textContainerUpgrade):
  - Store `private renderedContent: string = ''`
  - In draw(), build the new content; if equals renderedContent, no-op
  - Otherwise: call bridge.textContainerUpgrade; update renderedContent

INV-1 fixtures (3) — verbatim from UI-SPEC §5.11, §5.12, §5.13:
  - toast-queue.single.it.txt: 96×24, single toast 'i: Danno 12 slashing' at row 20
  - toast-queue.dual.it.txt: 96×24, two toasts at rows 19-20
  - toast-queue.squashed.it.txt: 96×24, head squashed 'i: Tiro Salv. DES superato [+7]' on row 19, tail 'i: Danno 28 fuoco' on row 20

The fixtures are 96×24 full-page (NOT just the toast block). The matchAsciiFixture assertion uses a `buildToastScenePage(opts)` helper that composes the full page from the toast block + the raster-idle background.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: toast-types.ts + toast-queue-layer.ts + unit tests (FIFO + squash + dwell + DoS cap)</name>
  <read_first>
    - packages/g2-app/src/status-hud/status-hud-layer.ts (full file — Phase 4a Layer-implementing class pattern: constructor + draw + destroy + debounce timers + safeParse on receive)
    - packages/g2-app/src/status-hud/i18n-budgets.ts (full file, POST-PLAN-01 — Plan 03 reads toast_squash_badge_template + toast_row_padding_target; does NOT modify)
    - packages/g2-app/src/engine/layer-types.ts (post-Plan-01 — Layer interface with optional getContainerCount; Plan 01 Strategy A pattern)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-RESEARCH.md §Approach 3 (toast queue file map + key data shapes) + §Q5 (squash semantics, edge cases table, container strategy)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §3.2 (toast queue 4 visual states + severity prefix table + width budget) + §4.2 (i18n-budgets keys — these are now in Plan 01's commit; Plan 03 only consumes)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-CONTEXT.md §Area 5 (locked decisions on capacity, dwell, squash, severity)
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-01-SUMMARY.md (Plan 01 output — Z1_5_TOAST enum value + i18n-budgets toast keys landed in Wave 0)
  </read_first>
  <files>packages/g2-app/src/status-hud/toast-types.ts, packages/g2-app/src/status-hud/toast-queue-layer.ts, packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts</files>
  <behavior>
    toast-types module:
    - Test TT-1: ToastSchema.safeParse({id:'a', severity:'info', message:'x', emittedAt:0}).success === true
    - Test TT-2: ToastSchema.safeParse({id:'a', severity:'fatal', message:'x', emittedAt:0}).success === false (invalid severity)
    - Test TT-3: ToastSchema.safeParse({id:'a', severity:'info', message:'x'.repeat(39), emittedAt:0}).success === false (message too long, max 38)
    - Test TT-4: SEVERITY_PREFIX maps 'info'→'i: ', 'warn'→'!: ', 'error'→'x: ' (exact strings including trailing space)
    - Test TT-5: TOAST_VISIBLE_CAPACITY === 2 && TOAST_DWELL_MS === 3000 && TOAST_BUFFER_SOFT_CAP === 100 && TOAST_ROW_WIDTH === 42

    toast-queue-layer FIFO + visibility:
    - Test TQL-FIFO-01: new ToastQueueLayer({bridge}).getVisibleCount() === 0 && .getBufferedCount() === 0
    - Test TQL-FIFO-02: enqueue 1 toast → getVisibleCount === 1 && getBufferedCount === 0; bridge.textContainerUpgrade called once with content matching row0 = severity prefix + message right-padded to 42, row1 = 42 spaces, joined by '\n'
    - Test TQL-FIFO-03: enqueue 2 toasts → visible 2, buffered 0; both rows populated
    - Test TQL-FIFO-04: enqueue 3rd toast at visible=2 → visible 2 (unchanged), buffered 1; HEAD content row gets ' [+1]' suffix (note: explicit space before badge per UI-SPEC §3.2)
    - Test TQL-FIFO-05: 9 toasts enqueued (Fireball + 8 saves stress) → visible 2, buffered 7; HEAD row has ' [+7]' suffix
    - Test TQL-FIFO-06 (dwell-out cycle): use vi.useFakeTimers; enqueue 3 toasts; advance time 3000 ms → head toast removed; tail becomes head; previously-buffered becomes new tail; head still has correct badge ([+0] = no badge since buffered now empty)
    - Test TQL-FIFO-07 (badge decrement): start with 5 toasts (visible 2 + buffered 3, head shows [+3]); advance 3000 ms → buffered 2, head shows [+2]
    - Test TQL-FIFO-08 (no badge when buffered=0): visible 2 + buffered 0 → head content has NO ' [+N]' suffix

    toast-queue-layer cap + safeParse:
    - Test TQL-PARSE-01: enqueue invalid toast (severity 'fatal') → no internal state change; console.warn called with safeParse error info; visible/buffered counts unchanged
    - Test TQL-PARSE-02: enqueue valid toast with severity 'warn' → row uses '!: ' prefix
    - Test TQL-CAP-01: enqueue 102 toasts (2 visible + 100 buffered already at cap) → buffered length stays at 100 (oldest queued dropped per soft cap); console.warn called with 'soft cap exceeded' phrase

    toast-queue-layer Layer interface:
    - Test TQL-LAYER-01: layer.id === 'toast-queue'
    - Test TQL-LAYER-02: layer.getCaptureContainer is undefined (render-only)
    - Test TQL-LAYER-03: layer.getContainerCount() returns { image: 0, text: 1 } (Plan 01 Strategy A)
    - Test TQL-LAYER-04: layer.destroy() clears all dwell timers (verified via vi.useFakeTimers and asserting setTimeout mock cleanup); idempotent (second call does not throw)

    Delta detection:
    - Test TQL-DELTA-01: enqueue same content twice in a row → bridge.textContainerUpgrade called exactly once (identical render short-circuited)
    - Test TQL-DELTA-02: enqueue a 3rd toast (triggers squash badge) → bridge.textContainerUpgrade called again (content changed: badge appeared)
  </behavior>
  <action>
    Implement three source files + one test file atomically.

    **1. `packages/g2-app/src/status-hud/toast-types.ts`:**

    Module JSDoc cites 04b-CONTEXT.md §Area 5 + 04B-RESEARCH.md §Approach 3 + UI-SPEC §3.2.

    Exports (full TS types — see <interfaces> for shapes):
    - `ToastSeveritySchema = z.enum(['info', 'warn', 'error'])`
    - `ToastSchema = z.strictObject({ id, severity, message, emittedAt })` with max(38) on message
    - `Toast` and `ToastSeverity` types via z.infer
    - `SEVERITY_PREFIX` const map
    - Five constants: `TOAST_DWELL_MS`, `TOAST_VISIBLE_CAPACITY`, `TOAST_BUFFER_SOFT_CAP`, `TOAST_CONTAINER_NAME`, `TOAST_ROW_WIDTH`
    - JSDoc on every export. Severity prefix JSDoc explicitly cites Pitfall 6: "Language-neutral by design; do NOT add to i18n-budgets table. Single-char + colon + space."

    **2. `packages/g2-app/src/status-hud/toast-queue-layer.ts`:**

    Module JSDoc cites 04B-RESEARCH.md §Approach 3 + UI-SPEC §3.2 + ADR-0009 Amendment 1 (z=1.5 survives z=2 mount per Plan 01).

    Imports:
    ```
    import { type EvenAppBridge, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
    import type { Layer } from '../engine/layer-types.js';
    import { ToastSchema, type Toast, SEVERITY_PREFIX, TOAST_DWELL_MS, TOAST_VISIBLE_CAPACITY, TOAST_BUFFER_SOFT_CAP, TOAST_CONTAINER_NAME, TOAST_ROW_WIDTH } from './toast-types.js';
    ```

    Exports `class ToastQueueLayer implements Layer`. Public surface:
    - `readonly id = 'toast-queue'`
    - constructor takes `{ bridge: EvenAppBridge }` opts
    - `async draw(): Promise<void>` — render current state to bridge
    - `destroy(): void` — clear all dwell timers; idempotent
    - `enqueue(toast: Toast): void` — safeParse; push to visible or buffered (or drop oldest on soft cap); schedule dwell timer if pushed to visible; trigger redraw
    - `getVisibleCount(): number` — test diagnostic
    - `getBufferedCount(): number` — test diagnostic
    - `getContainerCount(): { image: 0; text: 1 }` — Plan 01 Strategy A

    Private state:
    - `visible: Toast[]` — length 0..2
    - `buffered: Toast[]` — length 0..100
    - `dwellTimers: Map<string, ReturnType<typeof setTimeout>>` — keyed by toast.id
    - `renderedContent: string = ''` — for delta detection

    Private methods:
    - `_scheduleDwell(toast: Toast): void`
    - `_buildContent(): string` — builds the 2-row block string per render contract
    - `_renderBadge(): string` — returns ` [+${Math.min(buffered.length, 99)}]` if buffered.length > 0; else ''; console.warn telemetry if buffered.length > 99
    - `_padRow(content: string): string` — right-pad to TOAST_ROW_WIDTH chars
    - `_redrawIfChanged(): Promise<void>` — build content; if differs from renderedContent, call bridge.textContainerUpgrade and update renderedContent

    Implementation details:
    - The `enqueue` method is synchronous; calls `void this._redrawIfChanged()` fire-and-forget. Tests use vi.runAllTimersAsync to flush.
    - safeParse failure: `console.warn('[toast-queue-layer] invalid Toast payload', result.error)`; return without state change.
    - Soft cap: `if (buffered.length >= TOAST_BUFFER_SOFT_CAP) { const dropped = buffered.shift(); console.warn('[toast-queue-layer] soft cap exceeded; dropping oldest queued toast', dropped?.id); }`
    - destroy idempotency: clear all timers, set `visible = []`, `buffered = []`, `dwellTimers.clear()`.

    INV-4 JSDoc on every export + private method. No `// TODO` without `(#issue)` or `(ADR-NNNN)`.

    **3. `packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts`:**

    Use vi.useFakeTimers for dwell-cycle tests (TQL-FIFO-06, TQL-FIFO-07). Use vi.fn() for bridge.textContainerUpgrade mock.

    Implement all ~17 tests above (TT-1..TT-5, TQL-FIFO-01..TQL-FIFO-08, TQL-PARSE-01..TQL-PARSE-02, TQL-CAP-01, TQL-LAYER-01..TQL-LAYER-04, TQL-DELTA-01..TQL-DELTA-02). Group with `describe` blocks per concern (FIFO, soft cap, layer interface, delta detection).

    Stress test for SC #3 (Fireball + 8 saves): enqueue 9 toasts; assert visible=2, buffered=7, head row contains '[+7]', tail row populated. This is the load-bearing TQL-FIFO-05 assertion.

    Constraints:
    - INV-4 JSDoc on every public export.
    - Severity prefixes hardcoded (NOT i18n) per Pitfall 6.
    - No DOM API usage.
    - `pnpm typecheck && pnpm lint:ci` must exit 0.
    - i18n-budgets.ts is NOT modified — Plan 03 only READS the toast keys Plan 01 landed.
  </action>
  <verify>
    <automated>pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/toast-queue-layer.test.ts && grep -c "export class ToastQueueLayer" packages/g2-app/src/status-hud/toast-queue-layer.ts && grep -c "implements Layer" packages/g2-app/src/status-hud/toast-queue-layer.ts && grep -c "ToastSchema.safeParse" packages/g2-app/src/status-hud/toast-queue-layer.ts && grep -c "TOAST_BUFFER_SOFT_CAP = 100" packages/g2-app/src/status-hud/toast-types.ts && grep -c "SEVERITY_PREFIX" packages/g2-app/src/status-hud/toast-types.ts && grep -cE "TQL-(FIFO|PARSE|CAP|LAYER|DELTA)-0[0-9]" packages/g2-app/src/status-hud/__tests__/toast-queue-layer.test.ts && pnpm typecheck && pnpm lint:ci</automated>
  </verify>
  <done>
    Test file green with ~17 tests across 5 describe blocks; toast-types.ts and toast-queue-layer.ts exist with the documented exports; i18n-budgets.ts is UNCHANGED in this plan (verified by git diff showing no edits); test markers grep-match; typecheck + lint:ci exit 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: 3 INV-1 ASCII fixtures + NEW toast-snapshot.test.ts file (matchAsciiFixture for toast-queue states)</name>
  <read_first>
    - .planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04B-UI-SPEC.md §5.11 (toast-queue.single.it.txt — full ASCII), §5.12 (toast-queue.dual.it.txt — full ASCII), §5.13 (toast-queue.squashed.it.txt — full ASCII with [+7])
    - packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt (Phase 4a baseline — toast fixtures overlay onto this scene; preserve cols 68-95 Status HUD region)
    - packages/g2-app/src/status-hud/__tests__/snapshot.test.ts (Phase 4a INV-1 ck 11-15 patterns — REFERENCE ONLY; Plan 03 creates a NEW dedicated file `toast-snapshot.test.ts` to avoid Wave-2 modification conflict with Plan 04, which may extend snapshot.test.ts in Wave 3)
    - packages/shared-render/src/snapshot.ts (matchAsciiFixture path resolution; 4× `../` from `packages/g2-app/src/status-hud/__tests__/`)
    - packages/shared-render/src/ascii-grid.ts (composition helper for building the full 96×24 page from toast block + idle background)
  </read_first>
  <files>packages/shared-render/src/fixtures/toast-queue.single.it.txt, packages/shared-render/src/fixtures/toast-queue.dual.it.txt, packages/shared-render/src/fixtures/toast-queue.squashed.it.txt, packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts</files>
  <behavior>
    Fixtures:
    - Test FIX-1: File `packages/shared-render/src/fixtures/toast-queue.single.it.txt` exists, is 96 chars wide × 24 rows tall, contains 'Danno 12 slashing' on row 20 (1-indexed)
    - Test FIX-2: `toast-queue.dual.it.txt` is 96×24, contains 'Tiro Salv. DES superato' on row 19 and 'Danno 12 slashing' on row 20
    - Test FIX-3: `toast-queue.squashed.it.txt` is 96×24, contains '[+7]' literal AND 'Tiro Salv. DES superato' on row 19, 'Danno 28 fuoco' on row 20
    - All three fixtures preserve the cols 68-95 Status HUD region identical to glyph-scene.raster-idle.txt

    toast-snapshot.test.ts (INV-1 ck 11 + ck 12 dedicated tests):
    - Test TS-INV1-ck11-single: Synthesize a layout matching toast-queue.single.it.txt via a `buildToastScenePage(opts: { visibleToasts: Toast[], bufferedCount?: number })` helper; matchAsciiFixture passes
    - Test TS-INV1-ck11-dual: Same for the dual state
    - Test TS-INV1-ck12-squashed: Same for the squashed state (INV-1 ck 12 variable-content stress — badge appears at fixed cols)
  </behavior>
  <action>
    **1. Hand-author three fixture files in `packages/shared-render/src/fixtures/`:**

    Copy the EXACT ASCII grids from UI-SPEC §5.11, §5.12, §5.13. Character precision is mandatory.

    File geometry:
    - `toast-queue.single.it.txt`: 96 chars × 24 rows; outer frame `╔═╗`/`║`/`╚═╝`; central divider `║` at col 68; right border `║` at col 95; row 20 (1-indexed) contains the single toast at cols 26ish-67 per spec; rows 1-18 = raster tiles + frame
    - `toast-queue.dual.it.txt`: identical frame; rows 19-20 each have a toast
    - `toast-queue.squashed.it.txt`: identical frame; rows 19-20 have toasts WITH `[+7]` badge on row 19's head

    Each row padded with trailing spaces to exactly 96 chars. Final byte is a trailing newline (matches Phase 4a fixture format).

    **2. NEW file `packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts`:**

    This is a DEDICATED test file, NOT an extension of Phase 4a snapshot.test.ts (to avoid same-wave file-conflict with Plan 04, which may extend snapshot.test.ts later if needed).

    The test file imports `matchAsciiFixture` from `@evf/shared-render` and the `ToastQueueLayer` + `Toast` from Task 1's output.

    Implement three `it()` blocks under a single `describe('Phase 4b toast queue INV-1', () => { ... })`:

    ```
    it('TS-INV1-ck11-single: 1 toast visible no squash', async () => {
      const page = await buildToastScenePage({ visibleToasts: [{id:'t1', severity:'info', message:'Danno 12 slashing', emittedAt:Date.now()}] });
      await matchAsciiFixture(page, '../../../../shared-render/src/fixtures/toast-queue.single.it.txt');
    });

    it('TS-INV1-ck11-dual: 2 toasts FIFO no badge', async () => {
      const page = await buildToastScenePage({ visibleToasts: [
        {id:'t1', severity:'info', message:'Tiro Salv. DES superato', emittedAt:Date.now()-1000},
        {id:'t2', severity:'info', message:'Danno 12 slashing', emittedAt:Date.now()},
      ]});
      await matchAsciiFixture(page, '../../../../shared-render/src/fixtures/toast-queue.dual.it.txt');
    });

    it('TS-INV1-ck12-squashed: Fireball + 8 saves stress, [+7] badge', async () => {
      const page = await buildToastScenePage({
        visibleToasts: [
          {id:'t1', severity:'info', message:'Tiro Salv. DES superato', emittedAt:0},
          {id:'t2', severity:'info', message:'Danno 28 fuoco', emittedAt:0},
        ],
        bufferedCount: 7,
      });
      await matchAsciiFixture(page, '../../../../shared-render/src/fixtures/toast-queue.squashed.it.txt');
    });
    ```

    Implement the `buildToastScenePage(opts)` helper in the test file. The helper:
    1. Loads `packages/shared-render/src/fixtures/glyph-scene.raster-idle.txt` as a base char grid (96×24).
    2. Overlays the toast block content at rows 19-20 cols 26-67 (per UI-SPEC §3.2 placement).
    3. Returns an AsciiGrid wrapping the modified grid.

    Alternative: skip the helper; build the expected page string directly from string composition against the raster-idle baseline. Pick one; document in 04b-03-SUMMARY.md.

    The path `../../../../shared-render/src/fixtures/...` from `packages/g2-app/src/status-hud/__tests__/` is 4 levels up — verify by inspecting Phase 4a snapshot.test.ts (Pitfall 5 from RESEARCH).

    Constraints:
    - Fixtures: trailing newline; uniform 96-char width; box-drawing chars verbatim from UI-SPEC.
    - Severity prefix `i: ` exactly (matches SEVERITY_PREFIX const).
    - The 3 fixtures DO NOT modify the Status HUD card region (cols 68-95).
    - Tests use `matchAsciiFixture` from `@evf/shared-render` (Phase 4a precedent).
    - The NEW test file `toast-snapshot.test.ts` is distinct from Phase 4a `snapshot.test.ts` — both coexist in __tests__/.
  </action>
  <verify>
    <automated>test -f packages/shared-render/src/fixtures/toast-queue.single.it.txt && test -f packages/shared-render/src/fixtures/toast-queue.dual.it.txt && test -f packages/shared-render/src/fixtures/toast-queue.squashed.it.txt && grep -c 'Danno 12 slashing' packages/shared-render/src/fixtures/toast-queue.single.it.txt && grep -c 'Tiro Salv. DES superato' packages/shared-render/src/fixtures/toast-queue.dual.it.txt && grep -c '\[+7\]' packages/shared-render/src/fixtures/toast-queue.squashed.it.txt && awk '{ if (length($0) > 0 && length($0) != 96) { print "FAIL row "NR" len="length($0); exit 1 } } END { print "OK" }' packages/shared-render/src/fixtures/toast-queue.squashed.it.txt && pnpm --filter @evf/g2-app test --run -- src/status-hud/__tests__/toast-snapshot.test.ts && grep -cE 'TS-INV1-ck1[12]' packages/g2-app/src/status-hud/__tests__/toast-snapshot.test.ts</automated>
  </verify>
  <done>
    All 3 fixture files exist with correct content + uniform 96-char width; NEW toast-snapshot.test.ts has 3 INV-1 ck 11/12 toast cases that pass matchAsciiFixture; the [+7] literal grep-matches in the squashed fixture; existing Phase 4a snapshot.test.ts is UNTOUCHED.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ToastQueueLayer.enqueue(toast) caller → internal queue | Untrusted Toast objects must be ToastSchema.safeParse'd before being pushed |
| Visible-toast dwell timer → internal redraw | setTimeout fires must clear the timer entry from dwellTimers Map and trigger a fresh redraw |
| Unbounded queue growth → memory | Soft cap MAX_BUFFERED_TOASTS = 100; drop-oldest + warn telemetry |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-4b-03-01 | T | ToastQueueLayer.enqueue receiving untrusted Toast | mitigate | ToastSchema.safeParse() before push; failure → console.warn + return; queue state unchanged |
| T-4b-03-02 | D | Unbounded queue memory exhaustion | mitigate | Soft cap 100; on overflow drop oldest buffered + warn telemetry; visible toasts never dropped |
| T-4b-03-03 | D | setTimeout dwell-timer leak on destroy | mitigate | destroy() clears all dwell timers via Map.forEach(clearTimeout) + .clear(); idempotent; verified by TQL-LAYER-04 |
| T-4b-03-04 | I | Toast content displays game state | accept | Same disclosure surface as Status HUD; not a new leak |
| T-4b-03-05 | T | Badge counter integer overflow | mitigate | Display cap at 99 (`Math.min(buffered.length, 99)`); telemetry warn if buffered.length > 99 (DoS scenario covered by T-4b-03-02) |
</threat_model>

<verification>
- `pnpm --filter @evf/g2-app test --run` exits 0 with toast-queue-layer.test.ts (~17 tests) + toast-snapshot.test.ts (3 new tests) all green; Phase 4a tests still pass
- `pnpm typecheck && pnpm lint:ci` exit 0
- 3 fixture files exist with uniform 96-char width and required literals ('Danno 12 slashing', 'Tiro Salv. DES superato', '[+7]')
- toast-queue-layer.ts implements Layer interface + uses ToastSchema.safeParse
- i18n-budgets.ts is UNMODIFIED in this plan (Plan 01 already landed the toast keys)
- Plan 03 files_modified do NOT overlap with Plan 04's files_modified — verified by inspecting both frontmatters
</verification>

<success_criteria>
Plan 03 closes when:
- TOAST-01 fully addressed software-side: ToastQueueLayer ships at z=1.5, FIFO with 3 s dwell, [+N] squash on overflow, severity prefixes language-neutral
- SC #3 (Fireball + 8 saves) provably satisfied by TQL-FIFO-05 (9 toasts → visible 2 + [+7] badge) + INV-1 fixture toast-queue.squashed.it.txt containing [+7]
- Differential demolish rule from Plan 01 consumed: z=1.5 toast layer NOT demolished when z=2 panel mounts (verified by Plan 01 LMT-DD-04; Plan 05 integration smoke ratifies)
- 3 INV-1 fixtures committed; toast-snapshot.test.ts asserts character-perfect match
- Soft cap 100 + drop-oldest prevents DoS (T-4b-03-02 mitigation)
- All severity prefixes hardcoded (Pitfall 6)
- Hardware verification (Fireball + 8 saves on real G2) deferred to ADR-0005 Branch A human_needed gate
- Wave-2 parallelism preserved: zero files_modified overlap with Plan 04
</success_criteria>

<output>
After completion, create `.planning/phases/04b-overlay-slot-map-mode-toggle-adversarial-ui/04b-03-SUMMARY.md` capturing:
- Final ToastQueueLayer state surface (visible / buffered / dwellTimers / renderedContent)
- Test count: ~17 in toast-queue-layer.test.ts + 3 new in toast-snapshot.test.ts
- Container strategy: single 'toast-block' container with 2-row newline-separated content
- Whether `buildToastScenePage` helper was created or string composition used (rationale)
- ToastSchema field constraints (message max 38 chars verified against UI-SPEC §3.2)
- Soft cap behaviour: drop-oldest-from-buffered + telemetry warn
- Severity prefix table documented as Pitfall 6 compliance
- Phase 5 wiring hint: Plan 05 conc-modal does NOT touch toast machinery; Plan 05 integration test verifies coexistence
- Wave-2 parallelism confirmation: this plan touched no files in Plan 04's files_modified list AND did NOT modify i18n-budgets.ts (Plan 01's domain)
</output>
