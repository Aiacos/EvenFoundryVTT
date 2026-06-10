---
phase: 260610-nzl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/g2-app/src/engine/container-registry.ts
  - packages/g2-app/src/engine/__tests__/container-registry.test.ts
  - packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts
autonomous: true
requirements:
  - G2-SPEC-CAPTURE-CONTENT
  - G2-SPEC-EXACTLY-ONE-CAPTURE

must_haves:
  truths:
    - "hud-capture TextContainerProperty in buildHudRasterPageSchema carries content: ' ' (non-empty, single space)"
    - "buildStatusViewTextContainers returns exactly one isEventCapture=1 container (status-hud, id 6) with content: ' '"
    - "The CONTAINER_REGISTRY status-hud entry retains isEventCapture: 0 (registry is geometry-only; the builder overrides per-schema)"
    - "buildBaseTextContainers REG-4 still passes: map-capture (id 7) remains the one registry-level capture"
    - "All g2-app tests pass (corepack pnpm --filter @evf/g2-app test)"
  artifacts:
    - path: "packages/g2-app/src/engine/container-registry.ts"
      provides: "buildHudRasterPageSchema with content on hud-capture; buildStatusViewTextContainers with isEventCapture:1 + content override on status-hud"
    - path: "packages/g2-app/src/engine/__tests__/container-registry.test.ts"
      provides: "SPEC-CAPTURE-1 and SPEC-GLYPH-CAPTURE-1 test cases; updated assertions for new behaviour"
    - path: "packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts"
      provides: "PL-2 corrected to assert exactly one capture in boot schema"
  key_links:
    - from: "buildHudRasterPageSchema (hud-capture TextContainerProperty)"
      to: "Even Hub SDK spec: Image-Based App Pattern"
      via: "content: ' ' field on TextContainerProperty"
      pattern: "content.*' '"
    - from: "buildStatusViewTextContainers (status-hud override)"
      to: "G2 spec: exactly one isEventCapture per page"
      via: "per-schema override in builder (not registry mutation)"
      pattern: "isEventCapture.*1"
---

<objective>
Two G2 hardware-spec compliance fixes in packages/g2-app/src/engine/container-registry.ts.

FIX 1: The EvenHub Image-Based App Pattern mandates that any TextContainerProperty with
isEventCapture=1 must carry content: ' ' (single space — cannot be empty; protobuf omits
absent optional fields, leaving empty content on the host). buildHudRasterPageSchema()
builds the hud-capture TextContainerProperty without content → empty content on hardware.
Add content: ' ' to the hud-capture construction.

FIX 2: The G2 spec requires exactly one isEventCapture=1 container per page. The glyph
fallback path (buildStatusViewTextContainers / buildBootPageSchema) currently produces zero
capture containers — dead input on hardware. Fix by overriding isEventCapture to 1 and
adding content: ' ' on the status-hud entry INSIDE the builder, without touching the
registry (registry stays isEventCapture: 0 for status-hud; per-schema override is documented
with a reason comment: map-capture historically caused a host conflict when two captures
coexisted; keep the registry as geometry-only source of truth).

Purpose: Hardware-correct G2 gesture routing on both the canvas page (hud-capture) and the
glyph fallback page (status-hud acting as the single capture target).

Output: Patched container-registry.ts + updated/extended test assertions that encode the new
compliant behaviour as the canonical truth.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/g2-app/src/engine/container-registry.ts
@packages/g2-app/src/engine/__tests__/container-registry.test.ts
@packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add content: ' ' to hud-capture and add glyph-page capture to buildStatusViewTextContainers</name>
  <files>packages/g2-app/src/engine/container-registry.ts</files>
  <behavior>
    - SPEC-CAPTURE-1: buildHudRasterPageSchema textObject[0] (hud-capture) has content === ' ' (single space string, not undefined)
    - SPEC-GLYPH-CAPTURE-1: buildStatusViewTextContainers returns exactly one entry with isEventCapture === 1; that entry has containerName === 'status-hud', containerID === 6, and content === ' '
    - SPEC-GLYPH-CAPTURE-2: buildStatusViewTextContainers returns exactly 3 entries total (header, footer, status-hud — count unchanged)
    - REG-4 regression: buildBaseTextContainers still has EXACTLY ONE isEventCapture=1 entry and it is map-capture (id 7) — the registry is NOT changed
    - SPEC-REGISTRY-UNCHANGED: CONTAINER_REGISTRY['status-hud'].isEventCapture === 0 (registry value must not be mutated)
  </behavior>
  <action>
    Edit buildHudRasterPageSchema() in container-registry.ts — in the TextContainerProperty constructor call for hud-capture (around line 470), add `content: ' '` as a field. The SDK field name is `content` (string). Place it after `isEventCapture: 1`. Add a comment: "// content: ' ' required — spec: event-capture container cannot have empty content (protobuf omits absent optional field)".

    Edit buildStatusViewTextContainers() in container-registry.ts — the function currently maps CONTAINER_REGISTRY entries directly (line 566-582), inheriting isEventCapture: 0 for all three containers. Change the map to use a per-container override: when the registry name is 'status-hud', construct the TextContainerProperty with isEventCapture: 1 and content: ' ' overriding the registry value; all other containers keep their registry isEventCapture value and no content field. Add a block comment before the override explaining: "status-hud is the SINGLE capture target for the glyph fallback page (G2 spec: exactly one isEventCapture=1 per page). The registry retains isEventCapture:0 because including map-capture (also isEventCapture:1, same geometry) in the same schema caused a G2 host capture-conflict in quick-260605-j0t. The builder overrides per-schema; do NOT change the registry value."

    Do NOT touch the CONTAINER_REGISTRY object literal. Do NOT change any other builder functions. Do NOT touch src/scene-input.ts or src/hud/map-canvas-layer.ts.
  </action>
  <verify>
    <automated>corepack pnpm exec biome ci packages/g2-app/src/engine/container-registry.ts</automated>
  </verify>
  <done>
    buildHudRasterPageSchema hud-capture TextContainerProperty has content: ' ';
    buildStatusViewTextContainers returns status-hud with isEventCapture: 1 and content: ' ';
    CONTAINER_REGISTRY['status-hud'].isEventCapture is still 0;
    biome ci passes on the file with no new errors.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Update and extend tests to encode the new compliant behaviour</name>
  <files>
    packages/g2-app/src/engine/__tests__/container-registry.test.ts,
    packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts
  </files>
  <behavior>
    - SPEC-CAPTURE-1 test in container-registry.test.ts: buildHudRasterPageSchema textObject[0].content === ' '
    - SPEC-GLYPH-CAPTURE-1 test: buildStatusViewTextContainers has exactly one isEventCapture===1, it is status-hud (id 6), content === ' '
    - SPEC-GLYPH-CAPTURE-2 test: buildStatusViewTextContainers still returns 3 entries
    - REG-4 stays GREEN (registry map-capture is still the ONE registry-level capture; test must NOT change)
    - PL-2 in page-lifecycle.test.ts must be updated: the assertion "NO isEventCapture=1 containers" is now WRONG — the default boot schema has exactly one capture (status-hud). Update PL-2 to assert: exactly one isEventCapture=1 container in the boot schema, and it is status-hud (id 6). Keep the test name PL-2 or rename to "PL-2: default boot schema has EXACTLY ONE isEventCapture=1 container (status-hud)".
  </behavior>
  <action>
    In container-registry.test.ts, ADD these new test cases inside a new describe block named 'G2 spec compliance — capture content':
      - 'SPEC-CAPTURE-1: buildHudRasterPageSchema hud-capture has content single-space': call buildHudRasterPageSchema(), get textObject[0], assert content === ' '.
      - 'SPEC-GLYPH-CAPTURE-1: buildStatusViewTextContainers has exactly one isEventCapture=1 (status-hud, id 6) with content single-space': call buildStatusViewTextContainers(), filter isEventCapture===1, assert length 1, name 'status-hud', id 6, content ' '.
      - 'SPEC-GLYPH-CAPTURE-2: buildStatusViewTextContainers returns 3 entries total': assert length 3.
      - 'SPEC-REGISTRY-UNCHANGED: CONTAINER_REGISTRY status-hud isEventCapture is still 0 (builder overrides per-schema, registry is geometry-only)': import CONTAINER_REGISTRY (already importable), assert CONTAINER_REGISTRY['status-hud'].isEventCapture === 0.

    ALSO import buildStatusViewTextContainers from '../container-registry.js' in the test file if not already imported (currently it is NOT imported — check the import list at line 26-32 and add it).

    In page-lifecycle.test.ts, EDIT the existing PL-2 test (around line 65):
      - Change the description to "PL-2: default boot schema has EXACTLY ONE isEventCapture=1 container (status-hud)"
      - Replace the assertion that expects captures.toHaveLength(0) with:
          expect captures.toHaveLength(1)
          expect captures[0]?.containerName toBe 'status-hud'
          expect captures[0]?.containerID toBe 6
          expect captures[0]?.content toBe ' '
      - Keep the comment about why map-capture is excluded; add a note: "status-hud is now the per-schema capture target for glyph fallback (FIX-NZL: G2 spec compliance)".

    Do NOT modify any other existing tests. Do NOT touch any file outside the two test files listed.
  </action>
  <verify>
    <automated>corepack pnpm --filter @evf/g2-app test</automated>
  </verify>
  <done>
    All g2-app tests pass (0 failures);
    SPEC-CAPTURE-1, SPEC-GLYPH-CAPTURE-1, SPEC-GLYPH-CAPTURE-2, SPEC-REGISTRY-UNCHANGED are present and green;
    PL-2 asserts exactly one capture (status-hud) and is green;
    REG-4 remains green (map-capture still the one registry-level capture).
  </done>
</task>

<task type="auto">
  <name>Task 3: Typecheck, lint gate, and changeset</name>
  <files>packages/g2-app/CHANGELOG.md</files>
  <action>
    Run typecheck and lint gates in sequence:
      1. corepack pnpm typecheck
      2. corepack pnpm exec biome ci packages/g2-app/src/engine/container-registry.ts packages/g2-app/src/engine/__tests__/container-registry.test.ts packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts
    If either gate fails, fix before proceeding. The two pre-existing lint errors in src/scene-input.ts and src/hud/map-canvas-layer.ts are NOT yours — do not fix or commit them; verify only the files you touched.

    Then add a changeset:
      Run: corepack pnpm changeset add
      Package: @evf/g2-app
      Bump: patch
      Summary: "fix(g2-app): G2 spec compliance — capture containers carry content single-space; glyph status-view page gains exactly-one capture target (status-hud)"

    Stage and commit with:
      git add packages/g2-app/src/engine/container-registry.ts
      git add packages/g2-app/src/engine/__tests__/container-registry.test.ts
      git add packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts
      git add .changeset/

    Commit message (≤100 chars, commitlint scope g2-app):
      fix(g2-app): G2 spec compliance — capture content single-space + glyph page capture target
  </action>
  <verify>
    <automated>corepack pnpm typecheck && corepack pnpm --filter @evf/g2-app test && corepack pnpm changeset:status</automated>
  </verify>
  <done>
    typecheck exits 0;
    g2-app tests pass;
    changeset:status shows a pending patch for @evf/g2-app;
    commit is on branch feat/hud-raster-rendering.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| g2-app → EvenHub SDK | TextContainerProperty fields are serialised to protobuf; absent optional fields are dropped — hardware silently ignores the gesture-capture container |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-NZL-01 | Tampering | TextContainerProperty content field | mitigate | Encode `content: ' '` at schema-build time; tests assert value === ' ' explicitly |
| T-NZL-02 | Denial of Service | Glyph-page dead-input (zero capture containers) | mitigate | Override isEventCapture per-schema in builder; SPEC-GLYPH-CAPTURE-1 test guards it |
| T-NZL-SC | Tampering | npm/pip/cargo installs | accept | No new package installs in this task |
</threat_model>

<verification>
corepack pnpm typecheck                              # exit 0
corepack pnpm --filter @evf/g2-app test             # all pass, 0 failures
corepack pnpm exec biome ci \
  packages/g2-app/src/engine/container-registry.ts \
  packages/g2-app/src/engine/__tests__/container-registry.test.ts \
  packages/g2-app/src/engine/__tests__/page-lifecycle.test.ts   # no new errors
corepack pnpm changeset:status                       # pending patch @evf/g2-app
</verification>

<success_criteria>
1. buildHudRasterPageSchema().textObject[0].content === ' ' (hud-capture carries required single-space content)
2. buildStatusViewTextContainers() returns exactly one isEventCapture=1 entry; it is status-hud (id 6) with content === ' '
3. CONTAINER_REGISTRY['status-hud'].isEventCapture === 0 (registry is geometry-only; builder overrides per-schema)
4. buildBaseTextContainers() REG-4 still passes: exactly one registry-level capture = map-capture (id 7)
5. PL-2 in page-lifecycle.test.ts asserts exactly one capture in boot schema (status-hud) — NOT zero
6. All g2-app tests pass; no new lint or typecheck errors; patch changeset committed
</success_criteria>

<output>
Create `.planning/quick/260610-nzl-g2-spec-compliance-fixes-capture-content/260610-nzl-01-SUMMARY.md` when done.
</output>
