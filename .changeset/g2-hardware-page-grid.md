---
"@evf/g2-app": minor
---

Real-G2 page geometry. The real Even Hub host rejects a page whose image containers are
not on the proven grid (a rejected `rebuildPageContainer` leaves 0 containers → blank
glasses; the simulator accepts any offset). The sheet HUD keeps its exact look but now
draws the top band (portrait + header + map) into one 576 × 144 framebuffer sent as two
288 × 144 image tiles at (0,0) and (288,0), plus the sheet tile at (0,144); full-screen
states use the 2 × 2 grid of 288 × 144 tiles; the fourth slot (288,144) stays reserved in
the sheet layout because images draw above the zone-E text. Container ids follow the host's
declaration order (images first, then text: `full` 0–3 + 4, `sheet` 0–2 + 3–6), with
exactly one `' '` event-capture container. Tiles are hashed and resent individually (an AC
change resends only the left tile, the HP box straddles both top tiles), keeping priority
and ≥ 100 ms pacing; the map inside the right tile stays ≤ 1 fps. If the host rejects the sheet page at start-up or on
rebuild, the HUD logs it to the debug channel and falls back to the full-screen 2 × 2 layout
instead of leaving a dead screen.
