# EvenFoundryVTT — Docs

Documentation index for the **EvenFoundryVTT** project. This folder contains operator guides,
architecture references, and field-test materials. The **canonical source of truth** is
`Specs.md` at the repository root; all documents here are projections or expansions of it.

---

## Where to start

| Resource | Path | Description |
|----------|------|-------------|
| Canonical specification | [`Specs.md`](../Specs.md) | 4 000+ line requirements, architecture, hardware constraints, UI/UX mockups, roadmap. Start here. |
| 5-step quickstart | [`docs/setup-guide.md`](setup-guide.md) | Install Foundry module → bridge service → plugin host → Even Realities App → R1 pairing. |
| Operational runbook | [`docs/runbook.md`](runbook.md) | Bridge restart, audit log, bearer revoke, metrics, common errors with recovery. |
| Firmware compatibility | [`docs/firmware-compatibility.md`](firmware-compatibility.md) | Even Hub SDK version matrix + forward-compat policy. |
| Latency profile | [`docs/perf/phase-10-latency.md`](perf/phase-10-latency.md) | Hardware-pending perf measurements (scaffold only until real hardware session). |
| Animated showcase | [`docs/showcase/index.html`](showcase/index.html) | Single-file animated showcase of all HUD panels. Open in any browser. |
| Invariants | [`docs/architecture/INVARIANTS.md`](architecture/INVARIANTS.md) | The 6 ratified non-negotiable project invariants (INV-1..6). |
| ADRs | [`docs/architecture/`](architecture/) | Architecture Decision Records (ADR-0001 through ADR-0011 + reserved). |

---

## Field-test template

When a real hardware session is available, use the structured self-report form for SC-10-01 closure:

- [`docs/field-test-template.md`](field-test-template.md) — NASA-TLX (6 dimensions × 21-point scale) + Borg CR-10 eye-fatigue + SC-10-01..03 closure checkboxes.

---

## Project status

| Item | Link |
|------|------|
| Root README (GitHub landing) | [`README.md`](../README.md) |
| Phase roadmap | [`.planning/ROADMAP.md`](../.planning/ROADMAP.md) |
| Current state | [`.planning/STATE.md`](../.planning/STATE.md) |

---

## Documentation structure

```
docs/
├── README.md                   ← you are here (docs-folder index)
├── setup-guide.md              ← 5-step install walkthrough
├── runbook.md                  ← operational procedures
├── firmware-compatibility.md   ← Even Hub SDK matrix
├── field-test-template.md      ← NASA-TLX self-report template
├── architecture/
│   ├── README.md               ← ADR index
│   ├── INVARIANTS.md           ← INV-1..6 ratified
│   ├── 0001-layered-ui-model.md
│   ├── ... (0002 – 0011 + reserved)
├── perf/
│   └── phase-10-latency.md     ← latency template (hardware-pending)
├── release/
│   └── foundry-module.md       ← how to cut a GitHub Release
├── showcase/
│   └── index.html              ← animated showcase (GitHub Pages)
└── wiki/
```

---

*All version numbers in this folder follow `Specs.md` header (the INV-3 anchor). Any cross-cutting
version bump updates `Specs.md` + `README.md` + `docs/showcase/index.html` in a single atomic commit
per INV-3 (§0.1).*
