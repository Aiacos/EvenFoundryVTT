# Protocollo del canale diretto

Contratto unico in [`packages/shared-protocol/src/direct/`](https://github.com/Aiacos/EvenFoundryVTT/tree/develop/packages/shared-protocol/src/direct): gli schemi Zod sono l'unica fonte dei tipi sul filo (principio P1). Crittografia solo WebCrypto (`globalThis.crypto.subtle`): funziona nella WebView della Even App, nei client Foundry e in Node ≥ 20 per i test.

## 🏗️ Trasporto

1. La pagina (`/modules/evenfoundryvtt/g2/index.html`) accede con `POST /join` sulla stessa origine → cookie `session` di prima parte.
2. Apre socket.io (`/socket.io/`, EIO 4) come utente «(G2)».
3. Tutto il traffico dell'app usa l'evento **`module.evenfoundryvtt`** (`DIRECT_SOCKET_EVENT`), che Foundry inoltra a tutti i client.

## 🔐 Busta sigillata

```ts
{ evf: 1, to: string, from: string, iv: string /* 16 car. base64url */, ct: string }
```

| Campo | Significato |
|---|---|
| `evf` | versione della busta (1) |
| `to` / `from` | indirizzi (id utente «(G2)», oppure `projector` — `PROJECTOR_ADDRESS`) |
| `iv` | IV casuale da 96 bit |
| `ct` | `AES-256-GCM(chiave dispositivo, JSON(messaggio + ts), AAD = "from>to")` |

- La **chiave del dispositivo** è di 32 byte in base64url (`generateDeviceKey`).
- `open()` non lancia mai eccezioni su input ostile: restituisce `malformed`, `auth` o `stale`.
- **Anti-replay**: `ts` dentro il testo cifrato, età massima `MAX_ENVELOPE_AGE_MS = 120_000`.

## 🏗️ Messaggi

Discriminati da `t`; `rid` (1–64 car.) correla richiesta e risposta ed è anche la **chiave di idempotenza** di `invoke`. Versione del protocollo: `DIRECT_PROTOCOL_VERSION = 1`.

| Direzione | `t` | Campi principali |
|---|---|---|
| app → projector | `hello` | `rid`, `proto: 1`, `app`, `locale?` |
| app → projector | `get` | `rid`, `what`: `character` · `combat` · `map` · `log` |
| app → projector | `invoke` | `rid`, `tool` (id kebab-case del registro `dispatchTool`), `input` |
| app → projector | `ping` | `rid` |
| projector → app | `welcome` | `rid`, `actorId`, `actorName`, `userName`, `gmName`, `worldTitle`, `locale?`, `rotate?` |
| projector → app | `snapshot` | `rid?`, `what`, `data` (validato dal consumatore con lo schema del topic) |
| projector → app | `delta` | `seq`, `topic`, `data` |
| projector → app | `result` | `rid`, `ok: true` + `data` · oppure `ok: false` + `error {code, message}` |
| projector → app | `pong` | `rid` |
| projector → app | `revoked` | — |

`rotate = { password?, key }`: nuove credenziali al primo `welcome` (QR monouso). `password` manca quando risponde il client di un giocatore, perché solo un GM può cambiare una password Foundry (ADR-0017).

**Tempi dell'app** (`SESSION_TIMING` in `packages/g2-app/src/direct/session.ts`): `welcome` entro 8 s, snapshot e `invoke` entro 10 s, heartbeat ogni 20 s, offline dopo 2 pong persi, nuovo tentativo con attesa 1 s → 30 s e jitter fino al 20 %.

## 🔐 Payload di associazione

- **QR**: `<origine>[/<prefisso>]/modules/evenfoundryvtt/g2/index.html#evf=<payload>`; `payload = base64url(JSON {v:1, u, p, k})` — `u` id utente «(G2)», `p` password (12–128 car.), `k` chiave AES-256 base64url. Il frammento non arriva mai al server.
- **Codice manuale**: 16 caratteri Crockford base32 (`MANUAL_CODE_LENGTH`), mostrato come `XXXX-XXXX-XXXX-XXXX`; il codice è la password e la chiave è `HKDF-SHA256(codice, salt = userId)`.

## 🔐 Sigilli a chiave pubblica (ADR-0017)

`SealedBlob = { v: 1, epk: <JWK P-256 effimera>, iv, ct }`, costruito in `ecdh.ts`:

1. coppia effimera P-256 per ogni sigillo;
2. `Z = ECDH(privata effimera, pubblica destinatario)`;
3. `K = HKDF-SHA256(Z, salt = x‖y effimeri, info = "evf-seal-v1|" + contesto)`;
4. `ct = AES-256-GCM(K, iv 96 bit, AAD = contesto)`.

La chiave pubblica di ogni client è in `flags.evenfoundryvtt.pub` (`IdentityPublicJwkSchema`: `kty: EC`, `crv: P-256`, `x`, `y`).

## 🗺️ MapSnapshot

Descrizione compatta della scena da cui il telefono disegna la zona C ([Mappa](Mappa)).

| Campo | Contenuto |
|---|---|
| `sceneId`, `name` | scena |
| `cols`, `rows` | dimensione in celle |
| `gridPx` | dimensione della cella in pixel di scena (converte l'arte in celle) |
| `background?` | immagine `{src, x, y, w, h}` in pixel di scena, URL relativo stessa origine |
| `tiles?` | fino a `MAX_MAP_TILES = 32` tile, `z` crescente (prima i più profondi) |
| `darkness` | oscurità della scena 0 (giorno) – 1 (notte) |
| `walls` | segmenti `c: [x1, y1, x2, y2]` in celle, `door?`, `open?` (non blocca la vista) |
| `tokens` | `{id, name, kind: self·ally·enemy·neutral, x, y, w, h, hp?, img?, sight?}` — già filtrati dal projector su ciò che il personaggio può vedere; `sight` solo sul proprio token |
| `selfTokenId?`, `targetId?` | token del personaggio associato e bersaglio corrente |

La geometria è in **celle** (numeri decimali ammessi), l'arte in **pixel di scena**: il payload resta piccolo e indipendente dalla risoluzione.

## 📚 Vedi anche

- [Architettura](Architettura) · [Revoca e sicurezza](Revoca-e-Sicurezza)
- [ADR-0016](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0016-direct-foundry-streaming.md) · [ADR-0017](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0017-player-owned-glasses-hybrid-projector.md)
