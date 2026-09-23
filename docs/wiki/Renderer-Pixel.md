# Renderer a pixel

Le zone A–D della HUD sono **immagini disegnate da noi**, non testo firmware: il font firmware è proporzionale, senza dimensioni e **scarta** i simboli di cui una scheda ha bisogno (`▮ ▯ ◉ ⚠ ✓ ✖ ⌖ ▓ ░` misurano 0 px con `@evenrealities/pretext` 0.1.4). Decisione: [ADR-0018](Decisioni-Architetturali).

## 🏗️ Framebuffer e primitive

[`packages/shared-render/src/pixel/`](https://github.com/Aiacos/EvenFoundryVTT/tree/develop/packages/shared-render/src/pixel) — TypeScript puro, **senza DOM né canvas**: produce pixel identici byte per byte nella WebView e in Node/Vitest.

- `Pixmap` — framebuffer a 4 bit (livelli 0–15) con primitive intere e deterministiche: rettangoli, rettangoli arrotondati, linee di Bresenham (piene e tratteggiate), cerchi, ellissi, poligoni, Bézier campionate, pila di clip, blit / crop / dim, hash FNV-1a.
- **Font bitmap** disegnati a mano con gli accenti italiani composti: `LABEL_FONT` (maiuscole 7 px), `MEDIUM_FONT` (maiuscole e cifre 10 px), `LARGE_FONT` (cifre 16 px, `+ - /`). Funzioni: `measure`, `fitText` (troncamento con `…`), `drawText` (sinistra / centro / destra, grassetto a pixel), `missingGlyphs` per i test di copertura.
- **Icone D&D**: scudo (CA), cuore (PF), stella (ispirazione), d20, stivale, clessidra, teschio, martello, spada, segni dell'economia d'azione, mirino della mappa.

## 👓 Zone e budget SDK

| Zona | Area (x, y, l × a) | Container | Codice |
|---|---|---|---|
| A · Ritratto | 0, 0, 144 × 144 | image #1 | `packages/g2-app/src/hud/zones/portrait.ts` |
| B · Intestazione | 144, 0, 288 × 144 | image #2 | `zones/header.ts` |
| C · Mappa | 432, 0, 144 × 144 | image #3 | `zones/map.ts` + `hud/map-art/` |
| D · Scheda | 0, 144, 288 × 144 | image #4 | `zones/sheet.ts` |
| E · Contesto | 288, 144, 288 × 144 | 3 text (titolo · corpo · suggerimento) | `hud/text/context.ts` |
| Sfondo | 0, 0, 576 × 288 | text `' '`, `isEventCapture: 1` | — |

Budget: **4 / 4 image + 4 / 8 text** per pagina ([display](https://hub.evenrealities.com/docs/build/display): ≤ 4 immagini ≤ 288 × 144, ≤ 8 contenitori testo, un solo `isEventCapture`). Nessun `rebuildPageContainer` durante il gioco; le schermate a tutto schermo (S10, S11) usano 4 tile 288 × 144 con un solo rebuild in entrata e in uscita. La riga firmware misurata è di 27 px ⇒ la zona E ha titolo 1 + corpo 3 + suggerimento 1.

## ⚡ Invio delle immagini

`ZoneSender` (`packages/g2-app/src/hud/zones/zone-sender.ts`):

- **una immagine alla volta**, almeno `MIN_GAP_MS = 100` ms tra due invii (`updateImageRawData`, SDK ≥ 0.0.14);
- **hash per zona**: una zona che non cambia non viene reinviata; l'ultimo frame in coda sostituisce il precedente della stessa zona;
- **priorità**: intestazione (PF, turno) > mappa > scheda > ritratto;
- **mappa ≤ 1 fps** (`MAP_MIN_INTERVAL_MS = 1000`);
- un invio fallito dimentica l'hash e riprova dopo `RETRY_MS = 2000`;
- la codifica PNG avviene solo al momento dell'invio: PNG **4-bit indicizzato a palette esatta**, pixel-exact (`upng-js`).

## 👓 Gerarchia della luminosità

| Ruolo | Livello |
|---|---|
| PF, CA, turno, modificatori | 15 |
| testo | 11 |
| etichette | 7–9 |
| cornici | 3–6 |
| ritratto e arte della mappa | limitati al mezzo tono |

Un'area piena appare più luminosa del suo livello sul waveguide: per questo il ritratto è limitato (livello ≤ 8) e i numeri critici restano i segni più brillanti.

## 🛡️ Fixture INV-1

Il contratto eseguibile dell'invariante **INV-1** sono le fixture golden per zona:

```
packages/shared-render/src/fixtures/sheet.<zona>.<schermata>.<locale>.<variante>.txt
```

- zone `portrait` · `header` · `map` · `sheet` · `full` (S10/S11 a tutto schermo); schermate S1–S12; locale `it` / `en`; varianti `min` / `max` (PF e nomi lunghi);
- **76** file, una cifra esadecimale per pixel (livello 0–f), una riga per riga di pixel;
- generate e verificate da `packages/g2-app/src/hud/__tests__/golden.test.ts` con `matchPixelFixture`; lo stesso test verifica che le cornici delle zone non si spostino mai tra stati, lingue e contenuti.

Aggiornare una fixture è una modifica di design: va rivista come tale (vedi [Test e qualità](Test-e-Qualita)).

## 📚 Vedi anche

- [Mappa](Mappa) — la pipeline dell'arte originale pixelata.
- [`packages/shared-render/README.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/packages/shared-render/README.md) · `Specs.md` §7.0 e §7.1a
