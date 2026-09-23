# Leggere la HUD — «Scheda da tavolo G2»

La HUD si legge come la **scheda cartacea di D&D 5e** e come **D&D Beyond**: stessi simboli, stessa posizione. Il display della G2 è 576 × 288 px, verde a 16 livelli di luminosità ([display](https://hub.evenrealities.com/docs/build/display)). La luminosità fa la gerarchia: **PF, CA e turno** sono i segni più grandi e brillanti (livello 15), il testo è a 11, le etichette a 7–9, le cornici a 3–5; il ritratto non supera mai il mezzo tono.

## 👓 Le cinque zone

![Combattimento, il tuo turno](images/sheet-combat-my-turn.png)

| Zona | Posizione | Cosa mostra | Si aggiorna |
|---|---|---|---|
| **A · Ritratto** | in alto a sinistra, 144 × 144 | immagine dell'attore → token → stemma di classe; livello nel cerchio | al cambio di scena o condizione |
| **B · Intestazione** | in alto al centro, 288 × 144 | nome, ispirazione, razza · classe, CA, PF, INIZ · VEL · COMP, economia d'azione, condizioni, turno | su PF, CA, turno, condizioni |
| **C · Mappa** | in alto a destra, 144 × 144 | arte originale della scena pixelata, centrata sul tuo token ([Mappa](Mappa)) | ≤ 1 fps, solo se cambia |
| **D · Scheda** | in basso a sinistra, 288 × 144 | *Caratteristiche* oppure *Tiri salvezza · Abilità*; a 0 PF *Tiri contro la morte* | al cambio di pagina o di dati |
| **E · Contesto** | in basso a destra, 288 × 144 | registro, iniziativa, azioni, bersagli, incantesimi, esiti, reazioni, prove richieste | subito |

Solo la zona **E** risponde ai gesti ([Gesti e comandi](Gesti-e-Comandi)).

Sotto il cofano le zone A–C formano una sola **fascia alta** 576 × 144, divisa in due tile immagine 288 × 144; con la tile della scheda (D) fanno la griglia 2 × 2 di tile 288 × 144, l'unica che l'hardware reale accetta. La zona E è testo firmware nella quarta cella ([Renderer a pixel](Renderer-Pixel)).

## 👓 Zona A — Ritratto

- Immagine dell'attore Foundry; se manca, il token; se mancano entrambi, lo **stemma della classe** (per esempio il martello del chierico), mai un riquadro vuoto.
- Il **cerchio LIV** in basso a destra è il livello del personaggio.
- **A 0 PF** il ritratto si attenua. **Nel tuo turno** il bordo passa alla luminosità massima.

## 👓 Zona B — Intestazione

| Segno | Significato |
|---|---|
| **THORIN ★** | nome del personaggio; la stella piena è l'**ispirazione** («Ispirazione eroica» con le regole 2024) |
| NANO DELLE COLLINE · CHIERICO 5 | razza · classe e livello |
| **Scudo CA 18** | classe armatura, cifra grande |
| **Box ♥ PUNTI FERITA 27/38** | PF attuali / massimi, con la **barra** sotto; il badge **+5 TEMP** sono i PF temporanei. Da 4 cifre in su le cifre si stringono, il box non cambia mai dimensione |
| **INIZ +0 · VEL 25 · COMP +3** | iniziativa, velocità in piedi, bonus di competenza |
| **● AZ ▲ BON ◆ REA** | economia d'azione (solo in combattimento): **●** azione, **▲** azione bonus, **◆** reazione. Pieno = disponibile, vuoto = usata |
| **Stivale 25 FT** | movimento rimasto nel turno |
| **Chip** (clessidra CONC, BENEDETTO, …) | concentrazione e condizioni attive; senza condizioni: *NESSUNA CONDIZIONE* |
| **▲ TUO TURNO · R3** | è il tuo turno, round 3. Nel turno altrui: *TURNO: GOBLIN B* |

## 👓 Zona D — Scheda

**Pagina «Caratteristiche»** (predefinita): sei box **FOR · DES · COS · INT · SAG · CAR** come sulla scheda cartacea — **modificatore grande** in alto, **punteggio nell'ovale** in basso. Sotto: *PERCEZIONE PASSIVA* e *SCUROVISIONE*.

**Pagina «Tiri salvezza · Abilità»**: a sinistra i sei tiri salvezza, a destra le abilità, ognuna con il bonus. I cerchi dicono la competenza **per forma**, non solo per luminosità:

| Cerchio | Significato |
|---|---|
| **●** | competente |
| **◉** | maestria (doppia competenza) |
| **○** | nessuna competenza |

In fondo: *INTUIZIONE PASSIVA · INDAGARE PASSIVO*.

![Prova richiesta dal GM: pagina Tiri salvezza · Abilità](images/sheet-saves.png)

**Tiri contro la morte** (a 0 PF, prevale su tutto): tre cerchi *SUCCESSI* e tre *FALLIMENTI*, con il promemoria *TIRA IL D20 SUL TAVOLO · GUARIRE AZZERA* ([S9](Schermate)).

**Pagina automatica** (disattivabile dal telefono, *Pagina scheda automatica*): *Caratteristiche* di default · prova o tiro salvezza richiesto dal GM → *Tiri salvezza · Abilità* · 0 PF → *Tiri contro la morte*. Se cambi pagina a mano (pressione lunga → *Scheda*), la scelta resta fino al prossimo evento.

## 👓 Zona E — Contesto

Tre righe di testo: **titolo** (a destra un dettaglio, per esempio *round 3* o *scade 9 s*), **corpo** incorniciato di tre righe con il cursore **▶**, e il **suggerimento dei gesti** in fondo:

| Suggerimento | Leggi |
|---|---|
| `●  azioni     ●●  esci` | tap = azioni · doppio tap = esci |
| `↕ scegli   ● ok   ●● indietro` | swipe = scegli · tap = conferma · doppio tap = indietro |
| `↕ bersaglio  ● tira  ●● indietro` | scelta del bersaglio |
| `●  fatto     ●●  chiudi` | prova richiesta dal GM |
| `●  riprova ora     ●●  esci` | offline |

Nelle liste, i PF delle creature di cui non puoi vedere il numero appaiono come quadretti **■■□□** (frazione approssimata). Nel titolo della lista incantesimi gli slot rimasti per livello sono **■■■□ ■■□ ■□** (oppure `3/4 2/3 1/2` se non c'è spazio).

## 📚 Vedi anche

- [Schermate](Schermate) — le 12 schermate S1–S12.
- Design completo: [`docs/design/g2-sheet-ux.html`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/design/g2-sheet-ux.html) · indice del design: [`docs/design/README.md`](https://github.com/Aiacos/EvenFoundryVTT/blob/develop/docs/design/README.md).
