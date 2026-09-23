# Mappa (zona C)

La zona C, in alto a destra, è una **mappa quadrata di 144 × 144 px** centrata sul tuo token. Mostra l'**arte originale della scena** — sfondo, tile e immagini dei token — **pixelata** e ridotta a 16 livelli di verde, con i segni tattici disegnati sopra in modo netto. È il disegno attuale della zona C ([ADR-0014](Decisioni-Architetturali), punto 5).

> Gli screenshot di questa wiki mostrano la mappa con l'arte originale pixelata (cripta generata per la demo). La mappa schematica (muri e griglia su fondo scuro) resta come **riserva** quando la scena non ha un'immagine o l'immagine non si carica.

## 👓 Come nasce l'immagine

Tutto avviene sul **telefono**, a partire dai dati compatti della scena che il projector invia (`MapSnapshot`, vedi [Protocollo](Protocollo)):

1. **Arte originale** — il telefono scarica sfondo, tile (fino a 32, nell'ordine di profondità) e immagini dei token **dalla stessa origine** di Foundry: niente CORS, niente proxy.
2. **Ritaglio** — una finestra intorno al tuo token (o ferma, se hai disattivato *segui*).
3. **Pixelatura** — riduzione a blocchi (media di ogni blocco *pixel × pixel*). La **dimensione del pixel** è 1, 2 o 3 (predefinita **2**). I blocchi sono ancorati ai pixel della scena, così non «strisciano» quando la mappa scorre.
4. **Tono e dithering** — curva di tono per il waveguide della G2, poi **Floyd–Steinberg** a 16 livelli di verde. L'arte resta sotto il mezzo tono: i numeri della HUD e i segni tattici restano sempre più luminosi.
5. **Visione** — tutto ciò che è **fuori dal raggio visivo** del tuo token, o dietro un muro che blocca la vista, resta **nero**: la mappa non rivela stanze che il personaggio non vede.
6. **Segni vettoriali** sopra l'arte (tabella sotto).

La mappa viene inviata agli occhiali **solo quando cambia** (hash per zona) e **al massimo una volta al secondo**, perché la banda BLE è di 10–30 KB/s e l'SDK accetta un'immagine ogni ≥ 100 ms ([FAQ Even Hub](https://hub.evenrealities.com/docs/reference/faq) · [changelog SDK 0.0.14](https://hub.evenrealities.com/docs/reference/changelog), verificati il 2026-09-23).

## 👓 Legenda dei segni

| Segno | Significato |
|---|---|
| **anello con nucleo**, massima luminosità | il **tuo** token |
| token chiaro | **alleato** |
| token con **croce scura** | **nemico** |
| token più tenue | **neutrale** |
| **mirino** | il bersaglio corrente (compare durante la scelta del bersaglio, [S4](Schermate)) |
| **puntini** intorno al tuo token | portata |
| linea piena / **tratteggiata** | muro / porta |
| **N** in alto a destra | nord |
| barra con **5 FT** in basso a sinistra | scala (una cella = 5 ft) |

## ⚙️ Zoom, pixel e segui

| Comando | Dove | Valori |
|---|---|---|
| **Zoom** (pixel per casella) | pressione lunga → *Mappa: zoom +* / *Mappa: zoom -*, *Azioni* → *Opzioni…*, oppure pagina del telefono → **Mappa** (*Casella N px*) | 6 · 8 · **12** px per casella; a 12 px la mappa copre 12 × 12 caselle ≈ 60 ft |
| **Dimensione del pixel** | pagina del telefono → **Arte mappa** (*Pixel ×N*) | ×1 · **×2** · ×3 |
| **Segui il mio token** | pressione lunga → *Mappa: segui/libera*, oppure pagina del telefono | attivo di default |

## 🔐 Visione e privacy: cosa la mappa non mostra

- **Raggio visivo**: si usa quello del tuo token in Foundry. Se il token non ha una visione limitata (visione disattivata o illimitata), il telefono usa **12 celle** (60 ft, la scurovisione più comune).
- **Linea di vista**: test in linea retta dal centro del token contro i muri della scena; una porta aperta o un muro trasparente alla vista non blocca. È un'approssimazione documentata: niente sorgenti di luce, niente memoria della nebbia di guerra, niente elevazione.
- **Filtri del projector**: i token nascosti non vengono inviati, le porte segrete appaiono come muri normali, i PF (come frazione) arrivano solo per il tuo token e per gli alleati.

## 🐞 Se la mappa non va

| Sintomo | Causa | Cosa fare |
|---|---|---|
| Mappa schematica (solo muri e griglia) | la scena non ha sfondo, o l'immagine non si carica | normale: è la riserva |
| Mappa ferma mentre la scheda si aggiorna | banda BLE bassa | avvicina il telefono agli occhiali; si riprende da sola |
| Tutto nero intorno al token | il token non vede (oscurità, muri) | è voluto: la mappa mostra solo ciò che vede il personaggio |
| Non c'è il tuo token | il personaggio non è piazzato sulla scena attiva | chiedi al GM di piazzarlo |

## 📚 Vedi anche

- [Renderer a pixel](Renderer-Pixel) — come sono disegnate le zone.
- [ADR-0014](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/architecture/0014-dnd-sheet-hud-pixel-renderer.md) · design: [`docs/design/g2-sheet-ux.html`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/design/g2-sheet-ux.html)
