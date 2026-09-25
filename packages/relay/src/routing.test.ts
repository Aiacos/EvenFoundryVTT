import { describe, expect, it } from 'vitest';
import { isRole, peerOf, routeRequest } from './routing.js';

const ROOM = 'abcdefghijklmnopqrstuv'; // 22 chars
const u = (path: string): URL => new URL(`https://relay.test${path}`);

describe('routeRequest', () => {
  it('routes a valid room upgrade', () => {
    expect(routeRequest('GET', u(`/r/${ROOM}?role=projector`), 'websocket')).toEqual({
      kind: 'room',
      room: ROOM,
      role: 'projector',
    });
    expect(routeRequest('GET', u(`/r/${ROOM}?role=glasses`), 'WebSocket')).toMatchObject({
      role: 'glasses',
    });
  });

  it('accepts room ids of 22..64 base64url chars only', () => {
    const ok64 = 'A_-9'.repeat(16);
    expect(routeRequest('GET', u(`/r/${ok64}?role=glasses`), 'websocket').kind).toBe('room');
    for (const bad of [ROOM.slice(1), `${ok64}x`, `${ROOM.slice(1)}=`, `${ROOM.slice(1)}.`]) {
      expect(routeRequest('GET', u(`/r/${bad}?role=glasses`), 'websocket')).toEqual({
        kind: 'reject',
        status: 404,
      });
    }
  });

  it('404s bad paths and roles', () => {
    for (const path of [
      '/',
      `/r/${ROOM}`,
      `/r/${ROOM}?role=gm`,
      `/r/${ROOM}/x?role=glasses`,
      `/x/${ROOM}?role=glasses`,
      '/healthz',
    ]) {
      expect(routeRequest('GET', u(path), 'websocket')).toEqual({ kind: 'reject', status: 404 });
    }
  });

  it('426s a valid room request without a WebSocket upgrade', () => {
    expect(routeRequest('GET', u(`/r/${ROOM}?role=glasses`), null)).toEqual({
      kind: 'reject',
      status: 426,
    });
    expect(routeRequest('GET', u(`/r/${ROOM}?role=glasses`), 'h2c')).toEqual({
      kind: 'reject',
      status: 426,
    });
  });

  it('answers health and preflight', () => {
    expect(routeRequest('GET', u('/health'), null)).toEqual({ kind: 'health' });
    expect(routeRequest('OPTIONS', u('/anything'), null)).toEqual({ kind: 'preflight' });
  });

  it('404s other methods', () => {
    expect(routeRequest('POST', u('/health'), null)).toEqual({ kind: 'reject', status: 404 });
  });
});

describe('roles', () => {
  it('narrows and pairs roles', () => {
    expect(isRole('projector')).toBe(true);
    expect(isRole('glasses')).toBe(true);
    expect(isRole(null)).toBe(false);
    expect(isRole('GM')).toBe(false);
    expect(peerOf('projector')).toBe('glasses');
    expect(peerOf('glasses')).toBe('projector');
  });
});
