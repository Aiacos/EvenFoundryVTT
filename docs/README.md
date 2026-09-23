# EvenFoundryVTT — Docs

Documentation index for **EvenFoundryVTT** v0.12.0 (direct Foundry → G2 streaming). The
**canonical source of truth** is [`Specs.md`](../Specs.md) at the repository root. Every
document here is a projection or expansion of it.

---

## 📚 Where to start

| Resource | Path | Description |
|---|---|---|
| Canonical specification | [`Specs.md`](../Specs.md) | Requirements, architecture, hardware constraints, UI/UX mockups, roadmap. |
| Project wiki (Italian) | [`wiki/`](wiki/Home.md) → [GitHub wiki](https://github.com/Aiacos/EvenFoundryVTT/wiki) | Player, GM and developer guides by audience; mirrored to the GitHub wiki by `.github/workflows/wiki-sync.yml`, links checked by `scripts/check-wiki-links.mjs`. |
| Setup guide | [`setup-guide.md`](setup-guide.md) | HTTPS prerequisites → install the module → GM pairing → player QR scan → manual code, revoke, troubleshooting. |
| Runbook | [`runbook.md`](runbook.md) | Diagnosis from the phone page and the GM browser, the `validate:direct-sideload` harness, revoke / re-pair, common errors. |
| Design index | [`design/README.md`](design/README.md) | Current and historical design documents. |
| Sheet layout design | [`design/g2-sheet-ux.html`](design/g2-sheet-ux.html) | «Scheda da tavolo G2»: zones, principles, gestures, 12 glasses screens (S1–S12); simulator screenshots in [`design/img/`](design/img/). INV-1 contract = `packages/shared-render/src/fixtures/sheet.*.txt`. |
| Thirds layout (superseded) | [`design/g2-thirds-layout.md`](design/g2-thirds-layout.md) | Historical first v0.12 layout; its pairing flow and phone/Foundry mocks (P01–P03) are still current. |
| Direct streaming decision | [`architecture/0016-direct-foundry-streaming.md`](architecture/0016-direct-foundry-streaming.md) | Why the bridge, Docker and `foundry-mcp` were removed. |
| Firmware compatibility | [`firmware-compatibility.md`](firmware-compatibility.md) | Even Hub SDK / Even App / Foundry version matrix + forward-compat policy. |
| Invariants | [`architecture/INVARIANTS.md`](architecture/INVARIANTS.md) | INV-1..6 and how CI enforces them. |
| ADRs | [`architecture/`](architecture/) | ADR-0001 … ADR-0018 ([index](architecture/README.md)); 0017 = player-owned glasses + hybrid projector, 0018 = D&D-sheet HUD pixel renderer. |
| Release | [`release/foundry-module.md`](release/foundry-module.md) · [`release/evenhub.md`](release/evenhub.md) | Module zip (with `g2/`) and the secondary `.ehpk`. |
| Animated showcase | [`showcase/index.html`](showcase/index.html) | Single-file showcase (GitHub Pages). |

---

## 🧪 Field tests and measurements

- [`field-test-template.md`](field-test-template.md): NASA-TLX + Borg CR-10 self-report
  and the SC-10-01..03 closure checkboxes for a real hardware session.
- [`perf/phase-0/`](perf/phase-0/README.md): machine-readable Phase 0 evidence, plus the
  `adr-0016-direct-sideload-*.json` output of the sideload harness.

---

## 📊 Project status

| Item | Link |
|---|---|
| Root README (GitHub landing) | [`README.md`](../README.md) |
| Roadmap | [`.planning/ROADMAP.md`](../.planning/ROADMAP.md) |
| Current state | [`.planning/STATE.md`](../.planning/STATE.md) |

---

## 🏗️ Documentation structure

```
docs/
├── README.md                    ← you are here
├── setup-guide.md               ← install + pairing walkthrough
├── runbook.md                   ← diagnosis and recovery
├── firmware-compatibility.md    ← Even Hub SDK / Even App / Foundry matrix
├── field-test-template.md       ← hardware session self-report
├── index.html                   ← redirect to showcase/
├── architecture/
│   ├── README.md                ← ADR index
│   ├── INVARIANTS.md            ← INV-1..6
│   └── 0001 … 0018-*.md         ← ADRs (0016 direct streaming · 0017 player-owned glasses · 0018 sheet HUD)
├── design/
│   ├── README.md                ← design index
│   ├── g2-sheet-ux.html         ← D&D-sheet HUD design (current)
│   ├── g2-thirds-layout.md      ← superseded thirds HUD + pairing mocks P01–P03
│   └── img/sheet-*.png          ← simulator screenshots S1–S12
├── perf/
│   └── phase-0/                 ← GO/NO-GO evidence + calibration methodology
├── release/
│   ├── foundry-module.md        ← GitHub Release of the module zip
│   └── evenhub.md               ← .ehpk packaging (secondary)
├── showcase/
│   └── index.html               ← animated showcase (GitHub Pages)
└── wiki/                        ← GitHub-wiki source (Italian): Home, _Sidebar, _Footer, 22 pages, images/
```

---

*Version numbers in this folder follow the `Specs.md` header (the INV-3 anchor). A
cross-cutting version bump updates `Specs.md` + `README.md` + `docs/showcase/index.html`
in one commit.*
