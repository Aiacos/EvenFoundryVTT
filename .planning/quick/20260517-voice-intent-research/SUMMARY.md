---
status: complete
quick_id: 260517-fm3
slug: voice-intent-research
completed: 2026-05-17
type: research-only
---

# Quick Task: Voice Intent Recognition — Verifica architettura Phase 12

## Domanda dell'utente

> Per quanto riguarda l'utilizzo della voce per riconoscere i comandi automaticamente bisogna ricercare bene come farlo. Forse serve usare una AI per identificare le azioni oltre ad un STT; l'ideale sarebbe usare l'AI inclusa negli occhiali e le loro API.

## Verdetto in 3 righe

1. **EvenAI native NON è apribile ai dev** — confermato INV-2 fresh su 6 fonti canoniche Even Realities (hub.evenrealities.com/docs/* + GitHub even-realities/* + support.evenrealities.com). Specs.md §3.6 regge al 2026-05-17. Re-verified ✓.
2. **Phase 12 (Deepgram + Claude Desktop MCP) è l'unica architettura praticabile** con SDK pubblico. La pipeline GIÀ usa un'AI per identificare le azioni — è semplicemente esterna (cloud LLM via MCP), non on-glass.
3. **Esiste un quick win senza cambi architetturali**: Deepgram **Keyterm Prompting** con la lista 70 incantesimi del `spell-lookup` (+625% entity-recall lift sui nomi esotici come Bigby's Hand). Ottimizzazione condizionale a Picovoice Rhino edge solo se SC-12-01 hardware test misura p50 > 800ms.

## Raccomandazioni

| Priorità | Azione | Effort | Quando |
|----------|--------|--------|--------|
| **Bassa** | Aggiungere `Deepgram Keyterm Prompting` a `deepgram-stt.ts` con i 70 incantesimi di `spell-lookup.ts` | 1-2h | Ora se vuoi un boost gratuito; altrimenti dopo SC-12-01 |
| **Condizionale** | Migrazione a **Picovoice Rhino** edge-classifier in WebView iOS (sostituisce Claude Desktop come "intent identifier") | 1-2gg | Solo se SC-12-01 hardware test misura p50 > 800ms |
| **Monitoraggio** | Aggiungere `hub.evenrealities.com/changelog` alla prossima sessione INV-2 quarterly | 5min | Prossima cross-validazione (auto: ad ogni bump Specs.md) |

## Nessuna migrazione architetturale necessaria

Phase 12 stays valid. La proposta "usare l'AI degli occhiali" è bloccata da vincolo upstream (Even Realities non espone EvenAI come API per dev). La pipeline corrente:

```
G2 mic 4× → bridge.audioControl → PCM s16le 16kHz → Deepgram Nova-3 → trascrizione
   → Claude Desktop (MCP client) → tool selection + invocation
   → foundry-mcp (Phase 11) → bridge → foundry-module write path (Phase 7)
   → audit log + chat card → toast G2
```

…è esattamente "STT + AI per identificare le azioni" come l'utente ipotizzava, ma con AI esterna invece che on-glass. **Non c'è alternativa "on-glass AI" disponibile.**

## Artefatti

- `RESEARCH.md` — verdetto INV-2 fresh + matrice 5 approcci + analisi G2 firmware capabilities + 6 fonti canoniche citate.

## Prossimi passi suggeriti

1. **Nessun codice da scrivere ora** — la chiusura V2 di v0.9.11 (Phase 12) è valida.
2. Dopo hardware grant + SC-12-01 verifica, **misurare latenza p50 reale**; decidere se applicare il quick win Keyterm Prompting o procedere a Rhino.
3. Documentare la re-verifica INV-2 nel prossimo bump Specs.md (v0.9.12+) come riga "Re-verified ✓ 2026-05-17 — EvenAI API status quo confermato su 6 fonti".
