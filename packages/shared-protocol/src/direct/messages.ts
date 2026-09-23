/**
 * Direct-channel messages exchanged between the G2 app and the GM-client projector
 * over the Foundry `module.evenfoundryvtt` socket relay (always inside a sealed
 * envelope — see `envelope.ts`).
 *
 * `t` discriminates the message; `rid` correlates a request with its response and is
 * reused as the idempotency key for `invoke` (ADR-0011 dispatch pipeline).
 *
 * @see docs/architecture/0012-direct-foundry-streaming.md
 * @see docs/design/g2-thirds-layout.md §Associazione e connessione
 */
import { z } from 'zod';

/** Protocol revision carried by `hello`; bump on any breaking change to this file. */
export const DIRECT_PROTOCOL_VERSION = 1 as const;

/** Snapshot topics the app can request with `get`. */
export const SNAPSHOT_TOPICS = ['character', 'combat', 'map', 'log'] as const;
export const SnapshotTopicSchema = z.enum(SNAPSHOT_TOPICS);
export type SnapshotTopic = z.infer<typeof SnapshotTopicSchema>;

const Rid = z.string().min(1).max(64);

// ─── G2 app → projector ──────────────────────────────────────────────────────

export const HelloSchema = z.strictObject({
  t: z.literal('hello'),
  rid: Rid,
  proto: z.literal(DIRECT_PROTOCOL_VERSION),
  app: z.string().min(1).max(32),
  locale: z.string().min(2).max(10).optional(),
});

export const GetSchema = z.strictObject({
  t: z.literal('get'),
  rid: Rid,
  what: SnapshotTopicSchema,
});

export const InvokeSchema = z.strictObject({
  t: z.literal('invoke'),
  rid: Rid,
  tool: z.string().min(1).max(64),
  input: z.unknown(),
});

export const PingSchema = z.strictObject({ t: z.literal('ping'), rid: Rid });

export const AppMessageSchema = z.discriminatedUnion('t', [
  HelloSchema,
  GetSchema,
  InvokeSchema,
  PingSchema,
]);
export type AppMessage = z.infer<typeof AppMessageSchema>;

// ─── projector → G2 app ──────────────────────────────────────────────────────

/**
 * Fresh credentials pushed on first `welcome` so the pairing QR/code is single-use.
 * `password` is absent when the projector is a player client (only a GM may change a
 * Foundry password — ADR-0013): the app then keeps its current password.
 */
export const RotateSchema = z.strictObject({
  password: z.string().min(12).max(128).optional(),
  /** New AES-256 key, base64url (32 bytes). */
  key: z.string().min(43).max(44),
});

export const WelcomeSchema = z.strictObject({
  t: z.literal('welcome'),
  rid: Rid,
  actorId: z.string().min(1),
  actorName: z.string(),
  userName: z.string(),
  gmName: z.string(),
  worldTitle: z.string(),
  /** Foundry UI language (`game.i18n.lang`) so the app can follow it when set to 'auto'. */
  locale: z.string().min(2).max(10).optional(),
  rotate: RotateSchema.optional(),
});

export const SnapshotMessageSchema = z.strictObject({
  t: z.literal('snapshot'),
  rid: Rid.optional(),
  what: SnapshotTopicSchema,
  /** Validated by the consumer with the topic schema (CharacterSnapshot, MapSnapshot…). */
  data: z.unknown(),
});

export const DeltaSchema = z.strictObject({
  t: z.literal('delta'),
  seq: z.number().int().nonnegative(),
  topic: z.string().min(1).max(64),
  data: z.unknown(),
});

export const ResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ t: z.literal('result'), rid: Rid, ok: z.literal(true), data: z.unknown() }),
  z.strictObject({
    t: z.literal('result'),
    rid: Rid,
    ok: z.literal(false),
    error: z.strictObject({ code: z.string(), message: z.string() }),
  }),
]);

export const PongSchema = z.strictObject({ t: z.literal('pong'), rid: Rid });

export const RevokedSchema = z.strictObject({ t: z.literal('revoked') });

export const ProjectorMessageSchema = z.union([
  WelcomeSchema,
  SnapshotMessageSchema,
  DeltaSchema,
  ResultSchema,
  PongSchema,
  RevokedSchema,
]);
export type ProjectorMessage = z.infer<typeof ProjectorMessageSchema>;
