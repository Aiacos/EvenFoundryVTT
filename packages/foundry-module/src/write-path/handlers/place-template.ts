/**
 * placeTemplateHandler + confirmTemplatePlacementHandler — Phase 7 Plan 03 (Wave 2).
 *
 * Implements AoE template placement (ACT-02) via the synchronous
 * `dnd5e.canvas.AbilityTemplate.fromActivity(activity)` API + R1-confirmed position
 * commit via `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [...])`.
 *
 * # Two-handler design (ACT-02)
 *
 * **placeTemplateHandler** (`'place-template'`):
 *   1. Resolves actor → item → first activity (same lookup pattern as cast-spell.ts).
 *   2. Calls `dnd5e.canvas.AbilityTemplate.fromActivity(activity)` — SYNCHRONOUS (RESEARCH §Q2).
 *   3. If null/empty → `{ success: false, error: 'no_templates' }`.
 *   4. Mints UUID v4 `placementId`, stores the template array in `PLACEMENT_CONTEXTS` Map
 *      with 60s TTL (lazy eviction on read).
 *   5. Returns `{ success: true, data: { placementId, total, templates: [...] } }`.
 *      The bridge fans out one `template.placement.requested` envelope per template index.
 *
 * **confirmTemplatePlacementHandler** (`'confirm-template-placement'`):
 *   1. Receives `{ placementId, templateIndex, x, y }`.
 *   2. Looks up `PLACEMENT_CONTEXTS.get(placementId)` — expired/missing → `placement_expired`.
 *   3. Validates `templateIndex < templates.length` — `invalid_template_index` on fail.
 *   4. Pulls template, calls `template.document.toObject()`, overwrites `x`, `y`, adds `user`.
 *   5. `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [templateData])`.
 *   6. Returns `{ success: true, data: { templateId, templateIndex, x, y } }`.
 *
 * # Critical Rules (RESEARCH §Q2)
 * - `fromActivity()` is SYNCHRONOUS — never `await` it.
 * - `drawPreview()` is NEVER called — incompatible with R1 input (Pitfall 3).
 * - Both handlers are pure write-path — no `activity.use()` calls.
 *
 * # Threat Model
 * - T-07-03-01: `templateIndex >= templates.length` guard.
 * - T-07-03-02: 60s TTL + lazy eviction prevents PLACEMENT_CONTEXTS unbounded growth.
 * - T-07-03-03: x/y bounds validated by Foundry on `createEmbeddedDocuments`.
 * - T-07-03-04: dispatchTool's writeAuditLog covers repudiation (args + result logged).
 *
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 * @see .planning/phases/07-foundry-module-write-path/07-RESEARCH.md §Q2 (fromActivity sync)
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 */

import {
  TemplatePlacementConfirmPayloadSchema,
} from '@evf/shared-protocol';
import type { ArgsValidator, ToolHandler, ToolResult } from '../tool-registry.js';

// ─── PLACEMENT_CONTEXTS — 60s TTL placement state store ──────────────────────

/** Shape of each placement context entry stored in {@link PLACEMENT_CONTEXTS}. */
interface PlacementContext {
  /** The array of AbilityTemplate objects returned by fromActivity (positional). */
  templates: Array<dnd5e.canvas.AbilityTemplate>;
  /** Timestamp (ms since epoch) when this context was created. */
  cachedAt: number;
}

/** Time-to-live for placement contexts (60s — mirrors idempotency TTL). */
const PLACEMENT_TTL_MS = 60_000;

/**
 * Module-level placement context store.
 *
 * Maps `placementId` (UUID v4) to the pending template array + creation timestamp.
 * Entries are lazily evicted: any `confirmTemplatePlacementHandler` call that finds
 * an expired entry returns `placement_expired` and removes the entry.
 *
 * Exported for test isolation — tests call `clearPlacementContexts()` between cases.
 * Production code MUST NOT call `clear()` directly.
 *
 * T-07-03-02: limits unbounded growth — handler checks TTL on every read, evicting
 * stale entries. Flood scenario: each unique placementId expires in 60s; total map
 * size is bounded by the rate of `place-template` invocations in the TTL window.
 */
const PLACEMENT_CONTEXTS = new Map<string, PlacementContext>();

/**
 * Clears all placement contexts.
 *
 * **Test-only API** — used by test harnesses to reset state between test cases.
 * Production code does not call this.
 */
export function clearPlacementContexts(): void {
  PLACEMENT_CONTEXTS.clear();
}

// ─── Args schemas ─────────────────────────────────────────────────────────────

/** Typed args for `placeTemplateHandler`. */
interface PlaceTemplateArgs {
  actor_id: string;
  spell_id: string;
}

/**
 * Minimal structural validator for `placeTemplateHandler` args.
 *
 * Does NOT import zod directly (foundry-module has no direct zod dependency).
 * Validates `actor_id` + `spell_id` are non-empty strings.
 *
 * The `ArgsValidator<T>` interface from tool-registry.ts is satisfied by this
 * plain object (duck-typing — no zod required in the handler layer).
 */
const PlaceTemplateArgsSchema: ArgsValidator<PlaceTemplateArgs> = {
  safeParse(data: unknown): { success: true; data: PlaceTemplateArgs } | { success: false; error: { message: string } } {
    if (data === null || typeof data !== 'object') {
      return { success: false, error: { message: 'args must be an object' } };
    }
    const obj = data as Record<string, unknown>;
    if (typeof obj.actor_id !== 'string' || obj.actor_id.length === 0) {
      return { success: false, error: { message: 'actor_id must be a non-empty string' } };
    }
    if (typeof obj.spell_id !== 'string' || obj.spell_id.length === 0) {
      return { success: false, error: { message: 'spell_id must be a non-empty string' } };
    }
    return {
      success: true,
      data: { actor_id: obj.actor_id, spell_id: obj.spell_id },
    };
  },
  parse(data: unknown): PlaceTemplateArgs {
    const result = this.safeParse(data);
    if (!result.success) throw new Error(result.error.message);
    return result.data;
  },
};

/** Typed args for `confirmTemplatePlacementHandler` (mirrors TemplatePlacementConfirmPayload). */
type ConfirmTemplatePlacementArgs = {
  placementId: string;
  templateIndex: number;
  x: number;
  y: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a UUID v4 using the Web Crypto API.
 *
 * Available in both browser (g2-app) and Node 24 (bridge/module) environments.
 * Uses `crypto.randomUUID()` when available (Node 14.17+ / modern browsers),
 * falling back to a manual hex construction for test environments that provide
 * a `crypto.getRandomValues` mock.
 *
 * @returns UUID v4 string
 */
function generateUUID(): string {
  // crypto.randomUUID() is available in Node 14.17+ and modern browsers.
  // Test environments may mock crypto.getRandomValues only — handle both.
  const cryptoGlobal = globalThis.crypto;
  if (cryptoGlobal && typeof (cryptoGlobal as { randomUUID?: () => string }).randomUUID === 'function') {
    return (cryptoGlobal as { randomUUID: () => string }).randomUUID();
  }
  // Fallback: manual UUID v4 via getRandomValues (test environments).
  const bytes = new Uint8Array(16);
  cryptoGlobal.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant RFC4122
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

// ─── placeTemplateHandler ─────────────────────────────────────────────────────

/**
 * Implements ToolHandler<PlaceTemplateArgs> for the 'place-template' tool.
 *
 * Resolves actor → item → first activity → calls AbilityTemplate.fromActivity(activity)
 * synchronously → mints placementId → stores context → returns template array description.
 *
 * The bridge fans out one `template.placement.requested` envelope per template
 * index by reading the response `data.templates` array (Plan 07-06 integration smoke
 * verifies the fan-out path end-to-end).
 *
 * NO drawPreview() call (RESEARCH §Q2 Pitfall 3 — incompatible with R1 input).
 *
 * @see confirmTemplatePlacementHandler (companion handler — commits confirmed positions)
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 */
export const placeTemplateHandler: ToolHandler<PlaceTemplateArgs> = {
  argsSchema: PlaceTemplateArgsSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: resolve actor
    const actor = game.actors.get(args.actor_id);
    if (actor === undefined) {
      return { success: false, error: 'actor_not_found' };
    }

    // Step 2: resolve spell item by spell_id
    const item = actor.items?.contents.find((i) => i.id === args.spell_id);
    if (item === undefined) {
      return { success: false, error: 'item_not_found' };
    }

    // Step 3: locate first activity on the spell item
    const activity = item.system.activities?.contents[0];
    if (activity === undefined) {
      return { success: false, error: 'no_activity' };
    }

    // Step 4: call fromActivity SYNCHRONOUSLY — never await (RESEARCH §Q2)
    // NO drawPreview() — incompatible with R1 input model (Pitfall 3).
    const templates = dnd5e.canvas.AbilityTemplate.fromActivity(activity);

    // Step 5: handle null/empty (activities without AoE templates)
    if (templates === null || templates.length === 0) {
      return { success: false, error: 'no_templates' };
    }

    // Step 6: mint placementId + store context with TTL timestamp
    const placementId = generateUUID();
    PLACEMENT_CONTEXTS.set(placementId, {
      templates,
      cachedAt: Date.now(),
    });

    // Step 7: return placement description (bridge fans out envelopes per index)
    return {
      success: true,
      data: {
        placementId,
        total: templates.length,
        templates: templates.map((t, i) => ({
          index: i,
          type: t.document.t,
          distance: t.document.distance,
          ...(t.document.angle !== undefined ? { angle: t.document.angle } : {}),
        })),
      },
    };
  },
};

// ─── confirmTemplatePlacementHandler ─────────────────────────────────────────

/**
 * Implements ToolHandler<ConfirmTemplatePlacementArgs> for 'confirm-template-placement'.
 *
 * Receives the R1-confirmed (x, y) position for a specific template index, looks up the
 * pending placement context by `placementId`, and commits the template via
 * `canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [templateData])`.
 *
 * Registered in `socketlib-handlers.ts` under the `evf.confirmTemplatePlacement` handler ID
 * (replaces the `evf.skillCheck` stub in-place — count stays 14, Plan 07-03 rename).
 *
 * # Error codes
 * - `placement_expired` — placementId not found or TTL exceeded (60s)
 * - `invalid_template_index` — templateIndex >= templates.length
 * - `<message>` — any error from createEmbeddedDocuments (string from caught Error)
 *
 * @see placeTemplateHandler (companion handler — mints placementId + stores context)
 * @see .planning/phases/07-foundry-module-write-path/07-03-PLAN.md Task 1
 */
export const confirmTemplatePlacementHandler: ToolHandler<ConfirmTemplatePlacementArgs> = {
  /**
   * Uses the canonical `TemplatePlacementConfirmPayloadSchema` from `@evf/shared-protocol`
   * as the args validator. This gives us Zod-validated UUIDs + int/number checks
   * without importing zod directly into the foundry-module package.
   *
   * The `TemplatePlacementConfirmPayloadSchema` is a `z.strictObject` with:
   * `{ placementId: z.string().uuid(), templateIndex: z.number().int().min(0), x: z.number(), y: z.number() }`
   * which is exactly the shape `ConfirmTemplatePlacementArgs` describes.
   */
  argsSchema: TemplatePlacementConfirmPayloadSchema as ArgsValidator<ConfirmTemplatePlacementArgs>,

  async handle(args): Promise<ToolResult> {
    // Step 1: look up placement context — lazy eviction on read (T-07-03-02)
    const ctx = PLACEMENT_CONTEXTS.get(args.placementId);
    if (ctx === undefined) {
      return { success: false, error: 'placement_expired' };
    }

    // Step 2: TTL check (60s lazy eviction)
    const age = Date.now() - ctx.cachedAt;
    if (age > PLACEMENT_TTL_MS) {
      PLACEMENT_CONTEXTS.delete(args.placementId);
      return { success: false, error: 'placement_expired' };
    }

    // Step 3: validate templateIndex is in-range (T-07-03-01)
    if (args.templateIndex >= ctx.templates.length) {
      return { success: false, error: 'invalid_template_index' };
    }

    // Step 4: get the template at the requested index
    const template = ctx.templates[args.templateIndex];
    if (template === undefined) {
      return { success: false, error: 'invalid_template_index' };
    }

    // Step 5: build templateData from toObject(), override x/y + add user
    const templateData = template.document.toObject();
    templateData.x = args.x;
    templateData.y = args.y;
    // game.user.id is available as a FoundryUser property (foundry-globals.d.ts FoundryUser)
    templateData.user = (game.user as { id: string }).id;

    // Step 6: commit via createEmbeddedDocuments (NO drawPreview — Pitfall 3)
    try {
      const scene = canvas?.scene;
      if (scene === null || scene === undefined) {
        return { success: false, error: 'no_active_scene' };
      }
      const created = await scene.createEmbeddedDocuments('MeasuredTemplate', [templateData]);
      const templateId = created[0]?.id ?? null;
      return {
        success: true,
        data: {
          templateId,
          templateIndex: args.templateIndex,
          x: args.x,
          y: args.y,
        },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};
