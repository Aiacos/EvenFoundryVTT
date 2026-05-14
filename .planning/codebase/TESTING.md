# Testing Patterns

**Analysis Date:** 2026-05-14

## Test Framework

**Runner:** Vitest 4.1.5

**Config files:**
- Root: `vitest.config.ts` (workspace projects + coverage policy)
- Per-package: `packages/*/vitest.config.ts` (environment, include/exclude patterns)

**Entry command:** `pnpm test` → `vitest --run` (single run, CI mode). Watch: `pnpm test:watch`. Coverage: `pnpm test:coverage` → `vitest --run --coverage`.

**Assertion Library:** Vitest's built-in `expect()` (compatible with Jest).

**Coverage Provider:** `@vitest/coverage-v8@4.1.5` (fast WASM-based v8 instrumentation).

**Environment:** `happy-dom@20.9.0` (lightweight, not jsdom, suitable for mocked Foundry globals).

## Workspace Test Configuration

**Root vitest.config.ts (line 20):**
```typescript
test: {
  projects: ['packages/*'],
  passWithNoTests: true,
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov', 'html'],
    reportsDirectory: './coverage',
    thresholds: {
      lines: 80,
      branches: 80,
      functions: 80,
    },
    include: ['packages/*/src/**/*.{ts,tsx}'],
    exclude: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/__tests__/**',
      'packages/*/dist/**',
      // Phase 2+ placeholders (remove when logic lands)
      'packages/bridge/src/index.ts', // Phase 3
      'packages/g2-app/src/index.ts', // Phase 4a
      'packages/shared-protocol/src/index.ts', // Phase 2
      // Hardware-test utilities
      'packages/validation-harness/src/lib/**',
    ],
  },
},
```

**Coverage gate:** 80% lines/branches/functions for all source files in the include list (files matching exclude are not checked). **This is CI-enforced** (D-1.10 gate 4: `pnpm test:coverage`).

**Migration rule:** When a package gains executable logic (not just re-exports), its `src/index.ts` is removed from the exclude list AND tests must bring coverage to ≥80% in the same PR. Example: `packages/foundry-module/src/index.ts` was removed from exclusions once `module.ts` + `settings.ts` had real logic with tests.

**Per-package config example** from `packages/foundry-module/vitest.config.ts`:
```typescript
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@evf/foundry-module',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
```

## Test File Organization

**Location:** Co-located with source, two patterns allowed:
- `src/module.test.ts` (suffix pattern)
- `src/__tests__/module.test.ts` (directory pattern)

**Naming:** `*.test.ts` only (no `.spec.ts`, enforced by `include` glob).

**Example from `packages/foundry-module/`:**
```
src/
├── module.ts
├── module.test.ts           ← co-located test
├── settings.ts
├── pair/
│   ├── PairModal.ts
│   └── socketlib-handlers.ts
└── readers/
    └── hook-subscribers.ts
```

**When to place in __tests__:** Shared test utilities, fixtures, or helper functions that are NOT themselves test files.

## Test Structure

**Pattern observed** in `packages/foundry-module/src/module.test.ts`:

```typescript
/**
 * Unit tests for @evf/foundry-module — Wave 0 entry point + settings registration.
 *
 * Tests use vi.stubGlobal to inject minimal Foundry globals (game, Hooks) so
 * the module can be exercised in a happy-dom environment without a live Foundry
 * instance. This is the canonical pattern for all Phase 2 unit tests.
 *
 * Coverage gate (INV-4): ≥80% line/branch/function coverage on module.ts and
 * settings.ts. The vitest.config.ts + root coverage config enforce this gate.
 *
 * @see packages/foundry-module/src/types/foundry-globals.d.ts — ambient shapes
 * @see CLAUDE.md INV-4 (coverage gate, strict mode)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Create a minimal mock for concept X. */
function makeXMock(): XMock { ... }

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('MODULE_ID', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('Application', ApplicationStub);
    // ... more stubs
  });

  it('equals "evenfoundryvtt"', async () => {
    vi.stubGlobal('game', makeGameMock('en'));
    vi.stubGlobal('Hooks', makeHooksMock());
    const { MODULE_ID } = await import('./module.js');
    expect(MODULE_ID).toBe('evenfoundryvtt');
  });
});

describe('Hooks.once("init") → registerSettings()', () => {
  beforeEach(() => {
    vi.resetModules();
    // ... stubs
  });

  it('registers "init" and "ready" hook handlers on module load', async () => {
    // ... test
  });
});
```

**Key patterns:**
1. **Descriptive test name:** `it('description of behavior under conditions')` not `it('test1')`
2. **One assertion per test (or grouped by subject):** Each `it()` focuses on one behavior
3. **Setup/teardown:** `beforeEach()` prepares state; `afterEach()` cleans up
4. **Module isolation:** `vi.resetModules()` ensures each test loads fresh module state (important for Foundry globals stubbing)
5. **Mocking:** Helper functions create minimal stubs, injected via `vi.stubGlobal()`

## Mocking Framework

**Tool:** Vitest's built-in `vi` (Mock spy utilities)

**Common patterns:**

### Mock creation (helper factories)
```typescript
function makeGameMock(lang = 'it') {
  const settingsStore = new Map<string, unknown>();
  return {
    settings: {
      register: vi.fn(),
      registerMenu: vi.fn(),
      get: vi.fn((moduleId: string, key: string) => settingsStore.get(`${moduleId}.${key}`)),
      set: vi.fn((moduleId: string, key: string, value: unknown) => {
        settingsStore.set(`${moduleId}.${key}`, value);
      }),
    },
    i18n: { lang, localize: vi.fn((key: string) => key) },
  };
}
```

### Stubbing globals
```typescript
vi.stubGlobal('game', makeGameMock('en'));
vi.stubGlobal('Hooks', makeHooksMock());
vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
```

### Spying and mocking
```typescript
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('error'));

const fetchMock = vi.fn(async () => ({ ok: true }));
expect(fetchMock).toHaveBeenCalledWith('url', expect.objectContaining({ method: 'POST' }));
```

### Mocking return values
```typescript
gameMock.settings.get.mockReturnValue({ entries: { ... } });
gameMock.actors.get.mockReturnValue(stubActor);
```

**What to mock:**
- External APIs (fetch, Foundry globals, socketlib)
- Time (use `vi.useFakeTimers()` for Date-dependent logic)
- Network calls (http injection, mock responses)

**What NOT to mock:**
- Core business logic (test real implementations of Zod parsing, grid building, etc.)
- Built-in modules (use actual `Map`, `Set`, Array methods)
- Standard library functions unless explicitly testing failure modes

## Test Examples

### Unit test with mocks (Foundry module)
```typescript
it('drops delta silently when no active bearer entry exists', async () => {
  const gameMock = makeGameMock('en');
  const hooksMock = makeHooksMock();
  const fetchMock = vi.fn();

  vi.stubGlobal('game', gameMock);
  vi.stubGlobal('Hooks', hooksMock);
  vi.stubGlobal('fetch', fetchMock);

  // No bearerRegistry entry
  gameMock.settings.get.mockReturnValue(undefined);

  await import('./module.js');
  hooksMock.fire('init');
  hooksMock.fire('ready');

  hooksMock.fire('updateActor', stubActor, { system: { attributes: { hp: { value: 40 } } } });

  // No active pair → fetch should NOT have been called
  await new Promise((r) => setTimeout(r, 20));
  expect(fetchMock).not.toHaveBeenCalled();
});
```

### Integration test with dependency injection (Bridge server)
```typescript
describe('GET /v1/health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 with status ok for valid bearer', async () => {
    app = await buildServer({ foundryValidateFn: makeValidFn(), langDirOverride: LANG_DIR });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/health',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);
  });
});
```

## Snapshot Testing (INV-1 Layout Integrity)

**Purpose:** Assert that ASCII grid layouts match character-perfect fixtures per `Specs.md §7.14.4`.

**Tool:** `matchAsciiFixture()` helper in `packages/shared-render/src/snapshot.ts` (wraps Vitest's `toMatchFileSnapshot()`).

**Implementation:**
```typescript
export async function matchAsciiFixture(grid: AsciiGrid, fixturePath: string): Promise<void> {
  const serialized = `${grid.toString()}\n`;
  await expect(serialized).toMatchFileSnapshot(fixturePath);
}
```

**Usage pattern (future, Phase 4a):**
```typescript
it('renders status HUD with correct column alignment', async () => {
  const grid = new AsciiGrid(/* ... */);
  await matchAsciiFixture(grid, './status-hud.snapshot');
});
```

**How snapshots work:**
1. First run: `pnpm test` creates `status-hud.snapshot` file with actual output
2. Review and commit the snapshot file
3. Future runs: `pnpm test` diffs output against snapshot; fails if they differ
4. Update: `pnpm test -- --update` to accept new output and update snapshot file

**CI gate (D-1.10 gate 6):** `pnpm vitest --run --update=false` — fails if snapshots differ (no automatic update in CI).

## Async Testing

**Awaiting async functions:**
```typescript
await new Promise((r) => setTimeout(r, 20));  // Wait 20ms for fire-and-forget
expect(fetchMock).toHaveBeenCalled();

// Or use vi.waitFor() for polling
await vi.waitFor(() => fetchMock.mock.calls.length > 0, { timeout: 2000 });
```

**Dynamic imports (for module reset):**
```typescript
const { MODULE_ID } = await import('./module.js');  // Fresh import after vi.resetModules()
```

**Async test example:**
```typescript
it('emits delta via fetch when an active bearer entry exists', async () => {
  // ... setup mocks, call hooks.fire('updateActor', ...)
  
  // Wait for the fire-and-forget fetch to complete
  await vi.waitFor(() => fetchMock.mock.calls.length > 0, { timeout: 2000 });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://bridge.local:8910/internal/delta',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer secret-abc',
      }),
    }),
  );
});
```

## Error/Exception Testing

**Pattern: Catch and assert warnings**
```typescript
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

vi.stubGlobal('fetch', vi.fn(async () => {
  throw new Error('Bridge offline');
}));

// ... fire hook that triggers bridgeDeltaEmitter

await vi.waitFor(
  () => warnSpy.mock.calls.some((c) => String(c[0]).includes('bridgeDeltaEmitter failed')),
  { timeout: 2000 },
);

expect(warnSpy).toHaveBeenCalledWith(
  expect.stringContaining('bridgeDeltaEmitter failed'),
  expect.anything(),
);
```

**Pattern: Test null/undefined returns**
```typescript
it('returns null if no matching active entry is found', async () => {
  gameMock.settings.get.mockReturnValue(undefined);
  // ... test that function returns null, not throws
  expect(result).toBeNull();
});
```

## Test Commands

**Local development:**
```bash
pnpm test                    # Single run, all tests
pnpm test:watch              # Watch mode, re-run on file changes
pnpm test:coverage           # Single run + coverage report (80% gate enforced)
```

**Per-package (filter):**
```bash
pnpm --filter @evf/foundry-module test          # Run only foundry-module tests
pnpm --filter @evf/foundry-module test:watch    # Watch for foundry-module
```

**Update snapshots:**
```bash
pnpm test -- --update        # Update all snapshot fixtures
```

**Coverage details:**
```bash
pnpm test:coverage
# Outputs: ./coverage/index.html (open in browser for source-level view)
```

## Hardware Test Utilities (validation-harness)

**Purpose:** `packages/validation-harness/` contains Phase 0 GO/NO-GO tests for hardware assumptions (R1 events, G2 image API format, BLE bandwidth, partial-update API, DLE, audio chunk size).

**Status:** Phase 1 — hardware-test utilities under `packages/validation-harness/src/lib/` are **excluded from coverage** until executable logic lands and Even Hub access is available.

**Script:** `pnpm --filter @evf/validation-harness validate:all` (hardware-gated; requires Even Hub credentials).

**Fallback:** `pnpm --filter @evf/validation-harness validate:all -- --skip-hardware` (software-only smoke test, no hardware required).

**Notes:**
- Phase 0 validation gate: all written GO/NO-GO tests must pass before application code (Phases 2+) lands
- Once Phase 0 closes, hardware tests are integrated into Phase-specific test suites
- Not part of CI pipeline until Phase 1 Plan 03 (CI doesn't have hardware access)

## Test Coverage Gaps (Phase 1)

**Currently excluded packages (placeholders only):**
- `packages/bridge/src/index.ts` — Phase 3 (single export stub)
- `packages/g2-app/src/index.ts` — Phase 4a (single export stub)
- `packages/shared-protocol/src/index.ts` — Phase 2 (re-exports real schemas once they land)
- `packages/validation-harness/src/lib/**` — Hardware-gated utilities

**When to remove exclusions:**
- Add tests for the module's real logic
- Bring file-level coverage to ≥80%
- Update `vitest.config.ts` exclude list
- Add tests in the same PR as the feature

---

*Testing analysis: 2026-05-14*
