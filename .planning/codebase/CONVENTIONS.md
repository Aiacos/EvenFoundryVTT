# Coding Conventions

**Analysis Date:** 2026-05-14

## TypeScript Strict Mode

**Enforcement:** Mandatory via `tsconfig.base.json` + CI gate (D-1.10 gate 3)

**Compiler flags:**
- `strict: true` — All strictness checks enabled
- `noUnusedLocals: true` — Every declared variable must be used or prefixed with `_`
- `noUnusedParameters: true` — Function parameters must be used or prefixed with `_`
- `noImplicitOverride: true` — Method overrides require explicit `override` keyword
- `noFallthroughCasesInSwitch: true` — Switch cases must explicitly break/return/throw
- `noUncheckedIndexedAccess: true` — Array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes: true` — Optional properties cannot be assigned `undefined` directly
- `esModuleInterop: true` — CJS/ESM interop (required for Node 24 compatibility)
- `isolatedModules: true` — Each file is compiled independently (safe for bundlers like tsup)
- `forceConsistentCasingInFileNames: true` — File paths match case exactly (enforces Unix conventions on case-insensitive filesystems)

**Per-package extends:** All packages extend `tsconfig.base.json` and add environment-specific libs. Example from `packages/foundry-module/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

**CI enforcement:** `pnpm typecheck` runs `tsc --noEmit -p tsconfig.base.json && pnpm -r exec tsc --noEmit` (root check + per-package), failing on any TS error.

## Code Formatting & Linting

**Tool:** Biome 2.4.15 (replaces ESLint + Prettier — single binary, ~10× faster)

**Format rules** (`biome.jsonc`):
- `indentStyle: "space"`, `indentWidth: 2` — 2-space indent
- `lineWidth: 100` — Soft line length target
- `lineEnding: "lf"` — Unix newlines only
- `quoteStyle: "single"` — Single quotes for string literals
- `trailingCommas: "all"` — Trailing commas in multi-line structures
- `semicolons: "always"` — Semicolons required after statements
- `arrowParentheses: "always"` — Arrow functions always have parentheses: `(x) => x` not `x => x`

**Linting rules:**
- `recommended: true` — All Biome-recommended rules enabled
- `noExplicitAny: warn` — Avoid `any` (warning, allows in narrow cases)
- `noConsole: { level: "warn", options: { allow: ["error", "warn"] } }` — console.warn/error allowed (per INV-4 comment pattern), console.log forbidden
  - **Override:** Test files (`packages/*/tests/**`, `packages/*/**/__tests__/**`) set `noConsole: "off"` for debug logging
- `noUnusedImports: error` — All imports must be used (enforced at lint time)
- `noUnusedVariables: error` — All local variables must be used or prefixed with `_`

**Special file handling:**
- `packages/shared-render/src/fixtures/**/*.txt` — Formatter disabled (fixture files, must preserve exact whitespace)

**Pre-commit hook:** `.husky/pre-commit` runs `pnpm biome check --staged --no-errors-on-unmatched` (Biome checks only staged files, passes unmatched patterns silently)

**CI enforcement:** `pnpm lint:ci` runs `biome ci .` (read-only mode, fails on any warning)

## Import Organization

**Pattern:** ESM-only (no CommonJS require)

**Order observed in real code:**
1. Node builtin imports (`import { resolve } from 'node:path'`)
2. Third-party packages (`import { z } from 'zod'`)
3. Type imports when needed (`import type { FastifyInstance } from 'fastify'`)
4. Local absolute imports (workspace `@evf/*` packages via `tsconfig` path aliases)
5. Local relative imports (`./**` from same package)

**Example from `packages/foundry-module/src/module.ts`:**
```typescript
import { registerSocketlibHandlers } from './pair/socketlib-handlers.js';
import { registerHookSubscribers } from './readers/hook-subscribers.js';
import { registerSettings } from './settings.js';
```

**Path aliases:** None explicitly defined; imports use relative paths or workspace `@evf/*` protocol (pnpm `workspace:*` in `package.json`).

**File extensions:** `.js` required in relative imports (ESM module resolution). TypeScript compiles to JS, extension is preserved.

## JSDoc/TSDoc on Public APIs

**Requirement:** Every exported function, class, interface, and constant must have a JSDoc comment block.

**Format observed:**
```typescript
/**
 * Brief one-line summary.
 *
 * Optional multi-paragraph description of behavior, side-effects, and constraints.
 * May reference external specs, ADRs, or phase decisions.
 *
 * @param paramName — Description of parameter
 * @returns Description of return value
 * @see Specs.md §section (canonical upstream source)
 * @see docs/architecture/ADR-NNNN.md
 * @example
 * ```ts
 * // Code example showing typical usage
 * ```
 */
export function myFunction(paramName: string): string { ... }
```

**Examples from codebase:**

From `packages/foundry-module/src/settings.ts`:
```typescript
/**
 * Registers the EvenFoundryVTT settings menu in the Foundry Settings panel.
 *
 * Must be called inside the `Hooks.once("init")` callback to ensure
 * `game.settings` is available. Reads `game.i18n.lang` immediately and
 * stores the result in `detectedLocale` for downstream consumers.
 *
 * Registers the bearer registry and internal secrets as hidden world-scope
 * settings (Tier 3 DM-authoritative storage per D-2.12).
 *
 * @example
 * ```ts
 * Hooks.once('init', () => {
 *   registerSettings();
 * });
 * ```
 */
export function registerSettings(): void { ... }
```

From `packages/shared-render/src/ascii-grid.ts`:
```typescript
/**
 * Character-precision grid model for INV-1 layout integrity testing.
 * Source: Specs.md §7.14.4 ck 11-15 + §7.1a Layout Integrity Invariants.
 *
 * @since 0.1.0-alpha (Phase 1 wire-up)
 */
export class AsciiGrid { ... }
```

**Type annotations on JSDoc:** Not required by Biome, but comments should include enough context for readers to understand intention without reading implementation.

## Naming Conventions

**Files:**
- Package entry point: `src/index.ts` (re-exports, single line per excluded file in vitest config)
- Module files: `src/module-name.ts` (kebab-case, PascalCase class names)
- Test files: `src/module-name.test.ts` or `src/__tests__/module-name.test.ts`
- Configuration: `tsconfig.json`, `vitest.config.ts` (lowercase, camelCase for TS configs)

**Functions/Methods:**
- camelCase: `function registerSettings()`, `async buildServer()`, `getInternalSecret()`
- Private/internal prefix: `_privateFn()` (used for unused parameters by TS strict rules)

**Variables:**
- camelCase: `let detectedLocale = 'en'`, `const VALID_TOKEN = '...'`
- Constants: UPPER_SNAKE_CASE when truly constant and top-level (e.g., `MODULE_ID = 'evenfoundryvtt' as const`)
- Unused variables: Prefix with `_` to satisfy `noUnusedLocals` (e.g., `function makeValidFn(): (_token: string) => ...`)

**Types/Interfaces:**
- PascalCase: `type HandshakeClient = ...`, `interface BuildServerOptions { ... }`, `class AsciiGrid { ... }`
- Avoid `I` prefix (e.g., `interface UserData` not `interface IUserData`)

**Zod Schemas:**
- Suffix with `Schema`: `HandshakeClientSchema`, `EnvelopeSchema`, `DeltaEnvelopeSchema`
- Accompanying TypeScript type: `type HandshakeClient = z.infer<typeof HandshakeClientSchema>`

Example from `packages/shared-protocol/src/envelope.ts`:
```typescript
export const EnvelopeSchema = z.object({
  proto: z.literal('evf-v1'),
  seq: z.number().int().nonnegative(),
  // ... fields
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
```

## Error Handling

**Pattern: Try-catch with explicit side effects**

Observed in `packages/foundry-module/src/settings.ts`:
```typescript
try {
  const lang = game.i18n?.lang ?? 'en';
  detectedLocale = lang.split('-')[0] ?? 'en';
} catch {
  detectedLocale = 'en';
}
```

**Pattern: Fire-and-forget async with console.warn fallback**

From `packages/foundry-module/src/module.ts`:
```typescript
void (async () => {
  try {
    await fetch(`${bridgeUrl}/internal/delta`, { ... });
  } catch (err) {
    // Warning only — bridge unavailability must not crash Foundry session
    // console.warn allowed per biome.jsonc noConsole allow:[error,warn]
    console.warn('[EVF] bridgeDeltaEmitter failed:', (err as Error).message ?? err);
  }
})();
```

**Pattern: Early return on validation failure**

From `packages/foundry-module/src/module.ts`:
```typescript
const internalSecret = getInternalSecret();
const bridgeUrl = getBridgeUrl();

if (internalSecret === null || bridgeUrl === null) {
  // No active pair — delta silently dropped (not a warning; normal before pairing)
  return;
}
```

**Principles:**
- No unhandled promise rejections — if async fails, catch and log/recover
- Network failures (fetch) are logged but never throw (sessions must stay stable)
- Type guards preferred over assertions (e.g., `value?.field ?? fallback` over `value!.field`)

## Logging

**Framework:** `console.warn` / `console.error` only (per Biome allow list)

**Pattern:** Prefix with module name: `console.warn('[EVF] bridgeDeltaEmitter failed:', ...)`, `console.error('[MODULE] error type:', ...)`

**Notes:**
- Production bridge logging uses pino (JSON structured, not phase 1 yet)
- Foundry module logging uses console (Foundry redirects to F12 console)

## Comments

**Inline comments:** Explain WHY, not WHAT
- **Good:** `// No active pair — delta silently dropped (not a warning; normal before pairing)`
- **Bad:** `// Return if no internal secret`

**Section dividers:** ASCII divider comments for major blocks:
```typescript
// ─── Test suite ──────────────────────────────────────────────────────────────

// ─── Foundry global mock helpers ────────────────────────────────────────────
```

**TODO discipline (INV-4):** Every `// TODO` MUST include `(#issue)` or `(ADR-NNNN)` reference.

CI gate (D-1.10 gate 5) enforces:
```bash
grep -RnE '// TODO(?!\((#[0-9]+|ADR-[0-9]+)\))' packages/ docs/architecture/
```

**Example with valid reference:**
```typescript
// TODO (ADR-0003): validate mock shapes against fvtt-types when package
// stabilises (Phase 3+).
```

## Module Design

**Exports:** Named exports preferred; default exports used only for factory functions (`export default defineProject(...)`, `export default defineConfig(...)`).

**Barrel files:** `src/index.ts` re-exports public API; internal files not re-exported.

**Single responsibility:** Each module focuses on one concept (handshake, envelope, token cache, etc.). Related files group under semantic directories (`src/pair/`, `src/readers/`, `src/routes/`, `src/ws/`).

**Example structure from `packages/foundry-module/src/`:**
```
src/
├── module.ts              # Entry point, hook registration
├── settings.ts            # Settings panel, locale detection
├── pair/
│   ├── PairModal.ts       # UI component
│   └── socketlib-handlers.ts  # Socketlib GM-side handlers
├── readers/
│   └── hook-subscribers.ts    # Foundry hook → delta pipeline
├── types/
│   └── foundry-globals.d.ts   # Ambient type declarations
└── module.test.ts         # Unit tests
```

## Function Design

**Size:** Keep functions ≤ 50 lines (rough heuristic); extract helpers for repeated logic.

**Parameters:** Use objects for multiple params (avoids positional confusion):
```typescript
// Good — named
async function buildServer(options: BuildServerOptions): FastifyInstance { ... }

// Avoid — positional
async function buildServer(fn, dir, snapFn, store, registry): FastifyInstance { ... }
```

**Return values:** Prefer explicit types, nullable returns use `| null` not `| undefined`.

**Async:** Always use `async`/`await` over `.then()` chains. Fire-and-forget async wrapped in `void (async () => { ... })()` (for type-checker).

## Conventional Commits

**Enforced via:** commitlint + husky commit-msg hook

**Format:** `<type>(<scope>): <subject>`

**Type enum:** `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`, `style`, `ci`

**Scope enum (advisory):**
- Package names: `g2-app`, `bridge`, `foundry-module`, `shared-protocol`, `shared-render`, `validation-harness`, `foundry-mcp`
- Wildcard: `*` (when change affects multiple packages)

**Subject:** No case enforcement (Italian commits allowed per `subject-case: [0]`)

**Body:** (optional) Wrap at 72 characters; reference issues/ADRs.

**Example commits in git log:**
```
docs(260513-l12): SUMMARY + STATE — ApplicationV2 v13 namespace fix complete
chore: merge quick task worktree (worktree-agent-a0c0b6af189b5feff)
fix(foundry-module): resolve ApplicationV2 via foundry.applications.api (v13+ runtime)
```

---

*Convention analysis: 2026-05-14*
