import { MapSnapshotSchema } from '@evf/shared-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFoundry, makeActor, makeUser } from '../__tests__/direct-fixtures.js';
import { readMapSnapshot, resolveTargetUuids, toRelativeBackground } from './map-reader.js';

afterEach(() => vi.unstubAllGlobals());

const viewer = { actorId: 'thorin', playerUserId: 'p1', g2UserId: 'g2a' };

function token(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    x: 200,
    y: 300,
    width: 1,
    height: 1,
    disposition: 0,
    hidden: false,
    actorId: null,
    actor: null,
    ...extra,
  };
}

function scene(tokens: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Cripta',
    grid: { size: 100 },
    dimensions: { sceneX: 100, sceneY: 200, sceneWidth: 2450, sceneHeight: 3600 },
    background: { src: 'worlds/w/maps/crypt.webp' },
    environment: { darknessLevel: 0.4 },
    walls: {
      contents: [
        { id: 'w1', c: [100, 200, 600, 200], door: 0 },
        { id: 'w2', c: [600, 200, 600, 700], door: 1 },
        { id: 'w3', c: [600, 700, 100, 700], door: 2 },
        { id: 'broken', c: [1, 2] },
      ],
    },
    tokens: { contents: tokens, get: () => undefined },
    ...extra,
  };
}

describe('readMapSnapshot', () => {
  it('MR-01 returns null without an active scene', () => {
    installFoundry();
    expect(readMapSnapshot(viewer)).toBeNull();
  });

  it('MR-02 converts geometry to cells relative to the scene rectangle', () => {
    installFoundry({ scene: scene([token('t1', { x: 350, y: 450, width: 2, height: 2 })]) });
    const snap = readMapSnapshot(viewer);
    expect(snap).not.toBeNull();
    expect(MapSnapshotSchema.parse(snap)).toBeTruthy();
    expect(snap).toMatchObject({
      cols: 25,
      rows: 36,
      gridPx: 100,
      darkness: 0.4,
      background: { src: 'worlds/w/maps/crypt.webp', x: 0, y: 0, w: 2450, h: 3600 },
    });
    expect(snap?.tiles).toBeUndefined();
    expect(snap?.tokens[0]).toMatchObject({ x: 2.5, y: 2.5, w: 2, h: 2 });
    expect(snap?.walls).toEqual([
      { c: [0, 0, 5, 0] },
      { c: [5, 0, 5, 5], door: true },
      // secret door is reported as a plain wall
      { c: [5, 5, 0, 5] },
    ]);
  });

  it('MR-03 filters hidden tokens and classifies self / ally / enemy / neutral with hp only for friends', () => {
    const self = makeActor('thorin', 'Thorin');
    const ownedByPlayer = makeActor('pet', 'Pet', { ownership: { p1: 3 } });
    const goblin = makeActor('gob', 'Goblin');
    installFoundry({
      scene: scene([
        token('tSelf', { actorId: 'thorin', actor: self }),
        token('tAlly', { disposition: 1, actor: makeActor('mira', 'Mira') }),
        token('tPet', { actor: ownedByPlayer }),
        token('tGob', { disposition: -1, actor: goblin }),
        token('tNeutral'),
        token('tHidden', { hidden: true, disposition: -1 }),
      ]),
    });
    const snap = readMapSnapshot(viewer);
    const byId = Object.fromEntries((snap?.tokens ?? []).map((t) => [t.id, t]));
    expect(Object.keys(byId)).toEqual(['tSelf', 'tAlly', 'tPet', 'tGob', 'tNeutral']);
    expect(byId.tSelf).toMatchObject({ kind: 'self', hp: 0.5 });
    expect(byId.tAlly).toMatchObject({ kind: 'ally', hp: 0.5 });
    expect(byId.tPet?.kind).toBe('ally');
    expect(byId.tGob?.kind).toBe('enemy');
    expect(byId.tGob?.hp).toBeUndefined();
    expect(byId.tNeutral?.kind).toBe('neutral');
    expect(snap?.selfTokenId).toBe('tSelf');
  });

  it('MR-04 targetId comes from the G2 user targets, only if the token is visible', () => {
    const g2 = makeUser('g2a', 'Luca (G2)', {
      targets: new Set([{ id: 'tHidden' }, { id: 'tGob' }]),
    });
    installFoundry({
      users: [g2],
      scene: scene([token('tGob', { disposition: -1 }), token('tHidden', { hidden: true })]),
    });
    expect(readMapSnapshot(viewer)?.targetId).toBe('tGob');
  });

  it('MR-05 defaults: missing grid/dimensions/walls/background/darkness', () => {
    installFoundry({
      scene: {
        id: 's2',
        name: 'Empty',
        tokens: {
          contents: [
            token('t', {
              x: undefined,
              y: undefined,
              width: 0,
              height: undefined,
              name: undefined,
            }),
          ],
        },
      },
    });
    const snap = readMapSnapshot(viewer);
    expect(snap).toMatchObject({ gridPx: 100, cols: 0, rows: 0, darkness: 0, walls: [] });
    expect(snap?.background).toBeUndefined();
    expect(snap?.tokens[0]).toMatchObject({ name: '', x: 0, y: 0, w: 1, h: 1 });
    expect(MapSnapshotSchema.safeParse(snap).success).toBe(true);
  });
});

describe('readMapSnapshot scene art', () => {
  it('MR-06 background offset, tiles in draw order (hidden / foreign / empty dropped)', () => {
    installFoundry({
      scene: scene([], {
        background: { src: '/worlds/w/maps/crypt.webp', offsetX: 12.4, offsetY: -8 },
        tiles: {
          contents: [
            {
              x: 600,
              y: 700,
              width: 200,
              height: 100,
              elevation: 1,
              sort: 0,
              texture: { src: 'a.webp' },
            },
            {
              x: 100,
              y: 200,
              width: 50,
              height: 50,
              elevation: 0,
              sort: 5,
              texture: { src: 'b.webp' },
            },
            {
              x: 100,
              y: 200,
              width: 50,
              height: 50,
              elevation: 0,
              sort: 2,
              texture: { src: 'c.webp' },
            },
            { x: 0, y: 0, width: 50, height: 50, hidden: true, texture: { src: 'hidden.webp' } },
            { x: 0, y: 0, width: 50, height: 50, alpha: 0, texture: { src: 'clear.webp' } },
            { x: 0, y: 0, width: 50, height: 50, texture: { src: 'https://cdn.other/x.webp' } },
            { x: 0, y: 0, width: 0, height: 50, texture: { src: 'flat.webp' } },
            { x: 0, y: 0, width: 50, height: 50 },
          ],
        },
      }),
    });
    const snap = readMapSnapshot(viewer);
    expect(MapSnapshotSchema.safeParse(snap).success).toBe(true);
    expect(snap?.background).toEqual({
      src: 'worlds/w/maps/crypt.webp',
      x: 12,
      y: -8,
      w: 2450,
      h: 3600,
    });
    expect(snap?.tiles).toEqual([
      { src: 'c.webp', x: 0, y: 0, w: 50, h: 50, z: 0 },
      { src: 'b.webp', x: 0, y: 0, w: 50, h: 50, z: 1 },
      { src: 'a.webp', x: 500, y: 500, w: 200, h: 100, z: 2 },
    ]);
  });

  it('MR-07 v14: background from the initial level, else the first level', () => {
    const level = { background: { src: 'worlds/w/maps/level0.webp' } };
    installFoundry({
      scene: scene([], {
        background: undefined,
        initialLevel: 'L0',
        levels: { get: (id: string) => (id === 'L0' ? level : undefined) },
      }),
    });
    expect(readMapSnapshot(viewer)?.background?.src).toBe('worlds/w/maps/level0.webp');
    vi.unstubAllGlobals();
    installFoundry({ scene: scene([], { background: { src: '' }, firstLevel: level }) });
    expect(readMapSnapshot(viewer)?.background?.src).toBe('worlds/w/maps/level0.webp');
  });

  it('MR-08 token art for every visible token, sight in cells only for self', () => {
    installFoundry({
      scene: scene(
        [
          token('tSelf', {
            actorId: 'thorin',
            texture: { src: '/tokens/thorin.webp' },
            sight: { enabled: true, range: 60 },
          }),
          token('tGob', {
            disposition: -1,
            texture: { src: 'tokens/goblin.webp' },
            sight: { enabled: true, range: 60 },
          }),
          token('tForeign', { texture: { src: 'https://cdn.other/t.webp' } }),
          token('tHidden', { hidden: true, texture: { src: 'tokens/secret.webp' } }),
        ],
        { grid: { size: 100, distance: 5 } },
      ),
    });
    const byId = Object.fromEntries((readMapSnapshot(viewer)?.tokens ?? []).map((t) => [t.id, t]));
    expect(byId.tSelf).toMatchObject({ img: 'tokens/thorin.webp', sight: 12 });
    expect(byId.tGob).toMatchObject({ img: 'tokens/goblin.webp' });
    expect(byId.tGob?.sight).toBeUndefined();
    expect(byId.tForeign?.img).toBeUndefined();
    expect(byId.tHidden).toBeUndefined();
  });

  it('MR-09 sight omitted when disabled or unlimited; default grid distance 5', () => {
    const self = (sight: unknown) =>
      installFoundry({ scene: scene([token('tSelf', { actorId: 'thorin', sight })]) });
    self({ enabled: false, range: 30 });
    expect(readMapSnapshot(viewer)?.tokens[0]?.sight).toBeUndefined();
    vi.unstubAllGlobals();
    self({ enabled: true, range: null });
    expect(readMapSnapshot(viewer)?.tokens[0]?.sight).toBeUndefined();
    vi.unstubAllGlobals();
    self({ enabled: true, range: 30 });
    expect(readMapSnapshot(viewer)?.tokens[0]?.sight).toBe(6);
  });

  it('MR-12 open doors and sight-transparent walls are flagged open', () => {
    installFoundry({
      scene: scene([], {
        walls: {
          contents: [
            { id: 'a', c: [100, 200, 200, 200], door: 1, ds: 1 },
            { id: 'b', c: [100, 200, 200, 200], door: 1, ds: 0 },
            { id: 'c', c: [100, 200, 200, 200], door: 0, sight: 0 },
            { id: 'd', c: [100, 200, 200, 200], door: 0, sight: 20 },
          ],
        },
      }),
    });
    expect(readMapSnapshot(viewer)?.walls).toEqual([
      { c: [0, 0, 1, 0], door: true, open: true },
      { c: [0, 0, 1, 0], door: true },
      { c: [0, 0, 1, 0], open: true },
      { c: [0, 0, 1, 0] },
    ]);
  });
});

describe('toRelativeBackground', () => {
  const origin = 'https://vtt.example';
  it('keeps relative paths, strips leading slash', () => {
    expect(toRelativeBackground('/worlds/a.png', origin)).toBe('worlds/a.png');
    expect(toRelativeBackground('worlds/a.png', origin)).toBe('worlds/a.png');
  });
  it('converts same-origin absolute URLs and drops foreign ones', () => {
    expect(toRelativeBackground('https://vtt.example/worlds/a.png?v=2', origin)).toBe(
      'worlds/a.png?v=2',
    );
    expect(toRelativeBackground('https://cdn.other/a.png', origin)).toBeUndefined();
    expect(toRelativeBackground('http://[bad', origin)).toBeUndefined();
  });
  it('empty / missing → undefined', () => {
    expect(toRelativeBackground('', origin)).toBeUndefined();
    expect(toRelativeBackground(null, origin)).toBeUndefined();
    expect(toRelativeBackground(undefined, origin)).toBeUndefined();
  });
});

describe('resolveTargetUuids', () => {
  const uuid = (id: string) => `Scene.s1.Token.${id}`;
  it('MR-10 translates visible token ids to document UUIDs, in order', () => {
    installFoundry({
      scene: scene([
        token('tGob', { uuid: uuid('tGob'), disposition: -1 }),
        token('tAlly', { uuid: uuid('tAlly'), disposition: 1 }),
      ]),
    });
    expect(resolveTargetUuids(['tAlly', 'tGob'])).toEqual({
      ok: true,
      uuids: [uuid('tAlly'), uuid('tGob')],
    });
    expect(resolveTargetUuids([])).toEqual({ ok: true, uuids: [] });
  });

  it('MR-11 rejects ids not on the scene, hidden tokens, tokens without uuid, no scene', () => {
    installFoundry({
      scene: scene([
        token('tGob', { uuid: uuid('tGob') }),
        token('tHidden', { uuid: uuid('tHidden'), hidden: true }),
        token('tNoUuid'),
      ]),
    });
    expect(resolveTargetUuids(['tGob', 'elsewhere'])).toEqual({
      ok: false,
      invalidId: 'elsewhere',
    });
    expect(resolveTargetUuids(['tHidden'])).toEqual({ ok: false, invalidId: 'tHidden' });
    expect(resolveTargetUuids(['tNoUuid'])).toEqual({ ok: false, invalidId: 'tNoUuid' });
    vi.unstubAllGlobals();
    installFoundry();
    expect(resolveTargetUuids(['tGob'])).toEqual({ ok: false, invalidId: 'tGob' });
  });
});
