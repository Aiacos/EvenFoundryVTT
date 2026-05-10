# Phase 0: Validation Gates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 0-Validation Gates
**Areas discussed:** Hardware access & sequencing, Formato esecuzione test, Threshold Branch A/B/C, Output artifact organization

---

## Hardware access & sequencing

### Question 1.1: Strategia di accesso Even Hub developer (1-2 settimane attesa)

| Option | Description | Selected |
|--------|-------------|----------|
| Apply now + parallel scaffold | Sottometti richiesta Even Hub IMMEDIATAMENTE, in parallelo prepara test harnesses + ADR-0005 template + threshold draft + protocolli di misurazione. Quando l'accesso arriva sei pronto a eseguire i test in giorni, non settimane. | ✓ |
| Apply now, then wait passively | Sottometti richiesta, sospendi tutto il resto fino a grant. Riduce il rischio di rework se documenti la procedura sbagliata, ma sprechi 1-2 settimane. | |
| Community recon first | Prima di applicare, contatta comunità Even (Discord/Reddit) per capire cosa il dev access *realmente* sblocca vs il simulator pubblico, poi decide se serve davvero. | |

**User's choice:** Apply now + parallel scaffold (Recommended)
**Notes:** Parallelism aggressivo dove sicuro; massimizza throughput di calendar-time.

---

### Question 1.2: Phase 0 ↔ Phase 1 sequencing rigidity

| Option | Description | Selected |
|--------|-------------|----------|
| Partial parallel | Phase 1 monorepo skeleton + Biome + Vitest + ADR-0001/0002/0003/0004/0008 partono in parallelo a Phase 0 hardware tests. Solo ADR-0006 (raster) gated. | ✓ |
| Strict serial | Phase 1 ZERO partenza fino a Phase 0 complete. Più sicuro contro rework ma sequencing più lungo. | |
| Bootstrap-first hybrid | Mini-monorepo (workspace + tsconfig + Biome) JUST per ospitare Phase 0 test scripts. Poi quando ADR-0005 chiude, espandi a full Phase 1. | |

**User's choice:** Partial parallel (Recommended)
**Notes:** Riconosce che 80% di Phase 1 è ortogonale a Phase 0 outputs.

---

### Question 1.3: Fallback se accesso Even Hub ritardato oltre 2 settimane o negato

| Option | Description | Selected |
|--------|-------------|----------|
| Pivot to non-hardware work | Procedi con: MidiQOL probe (testabile su Foundry locale), Branch A/B/C threshold definition upfront, Phase 1 monorepo + 5 ADR. | ✓ |
| Even simulator with documented assumptions | Procedi su Even simulator pubblico per quello che simulator copre. Marca risultati come CONFIDENCE: SIMULATOR-ONLY. Re-validate su real hardware later. | |
| Hard block | Phase 0 è gating gate. Niente parte fino a hardware. | |

**User's choice:** Pivot to non-hardware work (Recommended)
**Notes:** Risk management: continuare a produrre valore anche sotto incertezza esterna.

---

### Question 1.4: Cosa significa "Phase 0 done" per unblock Phase 1+ downstream

| Option | Description | Selected |
|--------|-------------|----------|
| ADR-0005 deciso + 4 critical pass | ADR-0005 documenta Branch (anche se C "glyph-only") + 4 critical test pass binary: BLE multi-env, queue depth, format probe, R1 timing. P2 row §10.0.10 (MidiQOL) può slittare a Phase 7 entry. | ✓ |
| Tutti 7 test pass binary GO | Strict: tutti pass before Phase 1 unlock. Più sicuro ma rallenta. | |
| Branch decision only | Solo ADR-0005 blocca Phase 1+. Tutti gli altri "good to have" prima di Phase 4. | |

**User's choice:** ADR-0005 deciso + 4 critical pass (Recommended)
**Notes:** Pragmatic: blocca solo quello che strutturalmente cambia downstream design.

---

## Formato esecuzione test

### Question 2.1: Dove vivono i 7 test di Phase 0

| Option | Description | Selected |
|--------|-------------|----------|
| tests/phase-0/ standalone | Cartella tests/phase-0/ con script TS standalone (tsx). Outside monorepo packages/. Quando Phase 1 lands, opzionalmente fold-in come packages/validation-harness/. | ✓ |
| .planning/phases/00-validation-gates/scripts/ | Script vivono dentro phase directory GSD. Cohesion ma anomaly architettonica. | |
| Pure markdown procedure, zero codice | Solo doc step-by-step. Massima 'design-only' purity ma zero ripetibilità. | |
| Bootstrap minimal monorepo first | Sposta Phase 1 'monorepo skeleton' BEFORE Phase 0 tests. Più pulito ma contraddice 'partial parallel' Area 1. | |

**User's choice:** tests/phase-0/ standalone (Recommended)
**Notes:** Equilibrio tra ripetibilità e non-coupling con Phase 1 tooling.

---

### Question 2.2: Runtime/linguaggio per i test scripts

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript via tsx + zod | TS strict + tsx per esecuzione zero-build. Zod per schema validation degli output (auto-emit JSON). Match perfetto con stack futuro. | ✓ |
| Pure Node 24 ESM | JavaScript puro, zero TypeScript. Massima portabilità ma perde type safety. | |
| Shell + Node hybrid | Shell per system probes (BLE scan, iperf3) + Node per parsing. Più nativo ma duplica conoscenza. | |

**User's choice:** TypeScript via tsx + zod (Recommended)
**Notes:** Type safety su byte format / BLE event payload critica per evitare bug silenziosi.

---

### Question 2.3: Output dei test capture & tracciamento

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-emit JSON + CSV in docs/perf/phase-0/ | Script produce stdout human-readable + side effect: scrive docs/perf/phase-0/{test-id}-{timestamp}.json schema versionato. ADR-0005 cita evidence. | ✓ |
| Manual transcribe to ADR markdown | Script stampa numeri, dev manualmente copia in ADR. Lower setup ma alta probabilità typo. | |
| Both: emit JSON + auto-update ADR section | Script auto-aggiornano sezione ADR-0005. Più lavoro infra, ADR sempre sincronizzato ma complica review. | |

**User's choice:** Auto-emit JSON + CSV in docs/perf/phase-0/ (Recommended)
**Notes:** INV-2 traceability + future re-runs comparable diff.

---

### Question 2.4: Organizzazione file test scripts

| Option | Description | Selected |
|--------|-------------|----------|
| 1-file-per-Specs-section | 10-0-1-r1-timing.ts, 10-0-2-image-format.ts, 10-0-3-ble-multi-env.ts, etc. Direct mapping a Specs.md. | ✓ |
| Grouped by execution mode | hardware-bound/, simulator-runnable/, doc-only/. Facilita 'esegui solo per env disponibile' ma rompe linear reading. | |
| Capability-based | latency/, throughput/, format/, gesture/, integration/. Riusabile cross-progetto ma overkill MVP. | |

**User's choice:** 1-file-per-Specs-section (Recommended)
**Notes:** Navigability + traceability immediati con Specs.

---

## Threshold Branch A/B/C

### Question 3.1: BLE bandwidth thresholds — single-percentile o multi-dim?

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-percentile envelope | Branch A: p50≥200 AND p95≥150 AND p99≥100 sustained 30-min. Branch B: p99≥100 OR p50≥150. Branch C: p99<100 in qualsiasi dei 3 ambienti. Più rigoroso, gestisce real-world tail latency. | ✓ |
| Single p50 threshold | Stick literal a Specs: p50≥200=A, 100≤p50<200=B, p50<100=C. Più semplice ma ignora coda lunga. | |
| Average + worst-env | Decisione basata su WORST environment (microwave). Conservative ma forza Branch C anche quando 80% real-world sarebbe A. | |

**User's choice:** Multi-percentile envelope (Recommended)
**Notes:** Pitfall 2 (research) richiede esplicitamente cattura coda lunga.

---

### Question 3.2: Queue depth thresholds (Specs §10.0.8 table {1,2,3,≥4})

| Option | Description | Selected |
|--------|-------------|----------|
| Strict tier mapping | Queue ≤2 sustained = A. Queue 3 occasional = B (adaptive fps Layer 6 + warning chip). Queue ≥4 = C automatic degrade. | ✓ |
| Permissive cap | Queue ≤3 = A (con backpressure). Più throughput ma rischio firmware overflow visibile (frame drops, ghost tokens — pitfall 3). | |
| Adaptive measurement | Misura queue overflow rate. Più sensible ma richiede sustained 30-min measurement con scene complexity varia. | |

**User's choice:** Strict tier mapping (Recommended)
**Notes:** Direct mapping a adaptive fps stack della Specs.

---

### Question 3.3: fps thresholds — quali minimi per ogni Branch?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 fps Branch A floor | Branch A REQUIRES ≥5 fps sustained (Specs committed). Branch B accepts 3-5 fps con visible 'low-fps' chip. Branch C N/A. 15 fps stretch separato gate. | ✓ |
| Adaptive degrade always | Niente fps floor: Layer 6 adaptive fps degrades. Phase 0 misura solo achievable fps come dato. Rischio: decisione soggettiva. | |
| Flexible 4 fps Branch A | Lower bar: 4 fps = A, 2-4 = B, <2 = C. Più inclusivo ma viola 'Specs committed'. | |

**User's choice:** 5 fps Branch A floor (Recommended)
**Notes:** Mantiene fedeltà a Specs committed; 15 fps stretch correttamente isolato.

---

### Question 3.4: Borderline measurement decision authority

| Option | Description | Selected |
|--------|-------------|----------|
| Strict numeric | 98 < 100 = Branch B (deterministic). ADR documenta che borderline triggano automatic downgrade per safety. No discretion. INV-2 friendly. | ✓ |
| Re-test with tighter envelope | Borderline (±5%) triggera 2nd round con sustained 60-min e 3 different scenes. Più effort ma riduce false-degrade. | |
| Researcher discretion | Documentazione qualitativa in ADR. Più pragmatic ma viola INV-2. | |

**User's choice:** Strict numeric (Recommended)
**Notes:** Rigor scientifico > pragmatic appeal; favorisce safety over optimism.

---

## Output artifact organization

### Question 4.1: Struttura ADR-0005 — monolitico o composito?

| Option | Description | Selected |
|--------|-------------|----------|
| Composite: ADR + companion files | ADR-0005.md (~150-300 righe: decision rationale + Branch + threshold table + verdict) + docs/perf/phase-0/*.json (raw measurements) + docs/perf/phase-0/calibration/*.png (palette photos). ADR cita companion files. | ✓ |
| Monolithic ADR (everything inline) | ADR-0005.md unico (~800-1500 righe) con raw measurements inline. Self-contained ma pesante; impossibile diff su raw numbers. | |
| Minimal ADR + external evidence registry | ADR-0005 ultra-corto; docs/perf/phase-0/EVIDENCE.md indice strutturato. Più navigabile ma rischia ADR non racconti il 'perché'. | |

**User's choice:** Composite: ADR + companion files (Recommended)
**Notes:** Bilancia readability + machine-readable evidence + diff-ability.

---

### Question 4.2: ADR-0006 (raster lib stack) timing

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 0 if Branch A or B | Branch A/B → ADR-0006 scritto subito (image-q + upng-js + xxhash-wasm confermato + drift signals notati). Branch C → ADR-0006 dichiara 'raster deferred Phase 13' + library decision moot. | ✓ |
| Phase 1 always | ADR-0006 vive sempre in Phase 1 first commit, anche se Branch C. Più simmetrico ma rallenta signal di committment. | |
| Conditional defer to Phase 4 entry | ADR-0006 deferred a Phase 4a entry se Branch A/B. Più 'just in time' ma viola CLAUDE.md. | |

**User's choice:** Phase 0 if Branch A or B (Recommended)
**Notes:** Conditional content per branch outcome; ADR sempre esiste, contenuto adattivo.

---

### Question 4.3: tests/phase-0/ futuro

| Option | Description | Selected |
|--------|-------------|----------|
| Promote to packages/validation-harness/ in Phase 1 | Phase 1 fold-in: tests/phase-0/*.ts → packages/validation-harness/{src,tests}/. Convertibile a Vitest. Future re-validation re-run con un comando. Pattern Doom-on-exotic-device. | ✓ |
| Stay in tests/phase-0/ forever | Throwaway scripts, niente promozione. Più leggero ma future re-runs richiedono rebuild. | |
| Archive to .planning/phases/00.../scripts/ post-Phase-0 | Spostati in archive. Niente re-run path. Massima cohesion ma zero ROI futuro. | |

**User's choice:** Promote to packages/validation-harness/ in Phase 1 (Recommended)
**Notes:** Compound interest investment per future hardware revisions.

---

### Question 4.4: Documentazione operativa learnings capitalization

| Option | Description | Selected |
|--------|-------------|----------|
| ADR cross-refs + Phase entry gate docs | Ogni Phase downstream ha 'entry gate' in ROADMAP che cita ADR-0005 measurements come precondition. Decisioni Phase 0 informano automaticamente downstream design. | ✓ |
| PHASE-0-LEARNINGS.md narrative | Doc separato narrative. Più onboarding-friendly ma non cita-able machine-readable. | |
| Inline in each downstream PLAN.md | Phase 4a/6/7 plans copiano relevant Phase 0 numbers. Più self-contained ma duplica info — drift hazard. | |

**User's choice:** ADR cross-refs + Phase entry gate docs (Recommended)
**Notes:** Single source of truth + automatic propagation + drift prevention.

---

## Claude's Discretion

Nessuna area marcata "you decide" durante la discussione. Tutte le 16 decisioni esplicite (D-01 → D-16). Aree di flessibilità implementativa per il planner GSD documentate in CONTEXT.md `<decisions>` "Claude's Discretion" subsection.

## Deferred Ideas

Nessuna scope creep durante discussione — tutte le 4 aree erano implementation details di Phase 0. Aree non-discusse esplicitamente ma menzionate per future iteration (vedi CONTEXT.md `<deferred>`):
- Palette calibration methodology dettagliata (camera vs photometer, ΔE metric, iteration limit)
- R1 timing measurement protocol esatto (n samples, percentile target, distinguibility statistic)
- MidiQOL probe surface (UI toast vs log entry vs hard error)
- Even Hub access escalation path se silenzio oltre 2 settimane (community Discord, vendor outreach formale)
