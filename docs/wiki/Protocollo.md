# Protocollo del canale diretto

Contratto unico in [`packages/shared-protocol/src/direct/`](https://github.com/Aiacos/EvenFoundryVTT/tree/develop/packages/shared-protocol/src/direct): gli schemi Zod sono l'unica fonte dei tipi sul filo (principio P1). Crittografia in `crypto.ts`: WebCrypto (`globalThis.crypto.subtle`) quando c'è — WebView della Even App su `https://`, client Foundry in `https://` o `localhost`, Node ≥ 20 per i test; sulle pagine `http://` non locali, dove il browser la nasconde, un fallback software caricato al bisogno (`crypto-fallback.ts`: `@noble/ciphers` + `@noble/hashes` 2.4.0) con gli stessi byte sul filo. `randomId()` sostituisce `crypto.randomUUID` ([ADR-0019](Decisioni-Architetturali), emendamento 2).

## 🏗️ Trasporto (ADR-0019)

1. Projector (scheda di Foundry) e app aprono ciascuno un WebSocket verso il relay: `relayRoomUrl(relay, stanza, ruolo)` = `wss://evf-relay.evf-relay.workers.dev/r/<stanza>?role=projector|glasses` (`DEFAULT_RELAY_URL`; il payload del QR può portare un relay diverso).
2. Il relay tiene **una connessione per ruolo** (la più nuova chiude la vecchia con `4000`, `RELAY_CLOSE_REPLACED`) e inoltra ogni frame all'altro ruolo, senza leggerlo; senza l'altro ruolo il frame è scartato.
3. Frame di controllo del relay (`RelayControlSchema`): `{"relay":"peer-up"}` quando entrambi i ruoli sono presenti, `{"relay":"peer-down"}` quando l'altro se ne va davvero (non quando viene sostituito).
4. Limiti: frame > 1 MiB (`MAX_RELAY_FRAME_BYTES`) chiudono il mittente con `1009`; più di 60 frame al secondo con `1008` (il projector cadenza i propri invii a ≤ 40 al secondo, `MAX_OUTGOING_FRAMES_PER_SECOND`). Salute: `GET /health` → `200 ok` con CORS `*` (`relayHealthUrl`).

Tutti gli altri frame sono buste sigillate. Il telefono non apre mai connessioni verso Foundry.

## 🔐 Busta sigillata

```ts
{ evf: 1, to: string, from: string, iv: string /* 16 car. base64url */, ct: string }
```

| Campo | Significato |
|---|---|
| `evf` | versione della busta (1) |
| `to` / `from` | indirizzi: `glasses` (`GLASSES_ADDRESS`) o `projector` (`PROJECTOR_ADDRESS`) |
| `iv` | IV casuale da 96 bit |
| `ct` | `AES-256-GCM(chiave dispositivo, JSON(messaggio + ts), AAD = "from>to")` |

- La **chiave del dispositivo** è di 32 byte in base64url (`generateDeviceKey`).
- `open()` non lancia mai eccezioni su input ostile: restituisce `malformed`, `auth` o `stale`.
- **Anti-replay**: `ts` dentro il testo cifrato, età massima `MAX_ENVELOPE_AGE_MS = 120_000`.

## 🏗️ Messaggi

Discriminati da `t`; `rid` (1–64 car.) correla richiesta e risposta ed è anche la **chiave di idempotenza** di `invoke`. Versione del protocollo: `DIRECT_PROTOCOL_VERSION = 2`.

| Direzione | `t` | Campi principali |
|---|---|---|
| app → projector | `hello` | `rid`, `proto: 2`, `app`, `locale?` |
| app → projector | `get` | `rid`, `what`: `character` · `combat` · `map` · `log` |
| app → projector | `invoke` | `rid`, `tool` (id kebab-case del registro `dispatchTool`), `input` |
| app → projector | `ping` | `rid` |
| projector → app | `welcome` | `rid`, `actorId`, `actorName`, `userName`, `gmName`, `worldTitle`, `locale?`, `moduleVersion?`, `rotate?` |
| projector → app | `snapshot` | `rid?`, `what`, `data` (validato dal consumatore con lo schema del topic) |
| projector → app | `delta` | `seq`, `topic`, `data` |
| projector → app | `result` | `rid`, `ok: true` + `data` · oppure `ok: false` + `error {code, message}` |
| projector → app | `pong` | `rid` |
| projector → app | `revoked` | — (dopo **Scollega**) |
| projector → app | `asset` | `id`, `data` (`data:image/png` o `image/jpeg` in base64, ≤ 900 000 car.): un'immagine della scena, inviata una volta per connessione prima dello snapshot che la cita |

`rotate = { room, key }`: stanza e chiave nuove al primo `welcome` (QR monouso); entrambe le parti passano alla nuova stanza e l'app ripete `hello`. L'app dice `hello` **una volta per ingresso nella stanza** (al `peer-up`, o dopo 1,5 s se non arriva); il projector manda lo stato completo una volta per collegamento e a un `hello` ripetuto risponde solo con `welcome`. Un `result` che rifiuta l'`hello` (`actor_missing`, `forbidden_actor`) porta l'app nello stato `actor`; la chiusura `4000` nello stato `replaced`, senza riconnessione automatica.

**Tempi dell'app** (`SESSION_TIMING` in `packages/g2-app/src/direct/session.ts`): `welcome` entro 8 s, snapshot e `invoke` entro 10 s, heartbeat ogni 20 s, offline dopo 2 pong persi, nuovo tentativo con attesa 1 s → 30 s e jitter fino al 20 %.

## 🔐 Payload di collegamento

- **QR**: `<pagina dell'app>#c=<CODICE>` (predefinita `https://aiacos.github.io/EvenFoundryVTT/app/`, circa 63 caratteri, QR piccolo con margine di 4 moduli) — solo il codice di 16 caratteri; stanza e chiave si derivano con HKDF come per il codice digitato. `&relay=ws(s)://…` compare solo per un relay alternativo (sviluppo, self-hosting). Il frammento non arriva mai a un server. L'app legge lo stesso link dall'URL (QR inquadrato con la Even Realities App), dalla foto di «Scansiona QR» o dal solo codice (`readPairingText`); la chiave `c` vale in qualunque maiuscola, anche come `?c=` nella query, e l'app rilegge il link su `hashchange`. Il telefono salva con l'associazione la stanza derivata dal codice (`from`) e, finché non arriva il primo `welcome`, l'ora del codice (`pendingSince`): un link con un codice già usato su quel telefono è ignorato, un codice senza risposta entro `PAIRING_TTL_MS` (5 min) è cancellato.
- **Codice manuale**: 16 caratteri Crockford base32 (`MANUAL_CODE_LENGTH`, 80 bit), mostrato come `XXXX-XXXX-XXXX-XXXX`; `deriveCodePairing` ricava stanza (128 bit, info `evf-room`) e chiave (256 bit, info `evf-key`) con HKDF-SHA256, quindi al telefono non serve altro.
- Nessun utente, password o URL di Foundry arriva al telefono.

## 🗺️ MapSnapshot

Descrizione compatta della scena da cui il telefono disegna la zona C ([Mappa](Mappa)).

| Campo | Contenuto |
|---|---|
| `sceneId`, `name` | scena |
| `cols`, `rows` | dimensione in celle |
| `gridPx` | dimensione della cella in pixel di scena (converte l'arte in celle) |
| `background?` | immagine `{src, x, y, w, h}` in pixel di scena; `src` = `evf-asset:<id>` di un messaggio `asset` (`ASSET_REF_PREFIX`); lo stesso per le immagini di `tiles` e `tokens` |
| `tiles?` | fino a `MAX_MAP_TILES = 32` tile, `z` crescente (prima i più profondi) |
| `darkness` | oscurità della scena 0 (giorno) – 1 (notte) |
| `walls` | segmenti `c: [x1, y1, x2, y2]` in celle, `door?`, `open?` (non blocca la vista) |
| `tokens` | `{id, name, kind: self·ally·enemy·neutral, x, y, w, h, hp?, img?, sight?}` — già filtrati dal projector su ciò che il personaggio può vedere; `sight` solo sul proprio token |
| `selfTokenId?`, `targetId?` | token del personaggio associato e bersaglio corrente |

La geometria è in **celle** (numeri decimali ammessi), l'arte in **pixel di scena**: il payload resta piccolo e indipendente dalla risoluzione.

## 📚 Vedi anche

- [Architettura](Architettura) · [Scollegare e sicurezza](Revoca-e-Sicurezza)
- [ADR-0019](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0019-relay-pairing-player-projector.md) · [ADR-0016](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0016-direct-foundry-streaming.md) (busta sigillata) · relay: [`packages/relay/README.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/packages/relay/README.md)
