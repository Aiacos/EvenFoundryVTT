/**
 * Direct-channel messages exchanged between the G2 app and the projector (the Foundry
 * tab that showed the pairing QR) through a relay room — always inside a sealed
 * envelope (see `envelope.ts`).
 *
 * `t` discriminates the message; `rid` correlates a request with its response and is
 * reused as the idempotency key for `invoke` (ADR-0011 dispatch pipeline).
 *
 * @see docs/architecture/0016-direct-foundry-streaming.md
 * @see docs/architecture/0019-relay-pairing-player-projector.md
 */
import { z } from 'zod';
import { DeviceKeySchema, RoomIdSchema } from './pairing.js';

/** Protocol revision carried by `hello`; bump on any breaking change to this file. */
export const DIRECT_PROTOCOL_VERSION = 2 as const;

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
 * Fresh secrets pushed on the first `welcome` so the pairing QR/code is single-use: the
 * app persists them, then both ends move to the new room with the new key.
 */
export const RotateSchema = z.strictObject({
  /** New relay room id. */
  room: RoomIdSchema,
  /** New AES-256 key, base64url (32 bytes). */
  key: DeviceKeySchema,
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
  /**
   * Version of the `evenfoundryvtt` module answering (`game.modules.get(id).version`),
   * so the app can show it and warn when it differs from its own build.
   */
  moduleVersion: z.string().min(1).max(32).optional(),
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

/** Prefix of a map image reference resolved from an `asset` message (see `map.ts`). */
export const ASSET_REF_PREFIX = 'evf-asset:' as const;

/**
 * A scene picture prepared by the projector (the phone never reaches Foundry): sent once
 * per id per connection, before the map snapshot that references it as
 * `evf-asset:<id>`. `data` is a `data:image/(png|jpeg);base64,…` URL.
 */
export const AssetSchema = z.strictObject({
  t: z.literal('asset'),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  data: z
    .string()
    .max(900_000)
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
});

export const ProjectorMessageSchema = z.union([
  WelcomeSchema,
  SnapshotMessageSchema,
  DeltaSchema,
  ResultSchema,
  PongSchema,
  RevokedSchema,
  AssetSchema,
]);
export type ProjectorMessage = z.infer<typeof ProjectorMessageSchema>;
