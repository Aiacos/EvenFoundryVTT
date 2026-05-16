/**
 * moveTokenHandler — Phase 7 Plan 02 (Wave 1) write-path handler.
 *
 * Resolves the active scene + token document, then calls
 * `tokenDoc.update({ x, y })` via the Foundry Token document API.
 *
 * move-token is NOT a dnd5e activity — it is a direct document update.
 * This handler NEVER calls `activity.use()` (CI Gate 8 enforces this
 * at the grep level; this comment documents the design intent).
 *
 * # Error codes
 * - `no_active_scene`  — `game.scenes.active` is null (no scene loaded)
 * - `token_not_found`  — `scene.tokens.get(args.token_id)` returned undefined
 * - `<message>`        — `tokenDoc.update()` rejected with an error
 *
 * # Threat model
 * T-07-02-02: Token move is bounded by scene existence check (game.scenes.active).
 * The scene bounds check (canvas dimensions) is not enforced at handler level —
 * Foundry itself validates canvas coordinates on `tokenDoc.update()`.
 *
 * @see docs/architecture/0011-foundry-write-path-single-workflow-origin.md (ADR-0011)
 * @see packages/foundry-module/src/write-path/tool-registry.ts (ToolHandler<T>)
 * @see .planning/phases/07-foundry-module-write-path/07-02-PLAN.md Task 1
 */

import { MoveTokenInputSchema } from '@evf/shared-protocol';
import type { ToolHandler, ToolResult } from '../tool-registry.js';

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Implements ToolHandler<MoveTokenInput> for the 'move-token' tool.
 *
 * Registered into TOOL_REGISTRY via `registerToolHandler('move-token', moveTokenHandler)`
 * in `handlers/index.ts` at module-load time.
 */
export const moveTokenHandler: ToolHandler<(typeof MoveTokenInputSchema)['_input']> = {
  argsSchema: MoveTokenInputSchema,

  async handle(args): Promise<ToolResult> {
    // Step 1: verify an active scene exists
    const scene = game.scenes.active;
    if (scene === null || scene === undefined) {
      return { success: false, error: 'no_active_scene' };
    }

    // Step 2: resolve token document in the active scene
    const tokenDoc = scene.tokens.get(args.token_id);
    if (tokenDoc === undefined) {
      return { success: false, error: 'token_not_found' };
    }

    // Step 3: update token position — direct document write (NOT activity.use)
    try {
      await tokenDoc.update({ x: args.x, y: args.y });
      return {
        success: true,
        data: { token_id: args.token_id, x: args.x, y: args.y },
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};
