# Changelog

Il changelog canonico è in fondo a [`Specs.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/Specs.md#changelog); i changelog per pacchetto sono generati da Changesets (`packages/*/CHANGELOG.md`). Qui una sintesi per chi usa il progetto.

## 📝 v0.13.0 — relay e collegamento dal Foundry del giocatore (2026-09-25)

Perché: Foundry ≥ 14.361 serve l'HTML dei moduli come `text/plain` (la pagina degli occhiali servita da Foundry non si caricava più), i giocatori non possono creare utenti, i giochi privati di The Forge chiedono un login e le app Even Hub raggiungono solo indirizzi fissi ([ADR-0019](Decisioni-Architetturali)).

**Per i giocatori**
- **Collega occhiali G2**: tasto destro sul tuo nome nella lista *Giocatori* (o **Alt+G**) → QR e codice subito → sul telefono **«Scansiona QR»** o **«Inserisci codice»**. Niente GM, niente login sul telefono ([Collegare i tuoi occhiali](Associare-i-tuoi-Occhiali)).
- Gli occhiali si ricollegano **da soli** ogni volta che quel browser ha Foundry aperto; se è chiuso mostrano *Foundry del giocatore chiuso*. **Scollega** dalla stessa finestra.
- L'app **FoundryVTT G2 HUD** si installa da Even Hub (gruppo beta, poi store) e sopravvive al telefono bloccato ([Installazione](Installazione)).

**Per i GM**
- Niente più abilitazione dei giocatori né utenti «(G2)»; il GM collega gli occhiali solo per chi non ha un dispositivo ([Collegare per un giocatore](Abilitare-i-Giocatori)).
- Non serve più HTTPS pubblico per Foundry; **The Forge** funziona senza configurazioni, anche con gioco privato ([Rete e relay](HTTPS-e-Rete)).
- La mappa con l'arte della scena funziona anche con il CDN di The Forge: le immagini le prepara la scheda del giocatore ([Mappa](Mappa)).

**Architettura e strumenti**
- Nuovo pacchetto `packages/relay` (Cloudflare Worker + Durable Object per stanza) su `wss://evf-relay.evf-relay.workers.dev`; protocollo v2 con `rotate {room, key}` e messaggi `asset` ([Protocollo](Protocollo), [Architettura](Architettura)).
- Rimossi: utenti «(G2)», password sigillate, chiavi ECDH e custodia, elezione del projector, `/join` + socket.io nell'app, cartella `g2/` nello zip del modulo, `validate:direct-sideload`, `build:all` / `build:g2`.
- Nuovi: `pnpm dev:glasses`, `validate:relay`, test end-to-end sul relay in CI, gate 10 «solo relay», workflow `pages.yml` e `relay-deploy.yml` ([Debug e simulatore](Debug-e-Simulatore), [Release](Release)).
- **Migrazione**: i collegamenti della v0.12 non valgono più; ogni giocatore collega di nuovo gli occhiali (una volta).

## 📝 v0.12.0 — streaming diretto portato su `develop` (2026-09-23)

Lo streaming diretto (nato come «v0.10.0» sul suo ramo) è stato unito a `develop`, che nel frattempo aveva pubblicato la linea v0.9.14 → v0.10.0 → v0.11.0 basata sul bridge. Per non collidere, questa versione è la **v0.12.0**.

**Il port**
- Storia di `develop` conservata; rimossi `packages/bridge`, `packages/foundry-mcp`, `deploy/` e la documentazione del bridge (Docker, GHCR, cattura headless della mappa, sostrati raster/ibrido/showcase, token bearer).
- **ADR rinumerati**: 0012 → **0016** (streaming diretto), 0013 → **0017** (occhiali dei giocatori), 0014 → **0018** (HUD a scheda D&D). Gli ADR 0012–0015 di `develop` restano: 0012 (gesti R1) è il riferimento dei gesti; 0013, 0014 e 0015 sono superati da 0018, 0017 e 0016 ([Decisioni architetturali](Decisioni-Architetturali)).
- **Geometria provata sull'hardware**: il vero host G2 rifiuta le tile immagine fuori dalla griglia (il simulatore no). La HUD usa ora la griglia 2 × 2 di tile 288 × 144: la fascia alta 576 × 144 (ritratto, intestazione, mappa) è disegnata una volta e tagliata a x = 288, la scheda è la tile in basso a sinistra, il contesto resta testo in basso a destra ([Renderer a pixel](Renderer-Pixel)).
- **Correzioni tenute da `develop`**: `activity.use(usage, dialog, message)` con `configure:false` nel *dialog* (niente più attese di 10 s su attacchi e incantesimi), PF temporanei nulli, id stabili degli oggetti senza id, incantesimi preparati dnd5e 5.1, oggetti con quantità 0, audit con tempo massimo, prova di abilità (`skill-check`), CA dei combattenti, talenti e biografia, nome del file del modulo con la versione (cache di Foundry).
- **Distribuzione**: prossima release del modulo **v0.2.0** (l'ultima con il bridge è la v0.1.55). Chi usava il bridge: spegni il container e riassocia gli occhiali ([Collegare i tuoi occhiali](Associare-i-tuoi-Occhiali)).

## 📝 Streaming diretto — contenuto (2026-09-23)

**Architettura**
- Rimossi il bridge Node.js, `foundry-mcp` e Docker Compose. L'app degli occhiali è servita dal modulo Foundry e caricata con un QR ([ADR-0016](Decisioni-Architetturali)).
- Canale diretto: `POST /join` + socket.io sulla stessa origine, buste AES-256-GCM sul relay `module.evenfoundryvtt` ([Protocollo](Protocollo)).
- **Occhiali dei giocatori** (ADR-0017): abilitazione una tantum del GM, associazione self-service dal Foundry del giocatore, chiavi ECDH P-256, **projector ibrido** (client del giocatore se online, altrimenti un GM) ([Architettura](Architettura)).

**HUD**
- Layout **«Scheda da tavolo G2»** in cinque zone: ritratto, intestazione con scudo CA e box PF, mappa quadrata, scheda a due pagine, pannello contesto ([Leggere la HUD](Leggere-la-HUD)).
- Renderer a pixel 4-bit in TypeScript puro con font bitmap e icone D&D; 76 fixture golden come contratto INV-1 (ADR-0018, [Renderer a pixel](Renderer-Pixel)).
- **Mappa**: arte originale della scena pixelata (pixel 1/2/3, default 2), dithering Floyd–Steinberg a 16 livelli, oscurità fuori dal raggio visivo, segni vettoriali sopra ([Mappa](Mappa)).
- Associazione anche dalla lista *Giocatori* (clic destro → *Associa occhiali G2*).

**Piattaforma**
- Even Hub SDK 0.0.15; pressione lunga come extra (SDK ≥ 0.0.14, Even App ≥ 2.2.9); immagini fino a 288 × 144 con passo ≥ 100 ms.
- socketlib non più necessario.

**Documentazione**
- Questa wiki (`docs/wiki/`, pubblicata dal workflow *Wiki Sync*).

## 📝 Versioni precedenti

v0.9.11 (MVP) → v0.9.13 (dati della scheda) → v0.9.14 / v0.10.0 (sostrato raster) → v0.11.0 (HUD raster «showcase»), tutte basate sul bridge: descritte nel changelog di `Specs.md` e nelle release del modulo fino alla v0.1.55.
