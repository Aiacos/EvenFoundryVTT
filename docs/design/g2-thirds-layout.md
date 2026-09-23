# G2 Thirds Layout — design & mock (v0.10)

> Contratto di design per la UI "a terzi" e per il flusso di associazione diretto
> Foundry → occhiali. Decisione architetturale: [ADR-0012](../architecture/0012-direct-foundry-streaming.md).
> I mock sono generati e **validati in larghezza** da uno script (ogni riga = 97 caratteri,
> 24 righe) e sono il riferimento per gli snapshot test INV-1 in `packages/g2-app`.

> ⚠️ **SUPERSEDED (2026-09-23, giro UX 2)** — sostituito dalla proposta «Scheda da tavolo G2»
> ([`g2-sheet-ux.html`](g2-sheet-ux.html)): ritratto 144² in alto a sinistra, intestazione con scudo CA /
> PF / INIZ·VEL·COMP ed economia d'azione, mappa quadrata 144² in alto a destra, scheda a due pagine
> (Caratteristiche · TS e abilità) in basso a sinistra, pannello contesto in basso a destra. Il flusso di
> associazione e il modello di input qui descritti restano validi.

## 🎲 Obiettivo

- **Scheda PG sempre visibile** su 1/3 del display (sinistra).
- **Mappa pixelata** sempre visibile su 1/3 (centro), centrata sul proprio token.
- **Colonna contesto** sul terzo restante (destra): registro, iniziativa, azioni, bersagli,
  incantesimi, esiti, reazioni. È l'unica colonna che cambia contenuto con l'input.
- Nessuno spostamento di layout tra stati: i confini di colonna sono identici in tutti i
  mock (INV-1). Il giocatore impara *dove* guardare una volta sola.

## 🏗️ Griglia e budget container

Canvas G2 576×288 px (4-bit verde). Tre colonne da **192 px** (≈31 caratteri a 6 px).

| Colonna | x (px) | Contenuto | Container SDK |
|---|---|---|---|
| A · Scheda | 0–191 | testo, 4 pagine (Principale, Combattimento, Abilità & TS, Incantesimi/Inventario) | 1 text (header 2 righe) + 1 text (corpo) → `textContainerUpgrade` senza flicker |
| B · Mappa | 192–383 | pixel map 192×288 | 2 image 192×144 impilate (max SDK 288×144) |
| C · Contesto | 384–575 | lista/testo per stato | 1 text header + 1 list *o* text corpo + 1 text footer (hint gesture) |
| Sfondo | 0–575 | cattura input | 1 text full-screen `' '`, `isEventCapture: 1`, `zOrderIndex` minimo |

Totale: **2 image / 4 image** e **6 text-list / 8** → restano 2 image (ritratto o
zoom bersaglio, futuro) e 2 text (toast). Tutti i container dichiarano `zOrderIndex`
univoco (obbligatorio da SDK 0.0.12 se usato da uno).

**Font proporzionale** (firmware, nessuna dimensione): le larghezze sono stimate in
caratteri nei mock, ma a build-time vengono misurate in pixel con
`@evenrealities/pretext` (budget per stringa per colonna, IT + EN, min/max contenuto).
Glifi non supportati dal font vengono scartati silenziosamente → si usa solo il set
**misurato** con `@evenrealities/pretext` 0.1.4 (larghezza > 0): `● ○ ■ □ ★ ▲ ▶ · ─ │ …`.

> 📏 **Realtà misurata (2026-09-23, INV-2).** I mock qui sotto sono in griglia monospace a
> 31 caratteri per colonna e descrivono l'**architettura dell'informazione** (cosa appare,
> dove, in che ordine). Il font firmware è proporzionale, ~10 px/carattere medio: una colonna
> da 192 px contiene **~18 caratteri × 11 righe**. Inoltre `▮ ▯ ◉ ⚠ ✓ ✖ ⌖ ▓ ░` hanno
> larghezza 0 nel font reale e verrebbero scartati: nel runtime diventano `■ □ ★ ▲ ▶ ●`, il
> mirino `⌖` è disegnato in pixel nell'immagine mappa, `▓ ▒ ░` esistono solo come livelli di
> grigio dentro l'immagine. **Il contratto INV-1 eseguibile sono le fixture misurate**
> `packages/shared-render/src/fixtures/thirds.m01…m11.{it,en}.{min,max}.txt`, verificate dai
> test (confini di colonna identici in tutti gli stati, larghezza in pixel, soli glifi presenti).

### Mappa pixelata

- Il telefono costruisce la mappa dallo **snapshot scena** (griglia, muri, luci, token
  visibili al PG, URL dello sfondo scaricato same-origin da Foundry).
- 1 cella di griglia = **12 px** (default, scelto per leggibilità a colpo d'occhio; 8/6 px come zoom out) → 16×24 celle ≈ 80×120 ft.
- Palette: sfondo scena dithered a 4 livelli bassi (0–5), muri 9, luce 7, token 15;
  il proprio token lampeggia 15/11 a ogni frame; bersaglio selezionato = mirino `⌖`.
- **Segui token** (default): la vista si ricentra quando il PG esce dal 50% centrale.
- Budget: ≤ 1 frame/s, solo tile cambiate (hash per tile 192×144), invio serializzato
  con passo ≥ 100 ms (limite SDK 0.0.14). BLE 10–30 KB/s → una tile 192×144 4-bit
  = 13,8 KB grezzi, LZ4 in transito (SDK 0.0.12).
- Fallback: se due frame consecutivi falliscono, la colonna B passa in modalità
  **glyph** (testo `▓▒░@`) finché il link non si stabilizza.

## 🕹️ Modello di input

Eventi SDK 0.0.15 (anello R1 e touchpad producono gli stessi eventi):

| Gesto | Radice (M01/M02) | Liste (M03–M05, M07) | Esito (M06) |
|---|---|---|---|
| swipe su / giù | scorre registro/iniziativa | sposta cursore `▶` | — |
| tap | apre **Azioni** (M03) | conferma voce | azione successiva suggerita |
| doppio tap | **esce dall'app** (`shutDownPageContainer(1)`, obbligo Even Hub) | indietro di un livello | chiude |
| pressione lunga (extra) | menu contestuale di sistema | menu contestuale | menu contestuale |

Il **menu contestuale** (`menuObject`, max 10 voci da 32 byte) contiene solo scorciatoie
già raggiungibili con il tap (la pressione lunga è un *extra* per le linee guida Even):
`Scheda ▸ pagina succ.` · `Mappa ▸ zoom +/−` · `Mappa ▸ segui/libera` · `Vantaggio/Svantaggio`
· `Fine turno` · `Lingua` · `Riconnetti`.

Stati (macchina a stati della colonna C):

```
            tap                 tap (voce attacco)          tap (tira)
 [Radice] ──────▶ [Azioni] ─────────────────────▶ [Bersaglio] ─────────▶ [Esito]
   ▲  ▲             │ tap (incantesimi)              │                       │
   │  │             ▼                                │ ●● indietro           │ ●● / timeout 8 s
   │  └─────── [Incantesimi] ──tap──▶ [Slot] ──▶ [Bersaglio]                  │
   │                                                                          │
   └────────────────────────────── ●● indietro ◀────────────────────────────┘
 evento Foundry "reazione disponibile" ──▶ [Reazione] (priorità, timeout 10 s)
 connessione persa ──▶ [Offline] (scheda+mappa congelate e attenuate)
```

La colonna A cambia pagina **automaticamente** (Principale ⇄ Combattimento quando
inizia/finisce il combattimento) o dal menu contestuale; non cattura mai input.

## 🔐 Associazione e connessione

1. **GM su Foundry**: *Impostazioni ▸ Configura impostazioni ▸ EvenFoundryVTT ▸ Associa occhiali G2*
   (P01). Sceglie giocatore e PG. Il modulo crea/aggiorna l'utente `«<Giocatore> (G2)»`
   (ruolo Giocatore, proprietario solo del PG), genera password e chiave `K`, mostra il QR.
2. **Giocatore**: apre la Even Realities App e inquadra il QR. L'app carica
   `https://<foundry>/modules/evenfoundryvtt/g2/index.html#evf=…` — la pagina è servita
   **da Foundry stesso**, quindi non serve alcun server, whitelist o CORS.
3. **g2-app** legge il frammento, salva le credenziali in `localStorage` (persiste a
   sospensione/aggiornamento), rimuove il frammento dall'URL, esegue `POST /join`,
   apre il socket e invia `hello` sigillato. Il GM risponde `welcome` e **ruota la
   password** (QR monouso). Gli occhiali mostrano M10 poi M01.
4. **Riconnessione** automatica con backoff (1→30 s) a ogni `FOREGROUND_ENTER` e perdita
   socket; nel frattempo M11 (dati congelati). Nessun GM online → M11 con causa esplicita.
5. **Revoca**: P01 ▸ *Revoca* → utente G2 disabilitato + chiave dimenticata; gli occhiali
   ricevono `revoked` e tornano a M09.

Fallback manuale (P03): se l'app viene riaperta senza credenziali, sceglie un utente
«(G2)» dalla pagina `/join` dello stesso server e inserisce il codice di 16 caratteri
mostrato sotto il QR.

## 🖼️ Mock occhiali (576×288)

Legenda mappa: `@` tu · `a` alleato · `g`/`G` nemici · `▓` muro · `▒` luce · `░` penombra
· `·` raggio di movimento · `⌖` bersaglio. Le cornici sono concettuali (bordi container
`borderWidth` 1, colore 6).

### M01 · Esplorazione (default)

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ SCENA  Cripta di Vel'Nar      │
│ Nano delle colline · PHB24    │ ▓░░░░░░░░░▓▓▓▓▓░░░░░░░░░░░░░▓ │ Esplorazione · ⌁ collegato    │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│ PF  ██████████░░░  45/68      │ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │ Registro                      │
│     temp +10                  │ ▓░▒▒▒▒▒▒▒░░░░░░░▒▒▒▒a▒▒▒▒▒▒░▓ │  Mira: Percezione 17 ✓        │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒@▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │  GM: «Senti passi a nord»     │
│ COMP +3  PERC 13  ISP ○       │ ▓░▒▒▒▒▒▒▒░░░░░░░▒▒▒▒▒▒▒▒▒▒▒░▓ │  Thorin raccoglie: torcia     │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │  Bram si muove (20 ft)        │
│ FOR 18+4  DES 12+1  COS 16+3  │ ▓░░░░▒░░░░▓   ▓░░░░░░▒░░░░░░▓ │                               │
│ INT 10+0  SAG 13+1  CAR  8-1  │ ▓▓▓▓▓▒▓▓▓▓▓   ▓▓▓▓▓▓▓▒▓▓▓▓▓▓▓ │                               │
│───────────────────────────────│ ▓    ▒              ▒       ▓ │                               │
│ Azione ●  Bonus ●  Reaz ●     │ ─ ─ ─ tile A ▲ │ ▼ tile B ─ ─ │                               │
│ Movimento 30/30 ft            │ ▓▓▓▓▓▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▓▓▓▓▓▓▓▓ │                               │
│───────────────────────────────│ ▓░░░░▒░░░░░░░░░░░░░░▒░░░░░░░▓ │                               │
│ Slot  1°▮▮▯▯  2°▮▯▯           │ ▓░          ░░░░          ░░▓ │                               │
│ Ki/Surge  Action Surge 1/1    │ ▓░   (nebbia di guerra)    ░▓ │                               │
│───────────────────────────────│ ▓░                         ░▓ │───────────────────────────────│
│ Condizioni                    │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ Party                         │
│  ▸ Benedetto (7 round)        │                               │  Mira   ▮▮▮▮▮▯ 31/38          │
│  ▸ Concentrazione: —          │ @ tu  a alleato  ▓ muro       │  Bram   ▮▮▮▮▯▯ 22/33          │
│                               │ ▒ luce  ░ penombra   ⌖ segui  │───────────────────────────────│
│ ◀ 1/4 Principale  ▶           │ 1 cella = 12 px · 16×24 celle │ ● tocca: azioni  ●● esci      │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M02 · Combattimento — il tuo turno

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ INIZIATIVA        round 3     │
│ ▲ IL TUO TURNO · round 3      │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │───────────────────────────────│
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ ▶ Thorin        19   45/68    │
│ PF  ██████████░░░  45/68      │ ▓░▒▒▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒G▒▒▒▒▒▒░▓ │   Goblin A      17   ▮▮▯      │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Mira          15   31/38    │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Boss Hobgob.  12   ▮▮▮▮     │
│ Azione ●  Bonus ●  Reaz ●     │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Goblin B       9   ▮▮▮      │
│ Movimento 30/30 ft            │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Bram           6   22/33    │
│ Attacchi  2/2 (Extra Attack)  │ ▓░▒▒▒▒▒▒··@··▒▒▒▒a▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│───────────────────────────────│ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ Ultimi eventi                 │
│ Armi                          │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │  Goblin A → Mira  mancato     │
│  Ascia bipenne  +7  1d12+4    │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │  Mira → Goblin A  7 perforanti│
│  Giavellotto    +7  1d6+4     │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│───────────────────────────────│ ▓░▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Risorse                       │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│  Second Wind      1/1         │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │                               │
│  Action Surge     1/1         │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                               │
│───────────────────────────────│                               │                               │
│ Condizioni                    │ @ tu   g goblin   G boss      │                               │
│  ▸ Benedetto (7 round)        │ · movimento 30 ft (6 celle)   │                               │
│                               │ ▲ turno: TU · round 3         │───────────────────────────────│
│ ◀ 2/4 Combattimento ▶         │                               │ ● azioni  ⇅ scorri  ●● esci   │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M03 · Menu azioni (click)

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ AZIONI · Thorin               │
│ ▲ IL TUO TURNO · round 3      │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │───────────────────────────────│
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ ▶ Attacca: Ascia bipenne      │
│ PF  ██████████░░░  45/68      │ ▓░▒▒▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒G▒▒▒▒▒▒░▓ │   Attacca: Giavellotto        │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Scatto                      │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Disimpegno                  │
│ Azione ●  Bonus ●  Reaz ●     │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Schivata                    │
│ Movimento 30/30 ft            │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Second Wind   (bonus)       │
│ Attacchi  2/2 (Extra Attack)  │ ▓░▒▒▒▒▒▒··@··▒▒▒▒a▒▒▒▒▒▒▒▒▒░▓ │   Action Surge                │
│───────────────────────────────│ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Muovi…                      │
│ Armi                          │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Oggetto…                    │
│  Ascia bipenne  +7  1d12+4    │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Fine turno                  │
│  Giavellotto    +7  1d6+4     │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│───────────────────────────────│ ▓░▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Risorse                       │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│  Second Wind      1/1         │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │                               │
│  Action Surge     1/1         │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                               │
│───────────────────────────────│                               │                               │
│ Condizioni                    │ @ tu   g goblin   G boss      │                               │
│  ▸ Benedetto (7 round)        │ · movimento 30 ft (6 celle)   │                               │
│                               │ ▲ turno: TU · round 3         │───────────────────────────────│
│ ◀ 2/4 Combattimento ▶         │                               │ ⇅ scegli  ● conferma  ●● esci │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M04 · Selezione bersaglio

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ BERSAGLIO · Ascia bipenne     │
│ ▲ IL TUO TURNO · round 3      │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │ portata 5 ft · +7 · 1d12+4    │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│ PF  ██████████░░░  45/68      │ ▓░▒▒▒▒▒▒▒⌖▒▒▒▒▒▒▒▒▒▒G▒▒▒▒▒▒░▓ │ ▶ Goblin A    5 ft  CA 15 ▮▮▯ │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Goblin B   35 ft  fuori pt. │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Boss       40 ft  fuori pt. │
│ Azione ●  Bonus ●  Reaz ●     │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Movimento 30/30 ft            │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Attacchi  2/2 (Extra Attack)  │ ▓░▒▒▒▒▒▒··@··▒▒▒▒a▒▒▒▒▒▒▒▒▒░▓ │                               │
│───────────────────────────────│ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Armi                          │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│  Ascia bipenne  +7  1d12+4    │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│  Giavellotto    +7  1d6+4     │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│───────────────────────────────│ ▓░▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Risorse                       │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│  Second Wind      1/1         │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │ Vantaggio: no  (menu ⋯)       │
│  Action Surge     1/1         │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ⌖ sulla mappa = selezionato   │
│───────────────────────────────│                               │                               │
│ Condizioni                    │ @ tu   g goblin   G boss      │                               │
│  ▸ Benedetto (7 round)        │ · movimento 30 ft (6 celle)   │                               │
│                               │ ▲ turno: TU · round 3         │───────────────────────────────│
│ ◀ 2/4 Combattimento ▶         │                               │ ⇅ scegli  ● tira  ●● indietro │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M05 · Incantesimi (PG incantatore)

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ INCANTESIMI · Mira (Chierico) │
│ Nano delle colline · PHB24    │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │ Slot 1°▮▮▮▯  2°▮▮▯  3°▮▯      │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│ PF  ██████████░░░  45/68      │ ▓░▒▒▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒G▒▒▒▒▒▒░▓ │   Trucchetti                  │
│     temp +10                  │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Fiamma sacra      az. 60ft  │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Guida             az.  ◇C   │
│ COMP +3  PERC 13  ISP ○       │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   1° livello                  │
│───────────────────────────────│ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ ▶ Cura ferite       az. tocco │
│ FOR 18+4  DES 12+1  COS 16+3  │ ▓░▒▒▒▒▒▒··@··▒▒▒▒a▒▒▒▒▒▒▒▒▒░▓ │   Benedizione       az. ◇C    │
│ INT 10+0  SAG 13+1  CAR  8-1  │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Scudo della fede  bon. ◇C   │
│───────────────────────────────│ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   2° livello                  │
│ Azione ●  Bonus ●  Reaz ●     │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Arma spirituale   bon. 60ft │
│ Movimento 30/30 ft            │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Preghiera guarig. 10 min    │
│───────────────────────────────│ ▓░▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Slot  1°▮▮▯▯  2°▮▯▯           │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Ki/Surge  Action Surge 1/1    │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │                               │
│───────────────────────────────│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │───────────────────────────────│
│ Condizioni                    │                               │ ◇C = concentrazione           │
│  ▸ Benedetto (7 round)        │ @ tu   g goblin   G boss      │ Cura ferite: slot 1°–3°       │
│  ▸ Concentrazione: —          │ · movimento 30 ft (6 celle)   │                               │
│                               │ ▲ turno: TU · round 3         │                               │
│ ◀ 1/4 Principale  ▶           │                               │ ⇅ scegli  ● lancia  ●● esci   │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M06 · Esito del tiro

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ESITO                         │
│ ▲ IL TUO TURNO · round 3      │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │───────────────────────────────│
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ Ascia bipenne → Goblin A      │
│ PF  ██████████░░░  45/68      │ ▓░▒▒▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒G▒▒▒▒▒▒░▓ │                               │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Attacco   d20 16 +7 = 23    │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   vs CA 15        ✓ COLPITO   │
│ Azione ●  Bonus ●  Reaz ●     │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Movimento 30/30 ft            │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Danni  1d12+4 = 11 taglienti│
│ Attacchi  2/2 (Extra Attack)  │ ▓░▒▒▒▒▒▒··@··▒▒▒▒a▒▒▒▒▒▒▒▒▒░▓ │   Goblin A  ▮▯▯ → ✖ abbattuto │
│───────────────────────────────│ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Armi                          │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│  Ascia bipenne  +7  1d12+4    │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ Attacchi rimasti 1/2          │
│  Giavellotto    +7  1d6+4     │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ Azione ○  Bonus ●  Reaz ●     │
│───────────────────────────────│ ▓░▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Risorse                       │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│  Second Wind      1/1         │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │                               │
│  Action Surge     1/1         │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                               │
│───────────────────────────────│                               │                               │
│ Condizioni                    │ @ tu   g goblin   G boss      │                               │
│  ▸ Benedetto (7 round)        │ · movimento 30 ft (6 celle)   │                               │
│                               │ ▲ turno: TU · round 3         │───────────────────────────────│
│ ◀ 2/4 Combattimento ▶         │                               │ ● secondo attacco  ●● chiudi  │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M07 · Reazione (turno nemico)

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ⚠ REAZIONE DISPONIBILE        │
│ ▲ IL TUO TURNO · round 3      │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │───────────────────────────────│
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ Goblin B esce dalla tua       │
│ PF  ██████████░░░  45/68      │ ▓░▒▒▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒G▒▒▒▒▒▒░▓ │ portata (5 ft).               │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ ▶ Attacco di opportunità      │
│ Azione ●  Bonus ●  Reaz ●     │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Ascia bipenne +7            │
│ Movimento 30/30 ft            │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   Ignora                      │
│ Attacchi  2/2 (Extra Attack)  │ ▓░▒▒▒▒▒▒··@··▒▒▒▒a▒▒▒▒▒▒▒▒▒░▓ │                               │
│───────────────────────────────│ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │   scade tra  ▮▮▮▮▮▯▯▯  6 s    │
│ Armi                          │ ▓░▒▒▒▒▒▒·····▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│  Ascia bipenne  +7  1d12+4    │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│  Giavellotto    +7  1d6+4     │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ Turno di: Goblin B            │
│───────────────────────────────│ ▓░▒▒▒▒▒g▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ Risorse                       │ ▓░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│  Second Wind      1/1         │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░▓ │                               │
│  Action Surge     1/1         │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                               │
│───────────────────────────────│                               │                               │
│ Condizioni                    │ @ tu   g goblin   G boss      │                               │
│  ▸ Benedetto (7 round)        │ · movimento 30 ft (6 celle)   │                               │
│                               │ ▲ turno: TU · round 3         │───────────────────────────────│
│ ◀ 2/4 Combattimento ▶         │                               │ ⇅ scegli  ● conferma          │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M08 · Scheda pagina 3 — Abilità & TS

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ SCENA  Cripta di Vel'Nar      │
│ Tiri salvezza                 │ ▓░░░░░░░░░▓▓▓▓▓░░░░░░░░░░░░░▓ │ Esplorazione · ⌁ collegato    │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │───────────────────────────────│
│ ◉FOR +7  ○DES +1  ◉COS +6     │ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │ Registro                      │
│ ○INT +0  ○SAG +1  ○CAR -1     │ ▓░▒▒▒▒▒▒▒░░░░░░░▒▒▒▒a▒▒▒▒▒▒░▓ │  Mira: Percezione 17 ✓        │
│───────────────────────────────│ ▓░▒▒▒@▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │  GM: «Senti passi a nord»     │
│ Abilità        (◉ competente) │ ▓░▒▒▒▒▒▒▒░░░░░░░▒▒▒▒▒▒▒▒▒▒▒░▓ │  Thorin raccoglie: torcia     │
│ ◉Atletica      +7             │ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │  Bram si muove (20 ft)        │
│ ◉Intimidire    +2             │ ▓░░░░▒░░░░▓   ▓░░░░░░▒░░░░░░▓ │                               │
│ ◉Percezione    +4             │ ▓▓▓▓▓▒▓▓▓▓▓   ▓▓▓▓▓▓▓▒▓▓▓▓▓▓▓ │                               │
│ ◉Sopravviv.    +4             │ ▓    ▒              ▒       ▓ │                               │
│ ○Acrobazia     +1             │ ─ ─ ─ tile A ▲ │ ▼ tile B ─ ─ │                               │
│ ○Furtività     +1             │ ▓▓▓▓▓▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▓▓▓▓▓▓▓▓ │                               │
│ ○Indagare      +0             │ ▓░░░░▒░░░░░░░░░░░░░░▒░░░░░░░▓ │                               │
│ ○Intuizione    +1             │ ▓░          ░░░░          ░░▓ │                               │
│ ○Persuasione   -1             │ ▓░   (nebbia di guerra)    ░▓ │                               │
│  … altre 8 (swipe nel menu)   │ ▓░                         ░▓ │───────────────────────────────│
│───────────────────────────────│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ Party                         │
│ Percezione passiva 14         │                               │  Mira   ▮▮▮▮▮▯ 31/38          │
│ Sensi  Scurovisione 60 ft     │ @ tu  a alleato  ▓ muro       │  Bram   ▮▮▮▮▯▯ 22/33          │
│                               │ ▒ luce  ░ penombra   ⌖ segui  │───────────────────────────────│
│ ◀ 3/4 Abilità & TS ▶          │ 1 cella = 12 px · 16×24 celle │ ● tocca: azioni  ●● esci      │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

### M09 · Primo avvio — occhiali non associati

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                               │
│   EVENFOUNDRYVTT                                                          ⌁ v0.10             │
│   ───────────────────────────────────────────────────────────────────────────────             │
│                                                                                               │
│   Occhiali non ancora associati a Foundry.                                                    │
│                                                                                               │
│   1. Su Foundry (PC):  Impostazioni ▸ Configura moduli ▸ EvenFoundryVTT                       │
│                        ▸ «Associa occhiali G2»  → appare un QR                                │
│                                                                                               │
│   2. Sul telefono:     Even Realities App ▸ scansiona il QR                                   │
│                        (l'app si riapre già collegata al tuo PG)                              │
│                                                                                               │
│   3. Fatto.  Nessun server da installare, nessun URL da digitare.                             │
│                                                                                               │
│                                                                                               │
│   Serve aiuto? Apri questa app sul telefono: trovi la pagina                                  │
│   «Connessione» con lo stato e l'inserimento manuale del codice.                              │
│                                                                                               │
│                                                                                               │
│                                                                                               │
│                                                                                               │
│   ●● esci                                                                                     │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### M10 · Collegamento in corso

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                               │
│   EVENFOUNDRYVTT                                                          ⌁ v0.10             │
│   ───────────────────────────────────────────────────────────────────────────────             │
│                                                                                               │
│   Collegamento a  foundry.casa-rossi.it …                                                     │
│                                                                                               │
│   ✓ server raggiungibile (HTTPS)                                                              │
│   ✓ accesso come  «Luca (G2)»                                                                 │
│   ✓ GM connesso: Anna                                                                         │
│   ▸ ricevo scheda di  Thorin …                                                                │
│   ○ ricevo scena                                                                              │
│                                                                                               │
│                                                                                               │
│   ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯▯▯▯▯▯▯                                                        │
│                                                                                               │
│                                                                                               │
│                                                                                               │
│                                                                                               │
│                                                                                               │
│                                                                                               │
│                                                                                               │
│   ●● annulla                                                                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### M11 · Connessione persa — stato congelato

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ THORIN  Guerriero 5           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │ ⚠ CONNESSIONE PERSA           │
│ Nano delle colline · PHB24    │ ▓░░░░░░░░░▓▓▓▓▓░░░░░░░░░░░░░▓ │───────────────────────────────│
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │ Foundry non risponde.         │
│ PF  ▒▒▒▒▒▒▒▒▒▒░░░  45/68      │ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │ Riprovo tra 8 s  (tent. 3)    │
│     temp +10                  │ ▓░▒▒▒▒▒▒▒░░░░░░░▒▒▒▒a▒▒▒▒▒▒░▓ │                               │
│ CA 18   VEL 30   INIZ +1      │ ▓░▒▒▒@▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░▓ │ Dati mostrati: 2 min fa       │
│ COMP +3  PERC 13  ISP ○       │ ▓░▒▒▒▒▒▒▒░░░░░░░▒▒▒▒▒▒▒▒▒▒▒░▓ │ (scheda e mappa congelate)    │
│───────────────────────────────│ ▓░▒▒▒▒▒▒▒░▓   ▓░▒▒▒▒▒▒▒▒▒▒▒░▓ │                               │
│ FOR 18+4  DES 12+1  COS 16+3  │ ▓░░░░▒░░░░▓   ▓░░░░░░▒░░░░░░▓ │───────────────────────────────│
│ INT 10+0  SAG 13+1  CAR  8-1  │ ▓▓▓▓▓▒▓▓▓▓▓   ▓▓▓▓▓▓▓▒▓▓▓▓▓▓▓ │ Possibili cause               │
│───────────────────────────────│ ▓    ▒              ▒       ▓ │  · telefono in background     │
│ Azione ●  Bonus ●  Reaz ●     │ ─ ─ ─ tile A ▲ │ ▼ tile B ─ ─ │  · Foundry offline / riavvio  │
│ Movimento 30/30 ft            │ ▓▓▓▓▓▒▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▓▓▓▓▓▓▓▓ │  · nessun GM connesso         │
│───────────────────────────────│ ▓░░░░▒░░░░░░░░░░░░░░▒░░░░░░░▓ │                               │
│ Slot  1°▮▮▯▯  2°▮▯▯           │ ▓░          ░░░░          ░░▓ │                               │
│ Ki/Surge  Action Surge 1/1    │ ▓░   (nebbia di guerra)    ░▓ │                               │
│───────────────────────────────│ ▓░                         ░▓ │                               │
│ Condizioni                    │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │                               │
│  ▸ Benedetto (7 round)        │                               │                               │
│  ▸ Concentrazione: —          │ @ tu  a alleato  ▓ muro       │                               │
│                               │ ▒ luce  ░ penombra   ⌖ segui  │───────────────────────────────│
│ ◀ 1/4 Principale  ▶           │ 1 cella = 12 px · 16×24 celle │ ● riprova ora  ●● esci        │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

## 📱 Mock telefono e Foundry

### P01 · Foundry · finestra «Associa occhiali G2» (GM)

```
╭────────────────────────────────────────────────────────────────────────╮
│ EvenFoundryVTT · Occhiali G2                                           │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Giocatore   [ Luca ▾ ]    Personaggio  [ Thorin ▾ ]                   │
│                                                                        │
│  ┌──────────────────────────┐   1. Apri la Even Realities App          │
│  │   ▄▄▄▄▄▄▄ ▄ ▄▄ ▄▄▄▄▄▄▄   │   2. Inquadra il QR                      │
│  │   █ ▄▄▄ █ ▀█▄▀ █ ▄▄▄ █   │   3. Indossa gli occhiali: fatto!        │
│  │   █ ███ █ ▄▀▀█ █ ███ █   │                                          │
│  │   █▄▄▄▄▄█ █▀▄▀ █▄▄▄▄▄█   │   Utente creato: «Luca (G2)»             │
│  │   ▄▄ ▄  ▄▄▀█▄▀▄ ▄▄▄ ▄    │   ruolo Giocatore · proprietario         │
│  │   █▄▀██▄▄▀▄ ▀▄██▀▄▀▄█▀   │   solo di Thorin                         │
│  │   ▄▄▄▄▄▄▄ ▀▄█▀ ▄ ▀█▄▀▄   │                                          │
│  │   █ ▄▄▄ █ █▀▄▄▀▀▄█▀▄▄█   │   Il QR scade tra  04:52                 │
│  │   █ ███ █ ▀▄▀██▄▀▄ ▀▀    │   e vale una sola associazione.          │
│  │   █▄▄▄▄▄█ █▄ ▀▄█▀▄█▄▄█   │                                          │
│  └──────────────────────────┘                                          │
│                                                                        │
│  URL:  https://foundry.casa-rossi.it/modules/evenfoundryvtt/g2/        │
│        ✓ HTTPS valido   ✓ modulo servito   ✓ socket attivo             │
│                                                                        │
│  Dispositivi associati                                                 │
│   ● Luca (G2) · Thorin · ultimo contatto 12 s fa   [ Revoca ]          │
│   ○ Anna (G2) · Mira   · mai connesso               [ Revoca ]         │
│                                                                        │
│  [ Genera nuovo QR ]            [ Copia codice manuale ]  [ Chiudi ]   │
╰────────────────────────────────────────────────────────────────────────╯
```

### P02 · Telefono · pagina Connessione (collegato)

```
╭────────────────────────────────────────╮
│ G2 HUD · Connessione                   │
├────────────────────────────────────────┤
│                                        │
│  Stato      ● Collegato                │
│  Server     foundry.casa-rossi.it      │
│  Utente     Luca (G2)                  │
│  PG         Thorin · Guerriero 5       │
│  GM         Anna (online)              │
│  Latenza    84 ms · mappa 1 fps        │
│                                        │
│  Lingua     [ Segui Foundry ▾ ]        │
│  Mappa      [ Pixel 12 px ▾ ]          │
│             [x] Segui il mio token     │
│  Scheda     [x] Auto pagina Combat     │
│                                        │
│  [ Riconnetti ]   [ Disconnetti ]      │
│                                        │
│  Diagnostica ▸                         │
╰────────────────────────────────────────╯
```

### P03 · Telefono · prima configurazione / codice manuale

```
╭────────────────────────────────────────╮
│ G2 HUD · Prima configurazione          │
├────────────────────────────────────────┤
│                                        │
│  Nessuna associazione trovata.         │
│                                        │
│  Il modo più semplice:                 │
│  su Foundry apri «Associa occhiali G2» │
│  e inquadra il QR con la Even App.     │
│                                        │
│  ── oppure inserisci il codice ──      │
│                                        │
│  Utente  [ Luca (G2)          ▾ ]      │
│  Codice  [ 7QK3-MX9P-2HRA-C4TE  ]      │
│                                        │
│  [ Collega ]                           │
│                                        │
│  Utenti «(G2)» letti da questo         │
│  server Foundry. Il codice è sotto     │
│  il QR su Foundry (monouso, 5 min).    │
╰────────────────────────────────────────╯
```

## ✅ Criteri di accettazione

- [ ] I confini di colonna 192/384 px sono identici in M01–M08 e M11 (snapshot INV-1).
- [ ] Ogni stringa della colonna A e C rientra nel budget pixel misurato (IT + EN, min/max).
- [ ] Doppio tap sulla radice chiama `shutDownPageContainer(1)`.
- [ ] La pressione lunga non è mai l'unico accesso a una funzione.
- [ ] La mappa non supera 1 frame/s né invia immagini a meno di 100 ms l'una dall'altra.
- [ ] Nessun payload in chiaro su `module.evenfoundryvtt` (solo envelope sigillati).
- [ ] Il QR contiene URL + frammento; il frammento viene rimosso dall'URL dopo la lettura.
- [ ] M09 viene mostrato al primo avvio senza credenziali (mai schermo vuoto).
