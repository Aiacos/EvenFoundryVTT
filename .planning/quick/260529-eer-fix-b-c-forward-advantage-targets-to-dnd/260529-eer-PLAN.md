---
quick_id: 260529-eer
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
branch: develop
autonomous: true
requirements: [FIX-B-advantage-forward, FIX-C-targets-forward]
files_modified:
  - packages/foundry-module/src/types/foundry-globals.d.ts
  - packages/foundry-module/src/write-path/handlers/weapon-attack.ts
  - packages/foundry-module/src/write-path/handlers/cast-spell.ts
  - packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts
  - packages/foundry-module/src/write-path/handlers/cast-spell.test.ts
  - .changeset/260529-eer-forward-advantage-targets.md

must_haves:
  truths:
    - "When MidiQOL is active, a weapon attack with advantage='advantage' drives MidiQOL.completeActivityUse with midiOptions.advantage=true"
    - "When MidiQOL is active, a weapon attack with explicit targets drives MidiQOL.completeActivityUse with midiOptions.targetUuids=args.targets"
    - "When MidiQOL is active, a spell cast with explicit targets drives MidiQOL.completeActivityUse with midiOptions.targetUuids=args.targets (slot override preserved)"
    - "When MidiQOL is absent, the handler behaves EXACTLY as today (activity.use with consume.action economy preserved) — it does NOT call rollAttack and does NOT register any roll hook"
    - "When MidiQOL is absent and advantage!=='normal' OR targets were requested, the handler console.warn's exactly once that advantage/target auto-application requires MidiQOL (never silently dropped, never sets game.user.targets, never double-rolls)"
    - "Backward-compat: advantage='normal' + empty targets behaves EXACTLY as today (activity.use with consume.action economy preserved)"
  artifacts:
    - path: "packages/foundry-module/src/write-path/handlers/weapon-attack.ts"
      provides: "MidiQOL-vs-vanilla capability split for advantage + targets"
      contains: "completeActivityUse"
    - path: "packages/foundry-module/src/write-path/handlers/cast-spell.ts"
      provides: "MidiQOL-vs-vanilla targets forward for spells"
      contains: "completeActivityUse"
    - path: "packages/foundry-module/src/types/foundry-globals.d.ts"
      provides: "game.modules + possibly-undefined MidiQOL global type surface"
      contains: "completeActivityUse"
  key_links:
    - from: "weapon-attack.ts / cast-spell.ts"
      to: "game.modules.get('midi-qol')?.active"
      via: "runtime capability detection (guarded by typeof MidiQOL !== 'undefined')"
      pattern: "midi-qol"
    - from: "weapon-attack.ts / cast-spell.ts"
      to: "MidiQOL.completeActivityUse"
      via: "MidiQOL present branch"
      pattern: "completeActivityUse"
---

<objective>
Fix B + Fix C: forward the already-validated `advantage` and `targets` protocol
fields into the dnd5e workflow. Today both fields pass Zod validation but reach
a dead end — neither handler reads them, so they have ZERO effect on the actual
roll.

- `WeaponAttackInputSchema.advantage` ('normal'|'advantage'|'disadvantage') — packages/shared-protocol/src/tools/weapon-attack.ts:34
- `WeaponAttackInputSchema.targets` (string[]) — packages/shared-protocol/src/tools/weapon-attack.ts:33
- `CastSpellInputSchema.targets` (string[]) — packages/shared-protocol/src/tools/cast-spell.ts:30

Purpose: an attack/cast that the player explicitly marked as advantage, or
explicitly aimed at targets, must actually roll that way against those tokens —
WHEN the automation layer (MidiQOL) is present. Closing this gap makes the R1
advantage toggle + target selector functional under MidiQOL, and honest (single
warn, zero behavior regression) when MidiQOL is absent.

Output: a capability-split implementation in both write-path handlers (MidiQOL
clean path vs vanilla unchanged-behavior-with-warn path), a minimal type surface
for the new globals, extended TDD tests, and a changeset.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Source schemas (fields to forward)
@packages/shared-protocol/src/tools/weapon-attack.ts
@packages/shared-protocol/src/tools/cast-spell.ts

# Handlers to modify (full current source)
@packages/foundry-module/src/write-path/handlers/weapon-attack.ts
@packages/foundry-module/src/write-path/handlers/cast-spell.ts

# Existing tests to EXTEND (not break)
@packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts
@packages/foundry-module/src/write-path/handlers/cast-spell.test.ts

# Type surface to extend
@packages/foundry-module/src/types/foundry-globals.d.ts

<verified_research>
INV-2 verified against dnd5e release-5.3.3 source + MidiQOL docs. DO NOT re-litigate.

1. `activity.use(usage={}, dialog={}, message={})` has NO advantage/disadvantage/target
   field. It consumes resources + posts a chat card; it does NOT roll the attack.
   (mixin.mjs, _types.mjs @ release-5.3.3)
2. CONCLUSION (research Q3): vanilla dnd5e cannot headlessly auto-apply advantage to a
   card-based roll without a human clicking the posted card. Adding a standalone
   `rollAttack` alongside `use()` produces an unclicked card PLUS a loose roll — a
   non-deterministic DOUBLE-EXECUTION hazard that violates EVF's deterministic-core
   value. We therefore do NOT roll in the vanilla branch: MidiQOL is the automation
   layer that owns advantage/target auto-application. Advantage is genuinely forwarded
   ONLY in the MidiQOL-present branch.
3. Targets: vanilla reads ONLY `game.user.targets` (per-user, getTargetDescriptors
   in utils.mjs). In executeAsGM context `game.user` is the GM → mutating
   game.user.targets is the DOCUMENTED v13 per-user pitfall (PITFALLS.md:541).
   Vanilla has NO explicit-target injection. We therefore WARN, never mutate.
4. MidiQOL path (clean): `await MidiQOL.completeActivityUse(activity, { midiOptions:
   { targetUuids: string[], advantage: boolean, disadvantage: boolean } }, { configure:
   false }, { create: true })` — drives full attack→damage→save→apply against explicit
   targets WITHOUT touching game.user.targets. Returns a Workflow object.
5. MidiQOL field name: `midiOptions.targetUuids` (string UUID array — MACROS.md).
   `targetsToUse` is secondary; do not use. INV-2 verified ONLY that completeActivityUse
   receives `midiOptions.targetUuids` + `advantage`/`disadvantage` correctly. The
   top-level `consume:{action}` usage field driving Extra-Attack action economy under
   MidiQOL is NOT INV-2-verified — it is passed through as today but is a
   hardware-deferred verification item (real economy resolution is part of the live
   MidiQOL workflow, already SC-07-01/02/03 deferred). Tests must NOT over-assert it.
6. Detection (hardened): `typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active === true`.
   The MidiQOL global can be undefined even when the module is active-but-not-yet-
   initialized — both checks are required before dereferencing.
</verified_research>

<interfaces>
<!-- Existing FoundryActivity type (foundry-globals.d.ts:400-424): -->
interface FoundryActivity {
  type: string;
  use(config?: { configure?: boolean; consume?: { action?: boolean } }): Promise<unknown>;
}

<!-- Existing game global already exposes: actors, settings, i18n, combat, messages,
     packs, scenes, user, users. game.modules is NOT yet declared. -->

<!-- The vanilla branch keeps EXACTLY today's activity.use behavior — NO rollAttack,
     NO Hooks registration. No new Hooks surface is needed for this change. -->
</interfaces>

<constraints>
- ADR-0011 / CI Gate 8 (ci.yml:72-87): the single-workflow-origin grep scans ONLY
  packages/g2-app + packages/bridge for `activity.use(`. MidiQOL.completeActivityUse
  and activity.use all live in foundry-module/handlers → compliant. DO NOT introduce
  ANY activity.use / completeActivityUse call site in g2-app or bridge.
- CI Gate 8 socketlib handler count = 17 — this change touches NO socketlib handlers.
  Must stay 17 at exit.
- INV-4: clean, zero dead code, JSDoc on every new helper, no unlinked `// TODO`.
- All gates green at exit: pnpm typecheck, pnpm lint:ci, pnpm test.
- TDD mandatory: RED tests FIRST. Extend the two existing test files; do not break
  the existing happy-path / error-code cases.
</constraints>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (RED): extend handler tests for capability-split advantage + targets</name>
  <files>packages/foundry-module/src/write-path/handlers/weapon-attack.test.ts, packages/foundry-module/src/write-path/handlers/cast-spell.test.ts</files>
  <behavior>
    Add to weapon-attack.test.ts (extend the existing makeGameGlobal helper to accept
    a `midiActive: boolean` option that sets `game.modules.get('midi-qol')` →
    `{ active: midiActive }`; default false so all existing cases stay green):

    MidiQOL-PRESENT branch:
    - Test M1: midiActive=true, advantage='advantage', targets=['tok-a','tok-b'] →
      a stubbed `globalThis.MidiQOL.completeActivityUse` is called once with first arg
      = the activity, and second arg whose `midiOptions` deep-equals
      `{ targetUuids: ['tok-a','tok-b'], advantage: true, disadvantage: false }`.
      Assert `activity.use` was NOT called.
    - Test M2: midiActive=true, advantage='disadvantage' → midiOptions.advantage=false,
      midiOptions.disadvantage=true.
    - Test M3 (count>1 under MidiQOL): midiActive=true, count=2 → completeActivityUse
      called twice, EACH carrying the correct midiOptions (targetUuids + advantage/
      disadvantage). ASSERT ONLY the INV-2-verified midiOptions fields. Do NOT assert
      the top-level `consume.action` economy field per call — that is hardware-deferred
      (research §5). The impl still passes consume through as today, but the test does
      not over-assert an unverified field.

    MidiQOL-ABSENT branch (behavior is EXACTLY today's — no roll, no hook):
    - Test V1: midiActive=false, advantage='advantage', targets=[] → `activity.use`
      called EXACTLY as today (single call, `{ configure:false, consume:{action:true} }`)
      AND a single `console.warn` fires whose message mentions advantage + "MidiQOL"/
      "midi-qol". CRITICALLY assert `activity.rollAttack` is NEVER invoked (the activity
      factory MUST expose a `rollAttack: vi.fn()` spy so the assertion is meaningful) and
      NO `dnd5e.preRollAttackV2` hook is registered (assert Hooks.on was not called with
      that event). This case goes RED against any implementation that tries to double-roll.
    - Test V2: midiActive=false, targets=['tok-a'] (advantage='normal') → a single
      `console.warn` whose message mentions targets + MidiQOL/"midi-qol"; `activity.use`
      called exactly as today; `activity.rollAttack` NEVER invoked; `game.user.targets`
      NEVER mutated (assert the Set stays size 0).

    BACKWARD-COMPAT:
    - Test B1: midiActive=false, advantage='normal', targets=[] (the existing happy
      path) → behaves EXACTLY as the current passing test: activity.use with
      consume.action:true, NO rollAttack call, NO console.warn, NO completeActivityUse.

    Add to cast-spell.test.ts (same makeGameGlobal midiActive extension):
    - Test CM1: midiActive=true, targets=['tok-a'], slot_level=3 → completeActivityUse
      called once with midiOptions.targetUuids=['tok-a'] AND the spell slot override
      `spell:{slot:'spell3'}` merged into midiOptions (preserve existing slot logic);
      activity.use NOT called; conc-conflict pre-check still runs first.
    - Test CV1: midiActive=false, targets=['tok-a'], slot_level=0 → activity.use called
      with `{configure:false}` (no slot override for cantrip) AND a single console.warn
      mentioning targets + MidiQOL; game.user.targets NEVER mutated.
    - Test CB1 (backward-compat): midiActive=false, targets=[], slot_level=3 → exactly
      today's behavior: activity.use with `{configure:false, spell:{slot:'spell3'}}`,
      no warn, no completeActivityUse.
    - Verify conc-conflict path still returns 'concentration-required' before any
      MidiQOL/use call (extend existing conc test with midiActive=true to prove the
      pre-check is unconditional).
  </behavior>
  <action>
    Extend (do NOT rewrite) both test files. Reuse the existing makeActor/makeItem/
    makeWeaponItem/makeActivity helpers; add a `rollAttack: vi.fn()` spy to the weapon
    activity factory (so V1/V2 can assert rollAttack is NEVER called) and a `midiActive`
    param to makeGameGlobal that injects
    `modules: { get: vi.fn((id) => id === 'midi-qol' ? { active: midiActive } : undefined) }`.
    For MidiQOL-present cases stub the global per-test via
    `vi.stubGlobal('MidiQOL', { completeActivityUse: vi.fn().mockResolvedValue({}) })`;
    for MidiQOL-absent cases stub it as `vi.stubGlobal('MidiQOL', undefined)` to prove
    the `typeof MidiQOL !== 'undefined'` guard holds. `vi.unstubAllGlobals()` in afterEach.
    Spy on console.warn via vi.spyOn. If the impl uses a Hooks global, stub it so V1 can
    assert Hooks.on was NOT called with 'dnd5e.preRollAttackV2' (no hook registration in
    the vanilla branch). Run the suite — the new cases MUST fail (RED) because the
    handlers do not yet read advantage/targets. Existing cases MUST still pass.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module test -- weapon-attack cast-spell 2>&1 | tail -40 # new cases FAIL (RED), existing PASS</automated>
  </verify>
  <done>New MidiQOL-present, MidiQOL-absent (use-only + warn + rollAttack-never), and backward-compat cases exist and fail for the right reason (fields not yet forwarded); all pre-existing cases still pass.</done>
</task>

<task type="auto">
  <name>Task 2: add minimal type surface (game.modules + possibly-undefined MidiQOL)</name>
  <files>packages/foundry-module/src/types/foundry-globals.d.ts</files>
  <action>
    Extend the type surface minimally (INV-4 — declare only what is used):

    1. Add `modules` to the `declare const game` object (around line 997-1032):
       `modules: { get(id: string): { active: boolean } | undefined };`
       with JSDoc: capability detection for optional module deps (midi-qol).

    2. Add a module-scoped POSSIBLY-UNDEFINED MidiQOL global (place near the
       `declare const socketlib` block ~line 131). Declared possibly-undefined because
       the global can be undefined even when the module is active-but-not-yet-initialized;
       the runtime `typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active`
       guard is the source of truth and only dereferences inside the guarded branch:
       ```
       declare const MidiQOL:
         | {
             completeActivityUse(
               activity: FoundryActivity,
               usage?: { midiOptions?: Record<string, unknown> } & Record<string, unknown>,
               dialog?: { configure?: boolean },
               message?: { create?: boolean },
             ): Promise<unknown>;
           }
         | undefined;
       ```
       JSDoc: MidiQOL is an optional Foundry module (gitlab.com/tposney/midi-qol),
       NOT on npm; possibly-undefined even when active-but-not-initialized; presence
       detected via `typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active`;
       midiOptions.targetUuids/advantage/disadvantage drive the full workflow against
       explicit targets without touching game.user.targets (research §4/§5/§6).

    Do NOT widen any other type. Keep `FoundryActivity.use` signature unchanged and do
    NOT add a `rollAttack` declaration — the vanilla branch never calls rollAttack.
  </action>
  <verify>
    <automated>pnpm typecheck 2>&1 | tail -20</automated>
  </verify>
  <done>typecheck passes; game has modules, MidiQOL global declared possibly-undefined. No rollAttack declaration. No unused declarations.</done>
</task>

<task type="auto">
  <name>Task 3 (GREEN): implement capability split in both handlers</name>
  <files>packages/foundry-module/src/write-path/handlers/weapon-attack.ts, packages/foundry-module/src/write-path/handlers/cast-spell.ts</files>
  <action>
    Implement the forwarding so Task 1 tests go GREEN. Add a small handler-local helper
    (do not over-abstract across files) and JSDoc each.

    Add a module-local helper `isMidiQolActive(): boolean` to each handler that returns
    `typeof MidiQOL !== 'undefined' && game.modules.get('midi-qol')?.active === true`.
    JSDoc it: the global can be undefined even when the module is active-but-not-yet-
    initialized, so BOTH the typeof check and the game.modules check are required before
    any dereference (research §6).

    weapon-attack.ts — replace the loop body (currently weapon-attack.ts:144-166).
    Compute `const useMidi = isMidiQolActive();` once before the loop. Per iteration i:
      - MidiQOL PRESENT branch:
        ```
        // action economy preserved: consume the action only on the first iteration
        await MidiQOL!.completeActivityUse(
          activity,
          {
            midiOptions: {
              targetUuids: args.targets,
              advantage: args.advantage === 'advantage',
              disadvantage: args.advantage === 'disadvantage',
            },
            consume: { action: i === 0 },   // preserve Extra-Attack action economy (i===0 only)
          },
          { configure: false },
          { create: true },
        );
        ```
        DESIGN DECISION (document inline): pass `consume.action` via the usage config so
        the existing i===0 action-economy semantics are preserved 1:1 under MidiQOL. NOTE:
        whether MidiQOL honors this top-level consume field for Extra-Attack economy is
        NOT INV-2-verified — it is hardware-deferred (research §5). Extract the chatCardId
        from the resolved Workflow result via the existing extractChatCardId helper
        (defensive — Workflow may not expose `.id`; null is fine).
      - MidiQOL ABSENT branch (preserve EXACTLY today's behavior — NO roll, NO hook):
        Keep the current call UNCHANGED:
        `const result = await activity.use({ configure: false, consume: { action: i === 0 } });`
        DO NOT call rollAttack and DO NOT register any dnd5e.preRollAttackV2 hook.
        DESIGN DECISION (document inline): vanilla dnd5e cannot headlessly auto-apply
        advantage to a card-based roll without a human clicking the posted card; adding a
        standalone rollAttack alongside use() would produce an unclicked card PLUS a loose
        roll — a non-deterministic double-execution hazard that violates EVF's
        deterministic-core value. MidiQOL is the automation layer (research §2). When
        `args.advantage !== 'normal'` OR `args.targets.length > 0`, emit a SINGLE honest
        `console.warn` (guard with a boolean so the multi-attack loop warns at most once)
        stating that advantage/target auto-application requires MidiQOL. NEVER set
        game.user.targets.
      Keep the existing _progressEmitter call, attacks[] accumulation, isNoGmError
      normalization, and the final `{ attackId, attacks }` return UNCHANGED.

    cast-spell.ts — single use (no loop). Keep Step 1-3.5 (resolve + conc-conflict
    pre-check) and the slotOverride computation (cast-spell.ts:169-172) UNCHANGED.
    Replace the Step-4 try/catch body (cast-spell.ts:173-181):
      - MidiQOL PRESENT branch:
        ```
        const result = await MidiQOL!.completeActivityUse(
          activity,
          { midiOptions: { targetUuids: args.targets, ...slotOverride } },
          { configure: false },
          { create: true },
        );
        return { success: true, data: { chatCardId: extractChatCardId(result) } };
        ```
        (slotOverride is `{}` for cantrips or `{ spell: { slot: 'spellN' } }` — merge
        into midiOptions so the existing slot semantics are preserved.)
      - MidiQOL ABSENT branch (preserve EXACT current behavior):
        `const result = await activity.use({ configure: false, ...slotOverride });`
        then return chatCardId as today. When `args.targets.length > 0`, `console.warn`
        ONCE that targets require MidiQOL. NEVER set game.user.targets. cast-spell has NO
        advantage field — only forward targets.
      Keep the isNoGmError normalization in the catch UNCHANGED.

    Use non-null `MidiQOL!` only inside the branch already guarded by isMidiQolActive()
    (runtime guarantees defined). JSDoc both new helpers and the capability-split
    rationale. Zero dead code; no unlinked TODO.
  </action>
  <verify>
    <automated>pnpm --filter @evf/foundry-module test -- weapon-attack cast-spell 2>&1 | tail -20 # all GREEN</automated>
  </verify>
  <done>All Task 1 cases pass (MidiQOL-present completeActivityUse, MidiQOL-absent use-only + single warn + rollAttack-never, backward-compat). Existing error-code + happy-path cases still pass.</done>
</task>

<task type="auto">
  <name>Task 4: docstrings sync, changeset, full-gate green</name>
  <files>packages/foundry-module/src/write-path/handlers/weapon-attack.ts, packages/foundry-module/src/write-path/handlers/cast-spell.ts, .changeset/260529-eer-forward-advantage-targets.md</files>
  <action>
    1. Update the file-header JSDoc of both handlers to describe the capability split
       (MidiQOL present → completeActivityUse with explicit targets/advantage; absent →
       UNCHANGED activity.use + single honest console.warn that advantage/target
       auto-application requires MidiQOL — NO rollAttack, NO roll hook). Remove any
       now-stale phrasing implying advantage/targets are unused. Cite research §1-6.
    2. Create the changeset. Bump type = PATCH (behavioral fix wiring already-public
       schema fields into the workflow; no NEW public API surface added — per the
       GitFlow release pipeline + the user's patch-unless-new-public-API guidance).
       Package: `@evf/foundry-module` patch. (shared-protocol schemas are unchanged —
       only their docstrings already mention MidiQOL — so NO shared-protocol bump.)
       Body summary: "forward weapon-attack advantage + weapon/spell targets to the
       dnd5e workflow via MidiQOL.completeActivityUse when present; honest single
       console.warn (no behavior change, no double-roll) when MidiQOL is absent."
    3. Run the full gate suite (typecheck, lint:ci, full test) — all green.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint:ci && pnpm test 2>&1 | tail -25 && pnpm changeset:status 2>&1 | tail -10</automated>
  </verify>
  <done>typecheck + lint:ci + full test suite all green; changeset declared (@evf/foundry-module patch); handler docstrings reflect the capability split.</done>
</task>

</tasks>

<deviation_note>
## Risk / Deviation: vanilla advantage + targets are NOT auto-applied (Fix B + C, MidiQOL absent)

dnd5e vanilla provides NO mechanism to headlessly auto-apply advantage OR inject
explicit attack/spell targets programmatically in the executeAsGM socketlib context:

- Targets: `getTargetDescriptors` reads ONLY `game.user.targets`, which is the GM user
  here (PITFALLS.md:541, research §3). Mutating it is the documented v13 per-user pitfall
  and would corrupt the GM's live selection.
- Advantage: `activity.use()` only posts a chat card; it does NOT roll. Adding a
  standalone `rollAttack` alongside it would create an unclicked card PLUS a loose
  roll — a non-deterministic double-execution hazard that violates EVF's
  deterministic-core value (research §2). We therefore do NOT roll in the vanilla branch.

In the MidiQOL-absent path we keep EXACTLY today's `activity.use` behavior and emit a
single honest `console.warn` when advantage!=='normal' or targets were requested — no
behavior regression, only the absence-of-improvement is surfaced loudly instead of
silently, and zero double-roll risk. Full advantage + explicit-target resolution requires
MidiQOL; this is a documented platform constraint, not a design shortcut (mirrors
CLAUDE.md §4.8 MidiQOL-optional capability handshake; research Q3 concluded MidiQOL is
effectively required for the auto-application path).
</deviation_note>

<verification>
## Exit gates (all MUST be green)

1. `pnpm typecheck` — exit 0 (new type surface compiles; no unused decls).
2. `pnpm lint:ci` — exit 0 (Biome; JSDoc on new helpers; zero dead code; no unlinked TODO).
3. `pnpm test` — exit 0. Baseline 2713 (post Fix A). EXPECT a net increase from the
   new cases (≈ +9 to +12: M1-M3, V1-V2, B1 in weapon-attack; CM1, CV1, CB1 + conc
   guard in cast-spell). Record exact delta in SUMMARY.

## Invariant gates

4. CI Gate 8 single-workflow-origin: `grep -rnE 'activity\.use\(' packages/g2-app
   packages/bridge --include="*.ts"` (post-filtered for comments) returns EMPTY.
   completeActivityUse / use stay in foundry-module/handlers → compliant.
5. CI Gate 8 socketlib handler count = 17 — UNCHANGED (no socketlib handler touched).
   Confirm: `grep -rc "registerComplexHandler" packages/foundry-module/src` total stays 17.
6. `pnpm changeset:status` — one changeset declared since develop (@evf/foundry-module patch).

## Hardware-deferred carry-forward (NEVER blocks autonomous)

The REAL MidiQOL full attack→damage→save→apply workflow resolution against live tokens —
INCLUDING the top-level `consume:{action}` Extra-Attack action-economy behavior under
MidiQOL (research §5, NOT INV-2-verified) — is HARDWARE-DEFERRED (carry-forward of
SC-07-01/02/03, already deferred). Software tests MOCK `MidiQOL.completeActivityUse` and
assert ONLY the INV-2-verified `midiOptions.targetUuids` + `advantage`/`disadvantage`
fields; they do NOT exercise a live MidiQOL/Foundry session and do NOT over-assert the
unverified per-iteration action-economy field. Per the established defer-hardware pattern,
this verification gap is carried forward and does not block this task's completion.
</verification>

<success_criteria>
- advantage + targets now reach the dnd5e workflow (no longer dead-validated fields) WHEN
  MidiQOL is present.
- MidiQOL present: completeActivityUse driven with correct midiOptions
  (targetUuids/advantage/disadvantage) for both handlers.
- MidiQOL absent: EXACTLY today's activity.use behavior preserved — NO rollAttack, NO roll
  hook, NO double-execution; a single honest console.warn surfaces that advantage/target
  auto-application requires MidiQOL; game.user.targets NEVER mutated.
- Backward-compat: advantage='normal' + empty targets unchanged in both handlers.
- All 3 build gates green; Gate 8 socketlib=17 preserved; changeset declared.
- Hardware-deferred carry-forward (incl. unverified MidiQOL action-economy field) documented in SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/260529-eer-fix-b-c-forward-advantage-targets-to-dnd/260529-eer-SUMMARY.md` when done.
Commit atomically (Conventional Commits, Co-Authored-By trailer) on branch `develop`.
</output>
