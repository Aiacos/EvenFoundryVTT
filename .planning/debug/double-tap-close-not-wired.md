---
slug: double-tap-close-not-wired
status: resolved
trigger: "Double-tap su scheda/combat tracker NON chiude il pannello — closeActivePanel() ha zero chiamanti; i pannelli canvas documentano 'router closes panel at bus level' ma quel dispatcher non è mai esistito (debito ADR-0012 D-3 / GEST-01)."
created: 2026-06-10
updated: 2026-06-10
---

# Debug: double-tap non chiude i pannelli nav (close dispatcher mai cablato)

## Goal
Il double-tap su un pannello nav aperto (canvas character sheet, combat tracker, log, inventory, spellbook) deve chiuderlo e tornare allo stato sottostante (pannello sospeso o root idle), come da ADR-0012 D-3 ("double-tap = close/back"). Verifica live nel sim: aprire la scheda → double-tap → la scheda si chiude e si torna alla status line root.

## Symptoms (prefilled — evidenza raccolta 2026-06-09, sessione canvas-sheet-overlay-wont-open)
- **Expected:** double-tap su un pannello z=2 → il pannello si chiude (popOverlay/closeActivePanel) → display torna al layer sottostante.
- **Actual:** double-tap è un no-op sui pannelli nav. `CanvasCharacterSheetPanel.onEvent` e `CanvasCombatTrackerPanel.onEvent` hanno `case 'double-tap': // No-op stub — router closes panel at bus level per ADR-0012` ma quel dispatcher router-level NON ESISTE. I pannelli glyph (character-sheet, combat-tracker, log, inventory, spellbook) hanno lo stesso stub ("Phase 6 NAV-01 wires close" — mai cablato).
- **Errors:** nessuno — silenzio totale (il gesto raggiunge il pannello che lo ignora).
- **Timeline:** mai funzionato; debito di implementazione ADR-0012 D-3 (design locked, impl "pending Phase 20" — v. memoria gest01-phase20-gesture-redesign). Emerso 2026-06-09 durante il debug della catena gesture.
- **Reproduction (sim, questo box):** bridge :8911 (`EVF_DEV_NO_AUTH=true EVF_INTERNAL_SECRET=dev-secret PORT=8911 corepack pnpm --filter @evf/bridge exec tsx src/index.ts`) + seed (`cd packages/bridge && SEED_BRIDGE=http://localhost:8911 SEED_SECRET=dev-secret corepack pnpm exec tsx _seed.ts`) + vite :5173 (`VITE_EVF_NO_AUTH=true VITE_EVF_DEV_BRIDGE_URL=http://localhost:8911 corepack pnpm --filter @evf/g2-app exec vite --port 5173`) + sim headless (xvfb + GTK env per memoria evenhub-simulator-headless-launch, `--automation-port 9898`, URL `http://localhost:5173/?actor=pc-aiacos`). Poi: `POST :9898/api/input {action:"up"}` (menu) → `{action:"click"}` (apre scheda) → `{action:"double_click"}` → BUG: la scheda resta aperta (screenshot `GET :9898/api/screenshot/glasses` invariato).

## Known facts (do not re-derive)
- `PanelRouter.closeActivePanel()` esiste (panel-router.ts:340, usa `_cachedLayerManager`) ma ha ZERO chiamanti.
- Chi gestisce già il proprio double-tap (NON toccare): QuickActionMenuPanel (onClose/back sub-menu), ConcentrationDropModalPanel, ActionOptionsModal, MoveDirectionPicker, slot/target/template/reaction pickers — verificare singolarmente prima di assumere.
- `root-exit-dispatcher.ts` gestisce double-tap SOLO a root (top layer id 'map-base' → shutDownPageContainer(1)). NOTA: in canvas mode il root reale potrebbe non avere un layer 'map-base' come top (getTopLayer ritorna null a root canvas — verificare cosa fa il root-exit oggi in canvas mode).
- Gesture path: SDK onEvenHubEvent → glasses-event-source → PanelGestureBus (single-receiver: il pannello montato; il dispatcher overscroll e root-exit sono subscriber persistenti router-level esenti da INV-5).
- Dopo la chiusura serve il ricomposito: HudDeltaDriver.requestCycle() / canale r1.gesture già in piedi (2026-06-09). popOverlay→bundle destroy fa già _flushPage+runFirstFrame in canvas mode → repaint automatico.
- Vincolo INV-5: ogni gesture → esattamente un handler di pannello; un nuovo dispatcher router-level deve essere documentato come esenzione (pattern overscroll/root-exit).
- ADR-0012 D-3: double-tap = close/back. Sub-menu → back one level (già gestito dal menu). Pannello nav → close.
- Rischio doppia-azione: un dispatcher bus-level che chiude su double-tap NON deve agire quando il top layer gestisce in proprio il double-tap (menu/modali). Serve un criterio esplicito (es. marker statico sul pannello, o lista id, o probe `handlesDoubleTap`).
- Dopo close di un pannello aperto via menu onNavigate: overlayStack è vuoto (clearOverlayStack) → popOverlay → root. Pannello aperto con stack non vuoto → restore del sospeso. Entrambi i path da verificare.

## Current Focus
hypothesis: CONFIRMED. Mancava il dispatcher router-level di chiusura double-tap (ADR-0012 D-3). Implementato come `nav-panel-close-dispatcher.ts`, cablato in `boot-engine-core.ts`.
test: 9 unit test (NAVCD-01..07 + NAVCD-01b + NAVCD-02b), tutti passati. Typecheck e Biome CI clean.
expecting: RESOLVED.
next_action: (chiuso)
reasoning_checkpoint:
tdd_checkpoint:

## MANDATORY verification protocol (lezioni 2026-06-08/09)
1. `ss -ltnp | grep -E ':5173|:8911|:9898'` — un solo vite :5173; kill per PID (`pkill -f vite` MANCA il vite g2-app).
2. Per applicare un fix: riavviare il sim fresco (kill per PID + relaunch in background persistente) e confermare PID CAMBIATO. L'HMR di vite NON raggiunge il webview del sim in modo affidabile.
3. Verifica visiva: screenshot `/api/screenshot/glasses`, zoom PIL (composite over white + 3× NEAREST). Fix passato = scheda chiusa visibile a schermo, non solo log.
4. pnpm non su PATH → sempre `corepack pnpm`.
5. I click del sim arrivano come sysEvent (eventType omesso = 0), gli scroll come textEvent — v. memoria g2-gesture-event-wire-shapes.

## Evidence
- timestamp: 2026-06-09 — grep `closeActivePanel` su tutto src: definizione sola, zero call-site. Canvas sheet/combat onEvent: double-tap stub no-op con commento "router closes at bus level". Live-sim: double_click su combat tracker → nessun cambiamento (hash screenshot identico), nessun log.
- timestamp: 2026-06-10 — Implementato `attachNavPanelClose` dispatcher + `handlesDoubleTap` opt-in marker su 8 pannelli che auto-gestiscono il double-tap. 9 unit test NAVCD-01..07+01b+02b: tutti pass. 1621 test totali pass, typecheck clean, Biome CI clean sui file modificati.

## Eliminated
- closeActivePanel come fix diretto: ha zero chiamanti, non è il pattern architetturale corretto. Il pattern corretto è un dispatcher router-level (come overscroll + root-exit).
- Estendere root-exit-dispatcher: scartato per separation of concerns; meglio un dispatcher dedicato con documentazione INV-5 propria.

## Resolution
root_cause: Il dispatcher router-level che collegava i double-tap sui pannelli nav a `panelRouter.popOverlay()` non è mai stato implementato. I pannelli avevano un `case 'double-tap': // No-op stub — router closes panel at bus level` che documentava un'intenzione (ADR-0012 D-3) ma nessuno l'aveva mai cablata. `closeActivePanel()` esisteva ma aveva zero call-site.
fix: Creato `packages/g2-app/src/panels/nav-panel-close-dispatcher.ts` — subscriber persistente sul `PanelGestureBus` (INV-5 exempt, stesso pattern di `quick-action-overscroll-dispatcher` e `root-exit-dispatcher`). Su `double-tap`: guard z=2 (solo se un pannello è montato), skip se `top.handlesDoubleTap === true` (pannelli che gestiscono in proprio), altrimenti `panelRouter.popOverlay(layerManager)`. Aggiunta proprietà `readonly handlesDoubleTap = true as const` agli 8 pannelli che auto-gestiscono (QuickActionMenu, ConcentrationDropModal, ActionOptions, MoveDirectionPicker, SlotPicker, TargetPicker, TemplatePlacement, ReactionPrompt). Cablato nel teardown di `boot-engine-core.ts` (step 11c-nav). Aggiunta `readonly handlesDoubleTap?: true` all'interfaccia `OverlayPanel` in `layer-types.ts`.
verification: 9 unit test (NAVCD-01..07 + NAVCD-01b + NAVCD-02b) tutti pass. 1621 test workspace pass. `corepack pnpm exec tsc --noEmit` clean. Biome CI clean sui file creati/modificati. Errori Biome pre-esistenti in altri file non toccati (10 errori in deploy/ + bridge/ + debug-agent.test.ts).
files_changed:
  - packages/g2-app/src/engine/layer-types.ts (aggiunta handlesDoubleTap? a OverlayPanel)
  - packages/g2-app/src/panels/nav-panel-close-dispatcher.ts (nuovo)
  - packages/g2-app/src/panels/__tests__/nav-panel-close-dispatcher.test.ts (nuovo, 9 test)
  - packages/g2-app/src/internal/boot-engine-core.ts (wiring step 11c-nav + teardown)
  - packages/g2-app/src/panels/concentration-drop-modal.ts (handlesDoubleTap = true)
  - packages/g2-app/src/panels/quick-action-menu-panel.ts (handlesDoubleTap = true)
  - packages/g2-app/src/panels/action-options-modal.ts (handlesDoubleTap = true)
  - packages/g2-app/src/panels/move-direction-picker.ts (handlesDoubleTap = true)
  - packages/g2-app/src/panels/slot-picker-panel.ts (handlesDoubleTap = true)
  - packages/g2-app/src/panels/target-picker-panel.ts (handlesDoubleTap = true)
  - packages/g2-app/src/panels/template-placement-panel.ts (handlesDoubleTap = true)
  - packages/g2-app/src/panels/reaction-prompt-panel.ts (handlesDoubleTap = true)
