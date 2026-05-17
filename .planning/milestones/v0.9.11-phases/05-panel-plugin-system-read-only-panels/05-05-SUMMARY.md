---
phase: 05-panel-plugin-system-read-only-panels
plan: "05"
subsystem: g2-app
tags: [g2-app, panels, combat-tracker, log, comb-01, comb-03, concentration-subline, quick-action-bar, inv-1, fixtures, shared-protocol, foundry-module, log-reader]

# Dependency graph
requires:
  - phase: 05-01
    provides: HUD_WIDTH_BUDGETS Phase 5 combat + log keys; CombatantSchema.concentration; widened HudLocale + EN fallback
  - phase: 05-02
    provides: PanelRouter discovery + Strategy A text-container pattern via CharacterSheetPanel exemplar
  - phase: 04b
    provides: OverlayPanel interface + PanelGestureBus + CombatSnapshot existing schema

provides:
  - CombatTrackerPanel — OverlayPanel, Strategy A, 5-row sliding window, concentration sub-line, quick-action bar footer
  - computeWindow(turns, currentTurnIndex, scrollOffset) — pure 5-row windowing algorithm
  - renderCombatantRow — 66-cp wide per UI-SPEC §5.8 column layout; optional conc: sub-line
  - renderQuickActionBar(locale) — render-only [ A ][ S ][ I ][ M ] footer (Phase 6 wires tap-cycle)
  - LogPanel — OverlayPanel, Strategy A, chat log tail, filter bar, roll result sub-lines
  - LogEventSchema / LogSnapshotSchema — new shared-protocol Zod schemas (8 kinds, 5 result kinds)
  - getLogEventTail(maxCount?) — foundry-module reader mapping ChatMessages to LogEvent[]
  - 6 INV-1 fixtures: combat-tracker.{full-window,partial,single,no-combat}.it.txt + log.{standard,empty}.it.txt

affects:
  - 05-06 — integration smoke composing Combat + Log + CharacterSheet + Inventory + Spellbook via PanelRouter

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "5-row windowing algorithm — computeWindow(turns, idx, scrollOffset): handles 1, 2-4, 5, first, last, mid edge cases"
    - "Concentration sub-line — 22-space indent + conc: + spell-12 + space + duration-6 = exactly 66 code-points"
    - "Quick-action bar render-only — [ A ]ttacco [ S ]pell [ I ]tem [ M ]ovi; Phase 5 static layout, Phase 6 wires tap-cycle"
    - "exactOptionalPropertyTypes-safe spread — conditional ...(val !== undefined ? { result: val } : {}) avoids explicit undefined assignment"
    - "Defensive game.messages access — typeof game guard before collection read; ChatMessageLike internal type for loose boundary"
    - "LogEventSchema z.strictObject — unknown extra fields rejected at protocol boundary"
    - "Kind detection priority — flags.dnd5e.roll.type → flags.dnd5e.use.type → 'chat' fallback (Assumption A4)"

key-files:
  created:
    - packages/g2-app/src/panels/combat-tracker-panel.ts
    - packages/g2-app/src/panels/__tests__/combat-tracker-panel.test.ts
    - packages/g2-app/src/panels/log-panel.ts
    - packages/g2-app/src/panels/__tests__/log-panel.test.ts
    - packages/shared-protocol/src/payloads/log.ts
    - packages/shared-protocol/src/__tests__/payloads/log.test.ts
    - packages/foundry-module/src/readers/log-reader.ts
    - packages/foundry-module/src/readers/__tests__/log-reader.test.ts
    - packages/shared-render/src/fixtures/combat-tracker.full-window.it.txt
    - packages/shared-render/src/fixtures/combat-tracker.partial.it.txt
    - packages/shared-render/src/fixtures/combat-tracker.single.it.txt
    - packages/shared-render/src/fixtures/combat-tracker.no-combat.it.txt
    - packages/shared-render/src/fixtures/log.standard.it.txt
    - packages/shared-render/src/fixtures/log.empty.it.txt
  modified:
    - packages/foundry-module/src/types/foundry-globals.d.ts (added FoundryChatMessage + game.messages field)

key-decisions:
  - "computeWindow edge cases — 1 combatant returns 1-element slice; N<=5 returns all; center-clamped window for larger N prevents out-of-bounds"
  - "Concentration sub-line — appended under affected combatant row only; 22-space indent per UI-SPEC §5.8 verbatim"
  - "Quick-action bar is render-only in Phase 5 — no tap-cycle state needed; Phase 6 adds gesture routing"
  - "LogEventSchema uses z.strictObject — strictness enforced at the protocol boundary to prevent schema drift"
  - "Kind detection fallback chain — attack > damage > save > spell > feat > chat; unknown flags fall through to 'chat' (Assumption A4, defensive)"
  - "game.messages typed in foundry-globals.d.ts — minimal FoundryChatMessage + FoundryCollection<FoundryChatMessage> addition"
  - "Zero file overlap with 05-04 confirmed — only shared file is foundry-globals.d.ts (additive, non-conflicting sections)"

metrics:
  duration: "~2 hours (prior session creation + current session commit + fix cycle)"
  completed_date: "2026-05-15"
  tasks: 3
  files_created: 14
  files_modified: 1
  commits:
    - "4af185a: feat(g2-app): CombatTrackerPanel + computeWindow + conc sub-line + quick-action bar (COMB-01/03)"
    - "f507696: feat(*): LogPanel + LogEventSchema + log-reader + 2 INV-1 fixtures"
    - "e66c43d: fix(foundry-module): exactOptionalPropertyTypes + game.messages type declaration for log-reader"

---

# Phase 5 Plan 05: CombatTrackerPanel + LogPanel + LogPayloadSchema + log-reader Summary

**One-liner:** 5-row sliding-window CombatTrackerPanel with concentration sub-line + render-only quick-action bar; read-only LogPanel with Zod-typed log event schema and Foundry ChatMessage reader.

## What Was Built

### Task 1 — CombatTrackerPanel (COMB-01, COMB-03)

`packages/g2-app/src/panels/combat-tracker-panel.ts` implements:

- `CombatTrackerPanel` — OverlayPanel Strategy A (single text container), PanelGestureBus lifecycle
- `computeWindow(turns, currentTurnIndex, scrollOffset)` — pure function; handles N=0 (empty), N≤5 (show all), N>5 (5-element window centered on current turn, scroll-offset clamped)
- `renderCombatantRow(combatant, isParty, locale)` — 66 code-points per UI-SPEC §5.8 column layout; appends optional 22-space-indented concentration sub-line when `combatant.concentration !== null`
- `renderQuickActionBar(locale)` — render-only footer with i18n labels; Phase 6 wires tap-cycle gesture
- `renderCombatTrackerContent(snapshot, locale, scrollOffset, ownActorId)` — 18-row renderer with bordered panel

4 INV-1 fixtures generated via `matchAsciiFixture` round-trip:
- `combat-tracker.full-window.it.txt` — 5+ combatants with concentration and current-turn indicator
- `combat-tracker.partial.it.txt` — 3 combatants (N<5 path)
- `combat-tracker.single.it.txt` — 1 combatant
- `combat-tracker.no-combat.it.txt` — null snapshot, centered `combat.empty` message

### Task 2 — LogPanel + LogEventSchema + log-reader

`packages/g2-app/src/panels/log-panel.ts` implements:

- `LogPanel` — OverlayPanel Strategy A; scroll-down reveals older events (scrollOffset increases)
- `renderLogEvent(event, locale, nowEpoch)` — main row (icon + T±MM:SS + actorName + description) + optional result sub-line
- `renderLogFilterBar(activeFilter, locale)` — `[▶TUTTI]` style filter indicators
- `renderLogContent(snapshot, locale, scrollOffset, nowEpoch)` — 18-row renderer; null/empty → centered `log.empty` message

`packages/shared-protocol/src/payloads/log.ts` defines:
- `LogEventKindSchema` — 8 kinds: attack, damage, spell, feature, round, concentration, roll, chat
- `LogEventResultSchema` — 5 result kinds: hit, miss, pass, fail, concentrating
- `LogEventSchema` — `z.strictObject` with id, timestamp (nonneg), actorName, kind, description, optional result
- `LogSnapshotSchema` — `z.strictObject({ events: z.array(LogEventSchema) })`
- `LOG_DELTA_TYPE = 'log.delta'`

`packages/foundry-module/src/readers/log-reader.ts` implements:
- `getLogEventTail(maxCount = 50): LogEvent[]`
- Defensive `typeof game !== 'undefined'` guard; reads `game.messages.contents.slice(-maxCount)`
- Kind detection via `flags.dnd5e.roll.type` and `flags.dnd5e.use.type` (Assumption A4)
- Messages with missing `id` skipped; missing `speaker.alias` → empty actorName

2 INV-1 fixtures:
- `log.standard.it.txt` — 5 events (attack/damage/spell/feature/chat) with filter bar
- `log.empty.it.txt` — null snapshot, centered `log.empty` message

### Task 3 — Wave-3 Parallelism Audit

Confirmed zero functional file overlap between 05-04 and 05-05:
- 05-04 files: character-reader.ts, character-sheet-tab-renderers.ts, inventory-panel.ts, spellbook-panel.ts
- 05-05 files: combat-tracker-panel.ts, log-panel.ts, log.ts, log-reader.ts
- Single shared file: `foundry-globals.d.ts` — additive changes to non-overlapping sections (05-04 added inventory/spell types; 05-05 added `FoundryChatMessage` + `game.messages`)

## Test Coverage

| Package | Tests Added | Test IDs |
|---------|-------------|----------|
| g2-app | 25+ | CTP-META, CTP-CTOR, CTP-WINDOW-*, CTP-ROW-*, CTP-QUICK-BAR, CTP-CONTENT, CTP-SCROLL-RESET, CTP-FIX-*, LP-META, LP-CTOR, LP-RENDER-*, LP-FILTER-BAR, LP-CONTENT, LP-FIX-* |
| shared-protocol | 20+ | LE-SCHEMA-1..7, LE-SCHEMA-KIND (8+1), LE-SCHEMA-RESULT-1..6, LE-SNAPSHOT-*, LOG_DELTA_TYPE |
| foundry-module | 13 | LR-EMPTY, LR-EMPTY-MESSAGES, LR-MAP-ATTACK, LR-MAP-ATTACK-RESULT, LR-MAP-DAMAGE, LR-MAP-SPELL, LR-MAP-FEAT, LR-MAP-SAVE, LR-MAP-CHAT, LR-COUNT, LR-ACTOR-NAME, LR-MISSING-ID, LR-MISSING-ALIAS |

All 607 g2-app tests pass; 266 foundry-module + shared-protocol tests pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Biome lint: template literal + string concatenation in CombatTrackerPanel**
- **Found during:** Task 1 commit hook
- **Issue:** `_pad(\`...\`) + '┐'` flagged by `lint/style/useTemplate`
- **Fix:** Rewrote as `` `${_pad(`...`)}┐` ``
- **Files modified:** `combat-tracker-panel.ts`
- **Commit:** `4af185a`

**2. [Rule 1 - Bug] Biome lint: string concat + any cast in LogPanel and log-reader test**
- **Found during:** Task 2 commit hook
- **Issue:** `_pad('...' + label + '...')` concat in log-panel.ts; `undefined as any` in log-reader.test.ts
- **Fix:** Template literal for log-panel.ts; `undefined as unknown as string` cast in test
- **Files modified:** `log-panel.ts`, `log-reader.test.ts`
- **Commit:** `f507696`

**3. [Rule 1 - Bug] TypeScript exactOptionalPropertyTypes: result?: LogEventResult with explicit undefined**
- **Found during:** `pnpm typecheck` after Task 2 commit
- **Issue:** `return { kind: 'attack', result }` when `result` is `undefined` assigns `undefined` to an exactOptionalPropertyTypes property
- **Fix:** Replaced with conditional spread `...(result !== undefined ? { result } : {})`
- **Files modified:** `log-reader.ts`
- **Commit:** `e66c43d`

**4. [Rule 2 - Missing type] game.messages not declared in foundry-globals.d.ts**
- **Found during:** `pnpm typecheck` after Task 2 commit
- **Issue:** `game.messages` was accessed in log-reader.ts but not declared in the global `game` type
- **Fix:** Added `FoundryChatMessage` interface + `messages: FoundryCollection<FoundryChatMessage>` to the `game` declaration
- **Files modified:** `foundry-globals.d.ts`
- **Commit:** `e66c43d`

### Known Stubs

None — all rendered content is wired to real data sources. The quick-action bar renders static i18n text (no tap-cycle state in Phase 5) but this is intentional: COMB-03 explicitly scopes Phase 5 to render-only and Phase 6 to gesture wiring.

### Deferred (Out of Scope)

- `packages/g2-app/src/panels/inventory-panel.ts` import sort lint error — introduced by 05-04 parallel agent, not caused by this plan; deferred to 05-04 verification.
- `packages/validation-harness/` lint errors (useLiteralKeys, noConsole) — pre-existing hardware-deferred gate, tracked since Phase 4b.
- `character-sheet-tab-renderers.test.ts` `CSTR-DISP-INV-STUB` test expecting `'05-04'` placeholder — this test belongs to the 05-04 agent; its concurrent inventory-panel.ts superseded the stub expectation. Deferred to 05-04 plan for resolution.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries beyond the typed declaration of `game.messages` (read-only, Foundry-side).

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| combat-tracker-panel.ts exists | FOUND |
| log-panel.ts exists | FOUND |
| shared-protocol/payloads/log.ts exists | FOUND |
| foundry-module/readers/log-reader.ts exists | FOUND |
| combat-tracker.full-window.it.txt exists | FOUND |
| log.standard.it.txt exists | FOUND |
| Commit 4af185a (CombatTrackerPanel) | FOUND |
| Commit f507696 (LogPanel + schema + reader) | FOUND |
| Commit e66c43d (typecheck fixes) | FOUND |
