# Testing Patterns

**Analysis Date:** 2026-05-24

## Test Framework & Setup

**Runner:** Vitest 4.1.5 (`vitest --run` for CI, `vitest --watch` for dev)

**Config files:**
- Root: `vitest.config.ts` (workspace projects, coverage thresholds, reporters)
- Per-package: `packages/*/vitest.config.ts` (environment, include patterns)
- Root also: `pnpm test` → `vitest --run`, `pnpm test:coverage` → `vitest --run --coverage`

**Assertion library:** Vitest's built-in `expect()` (compatible with Jest API)

**Coverage provider:** `@vitest/coverage-v8@4.1.5` (fast v8-based instrumentation, generates text/lcov/html reports to `./coverage/`)

**Coverage thresholds (enforced per `vitest.config.ts`):**
- Lines: 80%
- Branches: 80%
- Functions: 80%
- Applied to: `packages/*/src/**/*.{ts,tsx}` excluding test files and excludes list

**Total test codebase:** 182 test files, ~59,861 lines of test code (~328 lines avg per test file). Source: ~242 TypeScript files, ~48,092 lines.

## Workspace Test Configuration

**Root `vitest.config.ts` structure:**
```typescript
export default defineConfig({
  test: {
    projects: ['packages/*'],
    passWithNoTests: true,  // Placeholder packages don't fail if empty
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      thresholds: { lines: 80, branches: 80, functions: 80 },
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        'packages/*/src/**/*.test.ts',      // Exclude test files
        'packages/*/src/__tests__/**',      // Exclude test dirs
        'packages/*/dist/**',               // Exclude built output
        'packages/bridge/src/index.ts',     // Phase 3+ placeholder (single export stub)
        'packages/g2-app/src/index.ts',     // Phase 4a+ placeholder
        'packages/shared-protocol/src/index.ts',  // Phase 2+ placeholder
        'packages/validation-harness/src/lib/**', // Hardware test utils
      ],
    },
  },
});
```

**Per-package configs inherit coverage/reporters from root via `defineProject()`. Example:**

**`packages/bridge/vitest.config.ts`:**
```typescript
export default defineProject({
  test: {
    name: '@evf/bridge',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

**`packages/g2-app/vitest.config.ts`:**
```typescript
export default defineProject({
  test: {
    name: 'g2-app',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
  },
});
```

**Environment per package:**
- `node` — Bridge, foundry-mcp, shared-protocol, validation-harness (no DOM needed)
- `happy-dom` — g2-app, foundry-module (lightweight DOM-like environment for mocked Foundry globals)

## Test File Organization

**Naming convention:**
- Co-located tests: `{module}.test.ts` in the same directory as source
- Integrated/smoke tests: `src/__tests__/{name}.test.ts` subdirectory
- Example structure:
  ```
  packages/bridge/src/
  ├── auth/
  │   ├── token-cache.ts
  │   └── token-cache.test.ts
  ├── ws/
  │   ├── handshake.ts
  │   └── handshake.test.ts
  └── __tests__/
      ├── voice-secret-redact.test.ts
      └── [integration smoke tests]
  ```

**Location patterns across packages:**
- `@evf/bridge`: 23 test files (token-cache, entity-pack-cache, portrait-renderer, voice routes, WS handlers, server integration)
- `@evf/foundry-module`: 24 test files (readers, handlers, registries, integration smoke)
- `@evf/foundry-mcp`: 14 test files (tool registry, WS subscriptions, voice features)
- `@evf/g2-app`: 77 test files (engine, panels, raster, status HUD, integration smoke)
- `@evf/shared-protocol`: 24 test files (payloads, tools, voice keyterms)
- `@evf/shared-render`: 1 test file (ASCII grid)
- `@evf/validation-harness`: 2 test files (integration smoke, path resolution)

## Test Structure & Patterns

**Suite organization (Vitest BDD-style):**
```typescript
describe('ModuleName', () => {
  describe('Feature context', () => {
    it('expected behavior', () => {
      // Arrange
      const input = ...;
      
      // Act
      const result = await fn(input);
      
      // Assert
      expect(result).toEqual(...);
    });
  });
});
```

**Example from `packages/bridge/src/auth/token-cache.test.ts`:**
```typescript
describe('TokenCache', () => {
  describe('cache miss → calls foundryValidateFn', () => {
    it('calls the validation function on first access', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      const result = await cache.validate('token-abc');

      expect(fn).toHaveBeenCalledOnce();
      expect(fn).toHaveBeenCalledWith('token-abc');
      expect(result).toEqual(VALID_RESULT);
    });
  });

  describe('cache hit (within TTL)', () => {
    it('returns cached result without calling foundryValidateFn again', async () => {
      const fn = vi.fn().mockResolvedValue(VALID_RESULT);
      const cache = new TokenCache(fn);

      const first = await cache.validate('token-xyz');
      const second = await cache.validate('token-xyz');

      expect(fn).toHaveBeenCalledOnce();
      expect(second).toEqual(first);
    });
  });
});
```

**Setup/teardown pattern:**
```typescript
describe('BuildServer', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('starts and closes cleanly', async () => {
    app = await buildServer({ foundryValidateFn: mockFn });
    expect(app).toBeDefined();
  });
});
```

## Mocking & Test Doubles

**Mocking library:** Vitest's native `vi` module (no external mock library needed)

**Patterns:**

**1. Function mocking (`vi.fn()`):**
```typescript
const mockValidateFn = vi.fn().mockResolvedValue({
  valid: true,
  entry: { alias: 'Test G2', expiresAt: Date.now() + 86_400_000, worldId: 'test-world' }
});
```

**2. Spying and assertion:**
```typescript
expect(mockValidateFn).toHaveBeenCalledOnce();
expect(mockValidateFn).toHaveBeenCalledWith('token-abc');
expect(mockValidateFn).toHaveBeenCalledTimes(2);
```

**3. Time control (`vi.useFakeTimers()`):**
```typescript
const now = Date.now();
vi.useFakeTimers();
vi.setSystemTime(now);

await cache.validate('token-ttl');
vi.advanceTimersByTime(5 * 60 * 1000 + 1);  // Skip past TTL
await cache.validate('token-ttl');

vi.useRealTimers();
```

**4. Dependency injection for testing:**
Instead of mocking at module level, pass test doubles via constructor:
```typescript
const cache = new TokenCache(mockFoundryValidateFn, { onHit, onMiss });
const server = await buildServer({
  foundryValidateFn: mockFn,
  langDirOverride: LANG_DIR,  // Inject test language files
  metricsRegistry: testRegistry,
});
```

**5. Fastify `inject()` for HTTP testing (no real server startup):**
```typescript
const app = await buildServer({ foundryValidateFn: makeValidFn() });

const res = await app.inject({
  method: 'GET',
  url: '/v1/health',
  headers: { authorization: `Bearer ${VALID_TOKEN}` },
});

expect(res.statusCode).toBe(200);
const body = res.json<{ status: string }>();
expect(body.status).toBe('ok');
```

**What to mock:**
- External I/O (database, network, filesystem) — always mock
- Foundry socketlib calls — always mock (no real Foundry instance in tests)
- Time-dependent behavior — use `vi.useFakeTimers()`

**What NOT to mock:**
- Core application logic (business rules, validation, state transitions)
- Helper functions that have no side effects (pure functions)
- Zod schema validation (test actual validation, not mocked)
- Public API boundaries (test contract with real types, not stubs)

## Test Data & Fixtures

**Inline fixtures (small objects):**
```typescript
const VALID_RESULT: ValidateTokenResult = {
  valid: true,
  entry: { alias: 'Test G2', expiresAt: Date.now() + 24 * 60 * 60 * 1000, worldId: 'test-world' },
};

const IDLE_SNAPSHOT: CharacterSnapshot = {
  actorId: 'thorin',
  name: 'Thorin',
  hp: 45,
  maxHp: 68,
  // ... rest of snapshot
};
```

**ASCII grid fixtures (large/structured data):**
Stored in `packages/shared-render/src/fixtures/` as `.txt` files:
- `status-hud.hp-overflow.txt` — Status HUD with long HP display
- `glyph-scene.raster-idle.txt` — Full 96×24 map raster (no action)
- `boot-error.bridge-unreachable.en.txt` — Boot splash error screen (English)
- `boot-error.bridge-unreachable.it.txt` — Boot splash error screen (Italian)

**Fixture matching helper (`matchAsciiFixture`):**
```typescript
import { AsciiGrid, matchAsciiFixture } from '@evf/shared-render';

const fixture = readFileSync(fixturePath, 'utf-8');
const rendered = statusHudRenderer.render(snapshot);

expect(() => matchAsciiFixture(rendered, fixture)).not.toThrow();
```

Used to enforce **INV-1 layout integrity** (Specs.md §7.14.4): every ASCII mockup must match character-perfect across all states.

**Snapshot test pattern (`packages/g2-app/src/status-hud/__tests__/snapshot.test.ts`):**
- Maps each INV-1 checklist item (ck 11–15) to a dedicated test
- Uses `matchAsciiFixture` to verify rendered output against canonical `.txt` files
- Tests full 96×24 pages for ck 12–14 (raster idle, glyph mode, i18n variations)
- Tests 28×21 HUD card for ck 11 + ck 15 (status + loading)

## Coverage Thresholds & Exclusions

**Coverage policy:**
- New source files landing in a PR must meet **80% line/branch/function coverage**
- Exclusions (below 80%) are acceptable **only** for:
  - Placeholder index files (`export const PACKAGE_NAME = ...`) — single re-export, no logic
  - Hardware test utilities that require Even Hub access (deferred to Phase 0 closure)

**Exclusion list (per `vitest.config.ts`):**
- `packages/bridge/src/index.ts` — Phase 3 placeholder (1 export)
- `packages/g2-app/src/index.ts` — Phase 4a placeholder (1 export)
- `packages/shared-protocol/src/index.ts` — Phase 2 placeholder (1 export)
- `packages/validation-harness/src/lib/**` — Hardware test helpers (Even Hub required)

**Viewing coverage:**
```bash
pnpm test:coverage  # Run tests + generate coverage
open coverage/index.html  # View HTML report (Chrome/Safari)
```

Output shows per-file coverage and highlights uncovered lines.

## Test Types Observed

**Unit tests (majority):**
- Test single module in isolation
- Mock all external dependencies
- Fast execution (<100ms per test)
- Examples: `token-cache.test.ts`, `portrait-renderer.test.ts`, `handshake.test.ts`

**Integration tests:**
- Test multiple modules together with some real state
- Still mock I/O (Foundry, network)
- Examples: `server.test.ts` (tests full Fastify stack with injected Foundry fn), `__tests__/voice-secret-redact.test.ts` (integration smoke test)

**Snapshot tests (INV-1 specific):**
- Compare rendered ASCII output against canonical `.txt` fixtures
- Used for layout integrity validation (no pixel drift across editions/locales)
- Examples: `status-hud/__tests__/snapshot.test.ts`, `raster/__tests__/map-base-layer.test.ts`

**E2E tests:**
- Not yet in use; Playwright 1.59 is pinned for future Phase 4+ UI testing
- Would drive browser from the WebView perspective (once rendered)

**Hardware validation (deferred):**
- `packages/validation-harness/` contains scripts for Phase 0 GO/NO-GO tests
- Requires Even Hub access (hardware + network)
- Not part of CI; run manually with `pnpm --filter @evf/validation-harness validate:all`

## Common Assertion Patterns

**Async expectations:**
```typescript
await expect(async () => {
  await cache.validate(token);
}).rejects.toThrow('Timeout');
```

**Mock call assertions:**
```typescript
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledTimes(3);
expect(mockFn).toHaveBeenCalledOnce();
expect(mockFn.mock.calls[0]).toEqual([arg1, arg2]);
```

**Object/array deep equality:**
```typescript
expect(result).toEqual({
  valid: true,
  entry: { alias: 'G2', expiresAt: 12345, worldId: 'world1' }
});
```

**Truthy/falsy checks (use sparingly, prefer strict comparisons):**
```typescript
expect(result).toBeTruthy();  // ✓ Clear intent
expect(result).toEqual(true); // ✓ Better — explicit type
```

**String matching:**
```typescript
expect(errorMsg).toContain('invalid_token');
expect(errorMsg).toMatch(/invalid_\w+/);
```

## Test Configuration & CI Integration

**CI command (GitHub Actions `.github/workflows/ci.yml`):**
```bash
pnpm test:coverage  # Runs all tests + enforces 80% thresholds
```

**Pre-commit hooks (Husky `.husky/pre-commit`):**
- Biome lint (on staged files only)
- No test run (tests run on PR in CI)

**Changeset requirement:**
```bash
pnpm changeset:status  # Fails if PR has code changes but no `.changeset/*.md` file
```

## Performance & Timeouts

**Test execution:**
- Root-level `pnpm test` runs all 182 tests in ~5-15 seconds on modern hardware
- No custom timeouts needed; Vitest defaults are sufficient (30s per test)

**Parallelization:**
- Vitest runs tests in parallel by default (per-package)
- Each package's tests are isolated (no cross-package state pollution)

**Slow tests (>1s):**
- Integration tests (server startup, multiple async operations)
- Hardware tests (deferred to manual runs with Even Hub access)

---

*Testing analysis: 2026-05-24*
