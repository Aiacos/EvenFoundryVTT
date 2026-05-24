# Coding Conventions

**Analysis Date:** 2026-05-24

## TypeScript Strict Mode

**Enforcement:** Mandatory via `tsconfig.base.json` + CI gate

**Compiler flags (`tsconfig.base.json`):**
- `strict: true` — All strictness checks enabled
- `noUnusedLocals: true` — Every declared variable must be used or prefixed with `_`
- `noUnusedParameters: true` — Function parameters must be used or prefixed with `_`
- `noImplicitOverride: true` — Method overrides require explicit `override` keyword
- `noFallthroughCasesInSwitch: true` — Switch cases must explicitly break/return/throw
- `noUncheckedIndexedAccess: true` — Array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes: true` — Optional properties cannot be assigned `undefined` directly
- `esModuleInterop: true` — CJS/ESM interop for Node 24 compatibility
- `isolatedModules: true` — Each file is compiled independently (safe for bundlers)
- `forceConsistentCasingInFileNames: true` — File paths match case exactly

**Per-package config inheritance:** All packages in `packages/*/tsconfig.json` extend `tsconfig.base.json` and add environment-specific libs (e.g., `foundry-module` adds `DOM` lib).

**Example package config (`packages/bridge/tsconfig.json`):**
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "types": ["node"],
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

**CI enforcement:** `pnpm typecheck` runs `tsc --noEmit -p tsconfig.base.json && pnpm -r exec tsc --noEmit` (root + per-package check), failing on any type error.

## Code Formatting & Linting

**Tool:** Biome 2.4.15 (single binary, ~10× faster than ESLint + Prettier combined)

**Config file:** `biome.jsonc`

**Formatter rules:**
- `indentStyle: "space"`, `indentWidth: 2` — 2-space indent throughout
- `lineWidth: 100` — Soft line-length target (not hard limit)
- `lineEnding: "lf"` — Unix line endings only
- `quoteStyle: "single"` — Single quotes for all string literals (` 'string' `, not `"string"`)
- `trailingCommas: "all"` — Trailing commas in multi-line arrays/objects/parameters
- `semicolons: "always"` — Semicolons required after statements
- `arrowParentheses: "always"` — Arrow function parameters always parenthesized: `(x) => x`, not `x => x`

**Linting rules (`biome.jsonc` §linter):**
- `recommended: true` — All recommended rules enabled
- `noUnusedImports: "error"` — Unused imports cause failure
- `noUnusedVariables: "error"` — Unused variables cause failure
- `noExplicitAny: "warn"` — `any` types warned (not error) per Specs.md D-1.04
- `noConsole: { level: "warn", allow: ["error", "warn"] }` — `console.log` warned; `console.error` and `console.warn` allowed
- Test file override: `packages/*/tests/**` and `packages/*/**/__tests__/**` allow `noConsole: "off"` (test output acceptable)
- Fixture override: `packages/shared-render/src/fixtures/**/*.txt` has `formatter: { enabled: false }` (ASCII grid files exempt)

**CI enforcement:** `pnpm lint:ci` runs `biome ci .` (read-only check, no auto-fixes). `pnpm lint` runs `biome check .` with writes enabled (for local dev).

## Import Organization

**Order in source files:**
1. Node.js builtins (`import { readFileSync } from 'node:fs'`)
2. Third-party packages (`import Fastify from 'fastify'`, `import { z } from 'zod'`)
3. Relative imports from same package (`import { TokenCache } from '../auth/token-cache.js'`)
4. Cross-package imports (`import { HandshakeClientSchema } from '@evf/shared-protocol'`)

**Path aliases (via `tsconfig.base.json` `moduleResolution: "Bundler"`):**
- `@evf/bridge` → `packages/bridge/src/**`
- `@evf/g2-app` → `packages/g2-app/src/**`
- `@evf/foundry-module` → `packages/foundry-module/src/**`
- `@evf/foundry-mcp` → `packages/foundry-mcp/src/**`
- `@evf/shared-protocol` → `packages/shared-protocol/src/**`
- `@evf/shared-render` → `packages/shared-render/src/**`
- `@evf/validation-harness` → `packages/validation-harness/src/**`

**Example import structure:**
```typescript
import { readFileSync } from 'node:path';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { TokenCache } from '../auth/token-cache.js';
import { HandshakeClientSchema } from '@evf/shared-protocol';
```

## Naming Conventions

**Files:**
- Kebab-case: `token-cache.ts`, `portrait-renderer.ts`, `audio-stream-route.ts`
- Pattern: descriptive nouns with hyphens separating concepts
- Test files: `{module}.test.ts` co-located with source; integrated tests in `__tests__/` subdirectory
- Fixtures: `{feature}.{state}.{lang?}.txt` (e.g., `status-hud.hp-overflow.txt`, `boot-error.bridge-unreachable.it.txt`)

**Functions & Methods:**
- camelCase: `buildServer()`, `handleHandshake()`, `createTokenCache()`, `validateToken()`
- Verbs for actions: `build*`, `handle*`, `create*`, `validate*`, `register*`, `render*`
- Booleans start with `is`, `has`, `can`, `should`: `isValid`, `hasCache`, `canResume`

**Variables & Constants:**
- camelCase for mutable vars: `tokenCache`, `sessionStore`, `metricsRegistry`
- UPPER_SNAKE_CASE for module-level constants: `TTL_MS`, `CLOSE_INVALID_HANDSHAKE`, `SERVER_CAPS_V1`
- Avoid abbreviations except standard: `srv` ✗, `server` ✓; `fn` acceptable in callback contexts

**Types & Interfaces:**
- PascalCase: `TokenCache`, `ValidateTokenResult`, `SessionStore`, `BootStep`
- Suffix patterns:
  - `*Schema` for Zod schemas: `HandshakeClientSchema`, `CharacterSnapshotSchema`
  - `*Result` for operation outcomes: `ValidateTokenResult`
  - `*Fn` for function types: `FoundryValidateFn`, `ToolHandler`

**Abbreviations in identifiers:**
- Allowed: `req` (request), `res` (response), `fn` (function in callback contexts), `msg` (message)
- Not allowed: `svr`, `srv`, `u` (use), `obj`, `val`
- Entity types: Full form always (`entity`, `actor`, `item`, not `ent`, `a`, `i`)

## JSDoc / TSDoc Comments

**When required (INV-4 §0.1):**
- Every exported function/class/interface requires JSDoc block
- Every public method requires TSDoc
- Internal helpers (not exported) may use brief one-line `//` comments

**Format:**
```typescript
/**
 * Brief one-line description.
 *
 * Longer explanation if needed. Mention related files, ADRs, or Specs sections.
 * @see Specs.md §4.1 (reference)
 * @see docs/architecture/ADR-NNNN.md (architecture decision)
 * @see .planning/phases/NN-name/NN-PLAN.md Task X (planning context)
 */
export function handleSomething(param: Type): Promise<Result> {
```

**Example from codebase (`packages/bridge/src/auth/token-cache.ts`):**
```typescript
/**
 * Token validation cache — 5-minute in-memory TTL over socketlib roundtrip.
 *
 * Bridge consults Foundry's bearer registry via `socketlib.executeAsGM("evf.validateToken", token)`
 * on every cache miss. Cache hit avoids hot-loop roundtrips (D-2.12).
 *
 * Security notes (T-02-01, T-02-05):
 * - Token values are NEVER logged. Only the first 6 chars are used as a correlation hint.
 * - Cache keys are token values; all cache.keys() iteration is internal-only.
 * - 5-minute TTL is intentional: allows prompt revoke propagation within ~5 min.
 */
```

**Comments in code:**
- Mark decision rationale with `// [REASON]` if non-obvious: `// Advance past 5-minute TTL (D-2.12)`
- Mark workarounds with `// TODO (#issue-id)` or `// FIXME (ADR-NNNN)` — CI fails on bare `TODO` without reference

## Error Handling

**Strategy:** Explicit result types (discriminated unions) + try-catch for edge cases.

**Patterns observed:**

**1. Zod schema validation — `.safeParse()` for untrusted input:**
```typescript
const parseResult = HandshakeClientSchema.safeParse(parsed);
if (!parseResult.success) {
  logger.warn({ issues: parseResult.error.issues.length }, 'schema validation failed');
  socket.close(CLOSE_INVALID_HANDSHAKE, 'invalid_handshake');
  return null;
}
```

**2. Result type (discriminated union) for operations:**
```typescript
export interface ValidateTokenResult {
  valid: boolean;
  entry?: { alias: string; expiresAt: number; worldId: string };
  reason?: 'unknown_token' | 'revoked' | 'expired' | 'foundry_unreachable';
}
```

**3. Async functions — catch for unexpected errors:**
```typescript
socket.once('message', async (rawData) => {
  try {
    // Main logic
  } catch (err) {
    logger.error({ err }, 'WS handshake: unexpected error');
    socket.close(CLOSE_INVALID_HANDSHAKE, 'internal_error');
  }
});
```

**4. Promise rejection handling:**
```typescript
handleHandshake(socket, req, tokenCache, replayBuffer, sessionStore, logger)
  .then((sessionId) => {
    if (sessionId) deltaEmitter.registerSession(sessionId);
  })
  .catch((err) => {
    logger.error({ err }, 'WS handshake caught unhandled error');
  });
```

**Logging levels:**
- `logger.debug()` — Development tracing (token hint, state transitions)
- `logger.warn()` — Recoverable issues (invalid token, schema mismatch, unknown capabilities)
- `logger.error()` — Unexpected failures (socket close, metrics error, I/O failure)

**No silent errors:** Every catch block logs. Exceptions are never swallowed.

## Logging

**Framework:** Pino 10.3.1 (structured JSON-line logging)

**Instance creation in server (`packages/bridge/src/server.ts`):**
```typescript
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: ['req.headers.authorization', ...], // T-02-01 redaction
      censor: '[REDACTED]'
    }
  }
});
```

**Token redaction pattern (T-02-01):**
- Never log full bearer token
- Use first 6 characters as correlation hint: `logger.debug({ tokenHint: token.slice(0, 6) }, '...')`
- Biome rule + manual review prevents accidental token logs

**Logging across packages:**
- `@evf/bridge` — Pino logger on every request handler and async operation
- `@evf/foundry-module` — Console or Foundry's `console.log` (Foundry-standard)
- `@evf/g2-app` — Console (browser WebView)
- `@evf/foundry-mcp` — Pino logger (Node service)

## Function Design

**Size guideline:** ~50-150 lines for typical handler functions (e.g., `handleHandshake` is ~80 lines, readable with clear sections).

**Parameters:**
- Ordered logically: entity first, options/callbacks last
- Named intentionally: `foundryValidateFn` over `fn`, `tokenCache` over `cache`
- Use destructuring for object params: `{ lines, branches, functions }` not `thresholds`
- Prefix unused params with `_`: `_req` (FastifyRequest available but not used)

**Return types:**
- Always explicit in signatures: `Promise<string | null>` not `Promise<any>`
- Use discriminated unions for complex returns: `{ valid: true; entry: ... } | { valid: false; reason: '...' }`
- Void functions are rare (prefer result types for testability)

## Module Design

**Exports:**
- Default export: rarely used (most modules export named functions/classes)
- Named exports: prefer multiple exports over default for tree-shaking
- Example (`packages/bridge/src/server.ts`):
  ```typescript
  export interface BuildServerOptions { ... }
  export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> { ... }
  ```

**Barrel files:**
- Minimal use; most packages have no `index.ts` that re-exports everything
- `@evf/shared-protocol` exports types/schemas: `export * from './payloads/character.js'`
- Avoids circular dependencies

**File organization by concern:**
- `src/auth/` — Token validation, bearer registry
- `src/cache/` — In-memory caches (tokens, portraits, entity packs)
- `src/routes/` — HTTP route handlers (REST endpoints)
- `src/ws/` — WebSocket logic (handshake, delta emission, session management)
- `src/voice/` — Speech-to-text, Deepgram integration, keyterm management
- `src/middleware/` — Fastify hooks (idempotency, metrics, logging)
- `src/metrics/` — Prometheus registry and counter definitions

## Type Safety Patterns

**Avoid `any`:**
- Every value has a type
- `unknown` for unvalidated inputs (before Zod parse)
- Biome warns on `any` (rule: `noExplicitAny: "warn"`)

**Discriminated unions for variants:**
```typescript
type BootStepState = 'pending' | 'in_progress' | 'done' | 'error';
type ActionResult = { success: true; data: T } | { success: false; error: string };
```

**Branded types where semantics matter:**
```typescript
type SessionId = string & { readonly __brand: 'SessionId' };
type BearerToken = string & { readonly __brand: 'BearerToken' };
```

**Zod validation at boundaries:**
- Parse untrusted JSON at API entry points
- Payload schemas (`@evf/shared-protocol/src/payloads/*`) are Zod schemas + TypeScript types
- Use `.parse()` for trusted internal data, `.safeParse()` for external/user input

---

*Convention analysis: 2026-05-24*
