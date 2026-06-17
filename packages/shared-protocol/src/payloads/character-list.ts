/**
 * Character-list push payload schemas (Quick Task 260604-eyf — real pairing).
 *
 * Emitted by the Foundry module's `character-list-reader.ts` when the `ready`
 * hook fires and when player-character actors are created, updated, or deleted.
 * Carries the full player-character roster from `game.actors` so the bridge can
 * serve `GET /v1/characters` from the push cache without a socketlib roundtrip.
 *
 * The bridge caches the latest payload in `character-list-cache.ts`
 * (last-write-wins). `buildServer({})` serves `/v1/characters` from the cache:
 * `cache.get()?.characters ?? []` when the internal snapshot function is active.
 *
 * ## Push-based architecture (no new socketlib handler)
 *
 * The Foundry module pushes character-list updates via the existing
 * `bridgeDeltaEmitter` channel (POST /internal/delta). This preserves the
 * `registerComplexHandler` count invariant (= 17 as of Phase 13).
 *
 * @see packages/foundry-module/src/readers/character-list-reader.ts (emitter)
 * @see packages/bridge/src/cache/character-list-cache.ts (bridge cache)
 * @see packages/bridge/src/ws/character-list-handler.ts (bridge handler)
 * @see packages/bridge/src/routes/characters-list.ts (REST consumer)
 * @see .planning/quick/260604-eyf-wire-bridge-foundry-real-pairing-push-ba/260604-eyf-PLAN.md
 */

import { z } from 'zod';

/**
 * WS envelope `type` discriminant for character-list pushes.
 *
 * Used by the bridge's `character-list-handler.ts` to narrow from the outer
 * `/internal/delta` body before applying `CharacterListSnapshotSchema`.
 */
export const R1_CHARACTERS_AVAILABLE_TYPE = 'r1.characters.available' as const;

/**
 * Single player-character entry in the character-list snapshot.
 *
 * Fields:
 * - `actorId` — Foundry actor document ID (unique within the world).
 * - `name`    — Character name from `actor.name`.
 * - `level`   — Character level from `actor.system.details.level` (1..20).
 *
 * Mirrors the shape already validated by `CharacterListEntrySchema` in
 * `routes/characters-list.ts` — same bounds, same field names.
 */
export const CharacterListEntrySchema = z.object({
  /** Foundry actor document ID. */
  actorId: z.string().min(1),
  /** Character name (actor.name). */
  name: z.string().min(1),
  /** Character level (1..20, dnd5e invariant). */
  level: z.number().int().min(1).max(20),
  /**
   * Owning Foundry USER name — present only when that player OPTED IN to having
   * their view streamed (ADR-0015 §C, password-free `actor` mode). The bridge uses
   * it to select the user on the headless `/join` screen. Absent → not streamable.
   */
  userName: z.string().min(1).optional(),
});

/** TypeScript type inferred from {@link CharacterListEntrySchema}. */
export type CharacterListEntry = z.infer<typeof CharacterListEntrySchema>;

/**
 * Full character-list snapshot emitted by character-list-reader.ts.
 *
 * Fields:
 * - `characters`  — All player characters in the active world, sorted by name.
 * - `source`      — `'foundry-world'` for module-pushed payloads;
 *                   `'empty'` for cold-cache bridge responses.
 * - `count`       — Convenience count (= characters.length).
 * - `generatedAt` — Unix timestamp (ms) when the reader built this snapshot.
 */
export const CharacterListSnapshotSchema = z.object({
  /** All player characters in the active world, sorted by name ascending. */
  characters: z.array(CharacterListEntrySchema),
  /**
   * Source discriminant:
   * - `'foundry-world'` — pushed by foundry-module character-list-reader.ts
   * - `'empty'`         — cold-cache bridge response (no push received yet)
   */
  source: z.enum(['foundry-world', 'empty']),
  /** Count of characters (= characters.length). */
  count: z.number().int().min(0),
  /** Unix timestamp (ms) when this snapshot was generated. */
  generatedAt: z.number().int().min(0),
});

/** TypeScript type inferred from {@link CharacterListSnapshotSchema}. */
export type CharacterListSnapshot = z.infer<typeof CharacterListSnapshotSchema>;
