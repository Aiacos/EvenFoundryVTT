---
"@evf/g2-app": minor
---

The Quick Action menu now opens on a TAP from the base view (map / status-HUD),
replacing the swipe-up over-scroll trigger (ADR-0012 Amendment 2). A tap is gated
on the LayerManager z=2 overlay slot being empty, so it opens the menu ONLY from
the base view; inside a panel a tap stays the panel's own action (activate the
cursor entry in Inventario/Libro, cycle the tab in the sheet, confirm in a modal).
Checking the z=2 slot (not just PanelRouter state) also covers overlays mounted
directly on the LayerManager (concentration-drop modal), removing the old
over-scroll modal-replacement/state-loss edge. `quick-action-tap-dispatcher.ts`
replaces `quick-action-overscroll-dispatcher.ts`.
