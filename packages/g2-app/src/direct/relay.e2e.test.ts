// @vitest-environment node
/**
 * End-to-end pairing over a REAL relay (ADR-0019): the real `DirectSession` of the
 * glasses + a projector reduced to the real sealed protocol, both on real WebSockets.
 * Skipped unless `EVF_RELAY_URL` points at a running relay (CI starts `wrangler dev`).
 *
 * Flow: pairing code → hello → welcome{rotate} → both move to the new room → hello →
 * welcome → character + map (with an `asset`) → online → invoke → result → projector
 * leaves (no-projector) → returns → online again, by itself.
 *
 *   EVF_RELAY_URL=ws://127.0.0.1:8799 pnpm vitest --run packages/g2-app/src/direct/relay.e2e.test.ts
 */
import {
  AppMessageSchema,
  deriveCodePairing,
  GLASSES_ADDRESS,
  generateDeviceKey,
  generateManualCode,
  generateRoomId,
  importDeviceKey,
  type MapSnapshot,
  open,
  PROJECTOR_ADDRESS,
  RelayControlSchema,
  relayRoomUrl,
  SealedEnvelopeSchema,
  seal,
} from '@evf/shared-protocol';
import { describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../state/app-store.js';
import { makeCharacter, makeMap } from './__fixtures__/direct-fixtures.js';
import { CredentialStore } from './credentials.js';
import { createRelayOpener } from './relay-client.js';
import { DirectSession } from './session.js';

const RELAY = process.env.EVF_RELAY_URL;
const ASSET = 'data:image/png;base64,iVBORw0KGgo=';

/** A projector tab reduced to the protocol: one room, one key, scripted answers. */
class MiniProjector {
  private ws: WebSocket | null = null;
  readonly invoked: string[] = [];
  readonly errors: string[] = [];
  constructor(
    private readonly relay: string,
    private room: string,
    private key: string,
    private pending: boolean,
  ) {}

  join(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayRoomUrl(this.relay, this.room, 'projector'));
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('projector could not join the relay'));
      ws.onmessage = (ev) => {
        this.onFrame(String(ev.data)).catch((err: unknown) => this.errors.push(String(err)));
      };
    });
  }

  leave(): void {
    this.ws?.close();
    this.ws = null;
  }

  private async send(message: object): Promise<void> {
    const key = await importDeviceKey(this.key);
    this.ws?.send(JSON.stringify(await seal(key, PROJECTOR_ADDRESS, GLASSES_ADDRESS, message)));
  }

  private async onFrame(data: string): Promise<void> {
    const frame: unknown = JSON.parse(data);
    if (RelayControlSchema.safeParse(frame).success) return;
    const opened = await open(await importDeviceKey(this.key), SealedEnvelopeSchema.parse(frame));
    // A hello sealed with the pre-rotation key: ignored, as the real projector does.
    if (!opened.ok) return;
    const msg = AppMessageSchema.parse(opened.message);
    const welcome = {
      t: 'welcome',
      rid: msg.rid,
      actorId: 'actor1',
      actorName: 'Thorin',
      userName: 'Luca',
      gmName: 'Anna',
      worldTitle: 'Cripta',
      moduleVersion: 'e2e',
    };
    if (msg.t === 'hello' && this.pending) {
      const rotate = { room: generateRoomId(), key: generateDeviceKey() };
      await this.send({ ...welcome, rotate });
      this.pending = false;
      this.leave();
      this.room = rotate.room;
      this.key = rotate.key;
      await this.join();
      return;
    }
    if (msg.t === 'hello') {
      const map: MapSnapshot = {
        ...makeMap(),
        background: { src: 'evf-asset:bg', x: 0, y: 0, w: 1000, h: 1000 },
      };
      await this.send(welcome);
      await this.send({ t: 'snapshot', what: 'character', data: makeCharacter() });
      await this.send({ t: 'asset', id: 'bg', data: ASSET });
      await this.send({ t: 'snapshot', what: 'map', data: map });
      return;
    }
    if (msg.t === 'invoke') {
      this.invoked.push(msg.tool);
      await this.send({ t: 'result', rid: msg.rid, ok: true, data: { rolled: 17 } });
    }
  }
}

describe.skipIf(RELAY === undefined)('relay pairing end-to-end (real relay)', () => {
  it('E2E-01 code → rotate → online; asset; invoke; projector away and back', async () => {
    const relay = RELAY as string;
    const code = generateManualCode();
    const { room, key } = await deriveCodePairing(code);
    const projector = new MiniProjector(relay, room, key, true);
    await projector.join();
    const store = createAppStore();
    const session = new DirectSession({
      store,
      credentials: new CredentialStore(null, () => {}),
      openRelay: createRelayOpener(),
      relayUrl: relay,
      appVersion: 'e2e',
      settingsStorage: null,
      deviceLanguage: () => 'it',
    });
    const status = () => store.get().connection;
    const wait = { timeout: 8_000, interval: 20 };
    try {
      await session.pairCode(code);
      await vi.waitFor(() => expect(status().status).toBe('online'), wait);
      expect(store.get().map?.background?.src).toBe(ASSET);
      expect(status()).toMatchObject({ userName: 'Luca', actorName: 'Thorin' });

      await expect(session.invoke('weapon-attack', { item_id: 'axe' })).resolves.toEqual({
        ok: true,
        data: { rolled: 17 },
      });
      expect(projector.invoked).toEqual(['weapon-attack']);

      projector.leave();
      await vi.waitFor(
        () => expect(status()).toMatchObject({ status: 'offline', cause: 'no-projector' }),
        wait,
      );
      await projector.join();
      await vi.waitFor(() => expect(status().status).toBe('online'), wait);
      expect(projector.errors).toEqual([]);
    } finally {
      session.dispose();
      projector.leave();
    }
  }, 30_000);
});
