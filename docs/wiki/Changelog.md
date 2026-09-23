# Changelog

Il changelog canonico è in fondo a [`Specs.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/Specs.md#changelog); i changelog per pacchetto sono generati da Changesets (`packages/*/CHANGELOG.md`). Qui una sintesi per chi usa il progetto.

## 📝 v0.10.0 — streaming diretto (2026-09-23)

**Architettura**
- Rimossi il bridge Node.js, `foundry-mcp` e Docker Compose. L'app degli occhiali è servita dal modulo Foundry e caricata con un QR ([ADR-0012](Decisioni-Architetturali)).
- Canale diretto: `POST /join` + socket.io sulla stessa origine, buste AES-256-GCM sul relay `module.evenfoundryvtt` ([Protocollo](Protocollo)).
- **Occhiali dei giocatori** (ADR-0013): abilitazione una tantum del GM, associazione self-service dal Foundry del giocatore, chiavi ECDH P-256, **projector ibrido** (client del giocatore se online, altrimenti un GM) ([Architettura](Architettura)).

**HUD**
- Layout **«Scheda da tavolo G2»** in cinque zone: ritratto, intestazione con scudo CA e box PF, mappa quadrata, scheda a due pagine, pannello contesto ([Leggere la HUD](Leggere-la-HUD)).
- Renderer a pixel 4-bit in TypeScript puro con font bitmap e icone D&D; 76 fixture golden come contratto INV-1 (ADR-0014, [Renderer a pixel](Renderer-Pixel)).
- **Mappa**: arte originale della scena pixelata (pixel 1/2/3, default 2), dithering Floyd–Steinberg a 16 livelli, oscurità fuori dal raggio visivo, segni vettoriali sopra ([Mappa](Mappa)).
- Associazione anche dalla lista *Giocatori* (clic destro → *Associa occhiali G2*).

**Piattaforma**
- Even Hub SDK 0.0.15; pressione lunga come extra (SDK ≥ 0.0.14, Even App ≥ 2.2.9); immagini fino a 288 × 144 con passo ≥ 100 ms.
- socketlib non più necessario.

**Documentazione**
- Questa wiki (`docs/wiki/`, pubblicata dal workflow *Wiki Sync*).

## 📝 Versioni precedenti

v0.9.11 (MVP) → v0.9.13 (dati della scheda), basate sul bridge: archiviate in `.planning/milestones/` e descritte nel changelog di `Specs.md`.
