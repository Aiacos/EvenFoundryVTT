# Voice Intent Recognition — Research

**Ricercato:** 2026-05-17
**Dominio:** Speech-to-intent, Even Realities G2 audio API, architettura voice pipeline
**Confidenza globale:** HIGH (sezione INV-2 EvenAI), MEDIUM (landscape intent recognition)
**Trigger:** Riapertura architetturale da utente su Phase 12 — "come fare bene il riconoscimento dei comandi vocali, magari con l'AI degli occhiali"

---

## Riepilogo

Phase 12 ha consegnato un pipeline software-completo: G2 mic → PCM 16kHz → Deepgram Nova-3 Multilingual → trascrizione → Claude Desktop MCP tool dispatch. L'utente chiede se (a) EvenAI nativa ha aperto un'API utilizzabile dai dev, (b) esistono approcci migliori per l'intent recognition rispetto a LLM general-purpose, (c) il G2 espone capability audio non ancora sfruttate.

**Verdetto primario:** EvenAI nativa resta opaca ai dev, status quo Specs.md §3.6 confermato al 2026-05-17. L'architettura Phase 12 rimane valida. L'area di miglioramento concreto riguarda la sostituzione del LLM general-purpose per l'intent step con un classificatore edge come Picovoice Rhino, che ridurrebbe latenza da ~800ms a ~200-300ms e azzererebbe i costi cloud per l'inferenza intent.

---

## 1. INV-2 Re-check — Stato EvenAI Developer API

### Metodo (INV-2: ≥4 WebFetch paralleli su domini canonici indipendenti)

| Domain verificato | URL | Data fetch | Risultato |
|-------------------|-----|------------|-----------|
| Even Hub overview | `hub.evenrealities.com/docs/getting-started/overview` | 2026-05-17 | No AI/voice/transcript API per dev |
| Even Hub device-apis | `hub.evenrealities.com/docs/guides/device-apis` | 2026-05-17 | Solo `audioControl()` → PCM raw. Verbatim: "no audio output, no arbitrary pixel drawing, no camera" |
| Even Hub input-events | `hub.evenrealities.com/docs/guides/input-events` | 2026-05-17 | 7 event types totali: CLICK, SCROLL_TOP, SCROLL_BOTTOM, DOUBLE_CLICK, FOREGROUND_ENTER, FOREGROUND_EXIT, ABNORMAL_EXIT. **Nessun event voice/transcript/aiResponse** |
| EvenDemoApp GitHub | `github.com/even-realities/EvenDemoApp` | 2026-05-17 | Nessuna API pubblica per EvenAI. Sistema chiuso, protocollo BLE proprietario (0x0E mic control, 0xF1 audio data) |
| evenrealities.com/ai-glasses | marketing | 2026-05-17 | Nessun annuncio API developer per EvenAI. Solo link a Even Hub |
| Zenn.dev article (even-g2-sdk-features) | dev community | 2026-05-17 | Feature verificate: PCM raw, display, storage. Beamforming, wake word, AI transcript: **non testati, non documentati** |

### Verdetto: STATUS QUO CONFERMATO [VERIFIED: hub.evenrealities.com/docs]

EvenAI ("Hey Even") rimane **opaca ai dev app** al 2026-05-17:

- **No transcript subscription** — non esiste API per ricevere l'output testuale di EvenAI
- **No intent hook** — non esiste callback per catturare le intenzioni riconosciute da EvenAI
- **No wake-word API** — "Hey Even" è firmware-level, invisibile ai plugin
- **No audio enhancement API** — il PCM esposto agli dev è `audioEvent.audioPcm` raw, senza beamforming applicato lato SDK (beamforming hardware fisico può esistere nel firmware, ma l'API espone il segnale grezzo a 16kHz mono)

**Implicazione:** La scelta architetturale di Phase 12 (STT esterno via Deepgram + LLM esterno via Claude Desktop) è l'unica opzione praticabile con l'SDK pubblico. Non esistono shortcut on-glass.

**Segnale positivo osservato:** Even Hub ha un SDK in sviluppo attivo (>2000 dev, Even Hub lanciato aprile 2026). La sezione `AI-tooling` nei docs contiene un'integrazione Claude Code, ma è uno strumento di sviluppo (IDE helper), non un'API EvenAI. **Non è una apertura dell'API EvenAI.** Monitorare: evenrealities.com changelog e hub.evenrealities.com/changelog per future aperture.

---

## 2. Intent Recognition Landscape — Matrice Comparativa

### Contesto problema

Il vocabolario D&D 5e è **ristretto e prevedibile**:
- ~70 incantesimi SRD (già implementati in Phase 12 spell-lookup)
- ~10 azioni base (weapon-attack, use-item, dodge, dash, help, hide, ready, search, cast-spell, disengage)
- Pattern utterance: "[azione] [bersaglio]" o "[nome incantesimo] [bersaglio]" — poca variabilità strutturale

Questo rende il problema **significativamente più semplice di un assistant general-purpose**, aprendo la porta a classificatori specializzati.

### Architettura corrente (Phase 12)

```
PCM → Deepgram Nova-3 (~300ms) → testo → Claude Desktop MCP (~400-600ms) → tool call
Latenza totale p50: ~700-900ms (target SC-12-01: 800ms)
```

### Approcci alternativi

| Approccio | Latency p50 | Costo per 1k utterance | On-device/cloud | IT+EN code-switch | Vocab fisso/aperto | Complessità integrazione | Note |
|-----------|------------|----------------------|-----------------|-------------------|-------------------|--------------------------|------|
| **[A] Corrente: Deepgram Nova-3 + Claude Desktop MCP** | ~700-900ms | STT: ~$0.005 + LLM: ~$0.01-0.05 | Cloud | Native Nova-3 (10 lingue) | Aperto | Implementato (Phase 12) | SC-12-01 target 800ms. Claude generalista ma slow per intent narrow |
| **[B] Deepgram Nova-3 + Rhino Speech-to-Intent (edge)** | ~400-500ms | STT: ~$0.005 + Rhino: gratuito/tier | STT cloud + intent edge (browser WebView) | STT native; Rhino **supporta IT** | Fisso (custom context) | Media (context JSON build + integration) | Elimina LLM cloud per intent. Rhino supporta Chrome/Safari/Firefox WebView iOS. Accuracy 97%+ in 9dB SNR |
| **[C] Deepgram Keyterm Prompting + regola heuristica** | ~300-400ms | STT: ~$0.006 (Nova-3 keyterm) | Cloud | Native Nova-3 | Semi-fisso (keyterm list) | Bassa (extend deepgram-stt.ts) | Nova-3 supporta "keyterm prompting" (fino a 100 termini domain-specific, 625% entity-recall lift per Deepgram docs). Transcript più pulita per nomi incantesimi. Intent parsing con regex semplice post-transcript |
| **[D] Whisper.cpp WASM + classificatore locale** | ~2-8s (WASM su CPU mobile) | ~$0 (fully local) | Fully on-device (browser WASM) | Whisper supporta 99 lingue incl. IT | Fisso post-training | Alta (WASM bundle 75-142MB, latenza inaccettabile su mobile) | Latenza 2-8s su CPU mobile = non fattibile per real-time. Utile solo per privacy-first batch mode. **Scartare per real-time MVP** |
| **[E] OpenAI Realtime API / GPT-4o function calling** | ~800-1200ms | LLM: $5-15/1M token (molto > Claude Haiku) | Cloud | Sì | Aperto | Media (diverso provider MCP) | Latenza analoga all'approccio corrente. Costo maggiore. Aggiunge dipendenza OpenAI senza vantaggi strutturali. Non raccomandato |

### Analisi dettagliata opzioni più promettenti

#### Opzione B — Picovoice Rhino (raccomandazione per latency optimization)

[VERIFIED: picovoice.ai/docs/rhino/ + picovoice.ai/platform/rhino/]

- **Platform:** Supporta browser Web SDK (Chrome, Safari, Firefox, Edge) — quindi compatibile con Even Realities App WebView iOS [VERIFIED]
- **Lingue supportate:** English, French, German, **Italian**, Japanese, Korean, Chinese, Portuguese, Spanish [VERIFIED]
- **Accuracy:** >99% clean, 97.3% a 9dB SNR [VERIFIED: picovoice.ai speech-to-intent-benchmark]
- **Architettura:** Speech-to-Intent end-to-end (non STT → NLU separati) — elimina errore accumulato tra i due step
- **Latency:** sub-200ms inferenza on-device (nessuna round-trip cloud per il passo intent) [ASSUMED — non verificato con benchmark pubblico specifico per WebView iOS]
- **Context definition:** JSON "context" custom definisce intent + slot. Esempio per D&D:

```json
{
  "expressions": {
    "castSpell": ["cast [spellName] at [target]", "usa [spellName] su [target]", "lancia [spellName]"],
    "weaponAttack": ["attack [target] with [weapon]", "attacca [target]"],
    "dodge": ["dodge", "schivata"],
    "disengage": ["disengage", "disimpegno"]
  }
}
```

- **Pricing:** Free tier per sviluppo; commerciale non disponibile via WebFetch (pagina pricing inaccessibile). [LOW confidence su pricing commerciale — verificare prima di adottare]
- **Trade-off:** Vocabolario chiuso. Utterance fuori contesto → fallback necessario (ad es. clarify prompt, o passthrough a Claude Desktop per utterance complesse)
- **Integration point:** Sostituisce la parte "Claude Desktop intent" del pipeline, mantenendo Deepgram per STT. Rhino non fa STT — elabora PCM direttamente. In pratica: `PCM → Rhino (edge, WebView)` bypassa anche Deepgram per le utterance standard.

Pipeline ibrida B ottimale:
```
PCM → Rhino (WebView, edge, ~150-200ms) → intent + slot → MCP tool call
    ↘ (fallback su intent unknown) → Deepgram Nova-3 + Claude Desktop (~700ms)
```

#### Opzione C — Deepgram Keyterm Prompting (quick win, senza nuovo sistema)

[VERIFIED: deepgram.com/learn/model-comparison-when-to-use-nova-2-vs-nova-3-for-devs]

- Nova-3 supporta "keyterm prompting" — fino a 100 termini iniettabili nella request per migliorare recall su domain-specific vocabulary
- **625% entity-recall lift** su vocabolario specializzato (citato Deepgram docs)
- La URL corrente in `deepgram-stt.ts` non usa keyterms — estendibile con parametro `&keywords=fireball:5&keywords=palla+di+fuoco:5`
- **Latency:** Non aggiunge latency (processing server-side durante STT, non step separato)
- **Costo:** marginalissimo aumento (~$0.0010/min in più vs standard Nova-3 multi)
- **Complessità:** Bassa — modifica a `DEEPGRAM_URL` in `deepgram-stt.ts` + aggiunta lista keyterms da `spell-lookup.ts`
- **Limite:** Non è intent recognition — migliora solo la qualità della trascrizione (nome incantesimo) ma l'intent parsing resta a Claude Desktop. Riduce errori su nomi esotici (Bigby's Hand, Vrock, ecc.)

**Raccomandazione per quick win (no architettura change):** Implementare Option C come micro-ottimizzazione prima di valutare Option B. Costo/beneficio altissimo.

---

## 3. G2 Firmware Voice Capabilities — Revisione

### Beamforming nativo

[VERIFIED: hub.evenrealities.com/docs/guides/device-apis]

L'API pubblica espone `audioEvent.audioPcm` come **stream raw PCM 16kHz s16le mono**. La documentazione ufficiale non menziona beamforming nativo esplicito lato SDK. Il G2 ha hardware 4-mic con capacità direzionale (confermate dalla build engineering blog Even Realities su design G2), ma:

- **Non esiste API per selezionare beamforming mode** (nessun parametro in `audioControl()`)
- **Non esiste API per ricevere segnale post-beamforming esplicito vs raw**
- **Non esiste documentazione su quale pre-processing HW/firmware applica prima di esporre il PCM**

La community (zenn.dev, fabioglimb/even-toolkit) ha verificato solo il PCM base — nessuno ha documentato beamforming differenziato. [ASSUMED: il firmware applica almeno una forma di beamforming prima di esporre il PCM, data la configurazione hardware, ma non è verificabile né configurabile via SDK]

### Wake word API separata da EvenAI

[VERIFIED: hub.evenrealities.com/docs/guides/input-events]

**Non esiste wake word API per dev.** Il wake word "Hey Even" è gestito a livello firmware/OS ed è invisibile ai plugin. Non è intercettabile né sostituibile. Non esiste alternativa documentata.

Possibilità teorica: usare Picovoice Porcupine (wake word detection) in WebView per un wake word custom del nostro plugin (es. "Hey Foundry"). Questo richiederebbe accesso continuo al PCM stream (costo audio costante) e potrebbe collidere con "Hey Even". [LOW confidence — non testato, ipotetico]

### Latenza BLE per audio PCM

[ASSUMED basato su Specs.md §3.5 + architettura hardware]

Non esiste documentazione ufficiale Even Realities sulla latenza BLE per l'audio stream. Specs.md §3.5 riporta: "Audio capture non gira sul G2 firmware ma sul WebView dell'Even Realities App sul telefono. Latenza BLE già contabilizzata." Il target SC-12-01 (800ms speech-end → toast) include già questa latenza nella stima complessiva.

Stima accettata (non verificabile senza hardware): **BLE LC3 decode latency ~20-40ms** (codec latency noto per LC3 in applicazioni audio). [LOW confidence — nessuna fonte canonica Even Realities]

### Concorrenza audioControl(true) + "Hey Even"

[CITED: Specs.md §3.5 §10.0.4 + hub.evenrealities.com/docs/guides/device-apis]

Comportamento non documentato quando `bridge.audioControl(true)` è attivo e l'utente pronuncia "Hey Even". Phase 0 §10.0.4 identifica questo come test hardware pending. Non risolto.

---

## 4. Proposta di Refinement

### Scenario A — Status quo EvenAI confermato (QUESTO scenario, verificato)

L'architettura Phase 12 rimane valida. Due ottimizzazioni concrete proposte:

#### Quick Win: Keyterm Prompting Deepgram (Option C)

**Effort:** 1-2 ore. **Impatto:** riduzione errori STT su nomi incantesimi esotici.

Modifica da applicare in `packages/bridge/src/voice/deepgram-stt.ts`:

```typescript
// Aggiungere keyterms derivati da SPELL_LOOKUP in shared-protocol
// Formato Deepgram: &keywords=fireball:5&keywords=palla+di+fuoco:5
// Boost factor 1-10 (5 = boost moderato per nomi propri)
const keyterms = spellLookupKeys.map(k => `keywords=${encodeURIComponent(k)}:5`).join('&');
const DEEPGRAM_URL = `wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&...&${keyterms}`;
```

Questa modifica riduce lo scenario in cui il clarify-detector si attiva per errori di trascrizione (es. "fireball" trascritto "fire ball" o "firebawl") piuttosto che per vera ambiguità. Nessuna modifica architetturale.

#### Refinement Futuro: Picovoice Rhino (Option B) — se latenza è problema dopo SC-12-01

**Condizione trigger:** SC-12-01 hardware test misura p50 > 800ms speech-end → toast.

**Effort:** 1-2 giorni. **Impatto:** potenziale riduzione latenza a ~300-400ms per utterance standard.

**Prerequisiti prima di adottare:**
1. Verificare pricing Picovoice commerciale (pagina non accessibile da WebFetch — contattare sales)
2. Verificare compatibilità WebView iOS WKWebView con Picovoice Web SDK (non confermato per WKWebView specificamente, solo per browser standard) [LOW confidence]
3. Definire fallback per utterance fuori-contesto (→ passthrough Claude Desktop)
4. Valutare se vocabolario chiuso di Rhino copre tutti i casi d'uso reali (multi-attack verbali, improvvised actions, healing word su nome NPC specifico)

**Se adottato:** nuovo ADR-0012 "Speech-to-Intent: Rhino edge + Deepgram fallback hybrid". Nessun cambio a Phase 12 deliverables esistenti.

### Scenario B — EvenAI apre API (ipotetico, non verificato al 2026-05-17)

Se in futuro `hub.evenrealities.com/changelog` annuncia apertura API EvenAI transcript:

1. Aprire nuovo task research (INV-2 re-check con WebFetch canonical)
2. Valutare se transcript EvenAI ha latenza < 300ms (threshold per essere competitive con Deepgram)
3. Valutare se supporta code-switching IT↔EN
4. Se sì → ADR-0012 "Voice via EvenAI native transcript" + Phase 14 migration task
5. Se no (latenza alta o IT non supportato) → status quo confermato

**Probabilità stimata apertura API EvenAI nei prossimi 6 mesi:** LOW [ASSUMED — nessun segnale nei developer docs o community]

---

## 5. Assumptions Log

| # | Claim | Sezione | Rischio se sbagliato |
|---|-------|---------|----------------------|
| A1 | Rhino WebView iOS WKWebView è compatibile con Picovoice Web SDK | §2 Opzione B | Se non compatibile, Rhino non è applicabile al nostro stack g2-app |
| A2 | BLE LC3 audio latency ~20-40ms | §3 Latenza BLE | Latenza reale potrebbe essere >100ms, spostando il budget di latenza end-to-end |
| A3 | Il firmware G2 applica qualche beamforming prima di esporre PCM | §3 Beamforming | Se PCM è davvero raw 4-channel mixed, qualità STT potrebbe degradare in ambienti rumorosi |
| A4 | Picovoice commerciale pricing è accessibile per un hobby project | §2 Opzione B | Se pricing è enterprise-only, Rhino non è praticabile |
| A5 | EvenAI non aprirà API nei prossimi 6 mesi | §1 + §4 | Se apre, Phase 12 architecture diventa deprecabile |

---

## 6. Open Questions

1. **Pricing Picovoice Rhino commerciale**
   - Cosa sappiamo: free tier esiste; IT supportato; WebView browser sì
   - Cosa manca: costo per commercial use, limit su "free" tier (numero richieste/mese?)
   - Raccomandazione: visitare `picovoice.ai/pricing` con browser reale o contattare sales prima di qualsiasi investimento

2. **Compatibilità Picovoice Web SDK con WKWebView iOS**
   - Cosa sappiamo: supporta Chrome/Safari/Firefox/Edge standard
   - Cosa manca: test su WKWebView (WebView embedded in iOS app — ambiente Even Realities App)
   - Raccomandazione: testare con Even Realities App dev mode prima di architettura commitment

3. **SC-12-01 latenza reale p50**
   - Cosa sappiamo: target 800ms, stima software ~700-900ms
   - Cosa manca: misurazione su hardware reale G2 + R1 + rete reale
   - Raccomandazione: eseguire SC-12-01 prima di qualsiasi ottimizzazione latenza (potrebbe non essere necessaria)

4. **Deepgram Keyterm Prompting — impatto reale su spell name WER**
   - Cosa sappiamo: 625% entity-recall lift citato da Deepgram docs (contesto generale)
   - Cosa manca: WER specifico per nomi italiani di incantesimi D&D 5e
   - Raccomandazione: implementare quick win + misurare durante SC-12-01

---

## Sources

### Primary (HIGH confidence — fonti canoniche verificate 2026-05-17)

| Fonte | URL | Claim verificato |
|-------|-----|-----------------|
| Even Hub device-apis | `hub.evenrealities.com/docs/guides/device-apis` | No AI/voice/transcript API. Solo PCM raw via audioControl(). Verbatim: "no audio output" |
| Even Hub input-events | `hub.evenrealities.com/docs/guides/input-events` | 7 event types totali. Nessun voice/transcript/aiResponse event |
| EvenDemoApp GitHub | `github.com/even-realities/EvenDemoApp` | EvenAI è sistema chiuso BLE proprietario. No STT API esposta |
| Deepgram pricing | `deepgram.com/pricing` | Nova-3 Multi streaming: $0.0058/min PAYG, $0.0050/min Growth |
| Deepgram Nova-3 vs Nova-2 | `deepgram.com/learn/model-comparison-when-to-use-nova-2-vs-nova-3-for-devs` | Nova-3 streaming <300ms latency; keyterm prompting 625% entity-recall lift; IT supportato |
| Picovoice Rhino docs | `picovoice.ai/docs/rhino/` | IT supportato; browser Web SDK (Chrome/Safari/Firefox/Edge); accuracy 97%+ a 9dB SNR |
| Picovoice benchmark | `github.com/Picovoice/speech-to-intent-benchmark` | Rhino supera Google Dialogflow e Amazon Lex per accuracy |

### Secondary (MEDIUM confidence — fonti community/search verificate parzialmente)

| Fonte | Claim | Nota |
|-------|-------|------|
| zenn.dev/bigdra/articles/eveng2-sdk-features | G2 SDK: PCM raw verificato; beamforming non testato | Community, non ufficiale Even Realities |
| deepgram.com/learn/voice-intent-detection-guide | STT+LLM pipeline: 1000-1200ms; end-to-end: 200-540ms; task-specific model 85-98% cost saving | Fonte Deepgram (interessata) — dati plausibili ma da incrociare |
| Deepgram pricing aggregator | Nova-3 ~$0.46/hr streaming | Secondario, confermato da pricing ufficiale |

### Tertiary (LOW confidence — non verificati da fonte canonica)

| Fonte | Claim | Rischio |
|-------|-------|---------|
| WebSearch aggregated | OpenAI function calling p50 latency 400-800ms | Non verificato da platform.openai.com direttamente |
| WebSearch aggregated | Claude Haiku 3.5: $0.80/$4.00 per 1M token | Non verificato da docs.anthropic.com direttamente |
| ASSUMED | BLE LC3 latency ~20-40ms | Nessuna fonte canonica Even Realities |

---

## Metadata

**Data ricerca:** 2026-05-17
**Valid until:** 2026-08-17 (90 giorni — EvenAI API status + Picovoice pricing possono cambiare)
**Fonti INV-2 verificate:** 6 WebFetch su domini canonici Even Realities + 2 su Deepgram + 1 su Picovoice
**Prossimo re-check raccomandato:** Dopo SC-12-01 hardware test (trigger: p50 > 800ms)

---

## RESEARCH COMPLETE

**Verdetto INV-2 (EvenAI):** Status quo confermato — EvenAI nativa opaca ai dev al 2026-05-17. L'architettura Phase 12 (Deepgram Nova-3 + Claude Desktop MCP) è l'unica opzione praticabile con l'SDK pubblico attuale.

**Quick win immediato:** Aggiungere Deepgram keyterm prompting a `deepgram-stt.ts` (1-2 ore, zero architettura change) per ridurre errori di trascrizione su nomi incantesimi — la causa più probabile di false clarify prompt.

**Ottimizzazione futura (condizionale):** Se SC-12-01 misura p50 > 800ms, valutare Picovoice Rhino Speech-to-Intent in WebView per abbassare latenza a ~300-400ms, ma prima verificare pricing commerciale e compatibilità WKWebView iOS.
