# @evf/shared-protocol

Single source of truth for the wire contracts shared by the EVF packages: Zod schemas (types
come from `z.infer`, never redefined locally — CLAUDE.md P1) and the crypto of the sealed
glasses channel. Used by `@evf/foundry-module`, `@evf/g2-app` and `@evf/validation-harness`.

## 🏗️ Contents

| Path | Role |
|---|---|
| `src/payloads/` | reader snapshots and deltas (character, combat, action economy, reactions, roll requests, templates, …) |
| `src/tools/` | Tool Registry input schemas (`weapon-attack`, `cast-spell`, `use-item`, `skill-check`, `end-turn`, …) — [ADR-0003](../../docs/architecture/0003-tool-registry-pattern.md) |
| `src/direct/messages.ts` | glasses ⇄ projector messages v2 (`hello`, `welcome` + `rotate {room, key}`, `get`, `invoke`, `delta`, `asset`, `revoked`, …) |
| `src/direct/envelope.ts` | sealed envelope `{evf, to, from, iv, ct}`: AES-256-GCM, AAD `from>to`, 120 s anti-replay |
| `src/direct/crypto.ts` | crypto backend: WebCrypto when `crypto.subtle` exists, else the lazy `crypto-fallback.ts`; opaque `DeviceKey`, `randomId()`, `sha256Digest()`, `cryptoBackend()`, `CryptoBackendError` |
| `src/direct/crypto-fallback.ts` | AES-256-GCM / HKDF-SHA256 / SHA-256 from `@noble/ciphers` + `@noble/hashes` 2.4.0 (exact pins), loaded only on plain-http pages — same bytes on the wire |
| `src/direct/pairing.ts` | pairing link `#c=<CODE>[&relay=…]`, 16-char code → room + key (HKDF), `PAIRING_TTL_MS` (5 min, both sides) |
| `src/direct/relay.ts` | relay contract: `DEFAULT_RELAY_URL`, `DEFAULT_APP_URL`, room URLs, control frames, limits |
| `src/direct/map.ts` | `MapSnapshot` (grid, walls, tiles, tokens, `evf-asset:<id>` pictures) |

## 🔐 Crypto on http pages

Browsers expose WebCrypto (`crypto.subtle`, `crypto.randomUUID`) only in secure contexts
(`https://`, `localhost`). A phone page on `http://<LAN-IP>` or a Foundry tab on
`http://192.168…` has neither; the channel then loads `crypto-fallback.ts` on first use. A
key made by either backend opens envelopes sealed by the other. A fallback that fails to load
raises `CryptoBackendError` (never reported as a bad envelope). See
[ADR-0019 Amendment 2](../../docs/architecture/0019-relay-pairing-player-projector.md) and
[SECURITY.md](../../SECURITY.md).

## 🧪 Testing

```bash
pnpm vitest --run packages/shared-protocol   # schemas, envelope, pairing, crypto (both backends)
```

## 📚 See also

- [ADR-0019](../../docs/architecture/0019-relay-pairing-player-projector.md) — relay pairing ·
  [ADR-0016](../../docs/architecture/0016-direct-foundry-streaming.md) — sealed envelope
- [Protocol wiki page](../../docs/wiki/Protocollo.md) (Italian)
