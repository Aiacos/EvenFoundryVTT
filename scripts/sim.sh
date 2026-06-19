#!/usr/bin/env bash
# sim.sh — One-command EvenHub simulator dev/test harness
#
# Usage:
#   bash scripts/sim.sh [start [--actor ACTORID] | stop | seed | shot [OUTPUT_PATH]]
#   pnpm sim [start [--actor ACTORID] | stop | seed | shot [OUTPUT_PATH]]
#
# Subcommands:
#   start   Boot bridge (no-auth) + seed fixtures + vite + EvenHub simulator [default]
#   stop    Tear down all listeners on ports 8911, 5173, 9898
#   seed    Re-seed all fixtures into a running bridge (POST /internal/delta)
#   shot    Capture a screenshot from the glasses viewport to a PNG file
#
# Footguns encoded (verified-correct from 260605-* session):
#   (a) GTK env block is MANDATORY in headless mode (DISPLAY unset) — glycin-loaders crash
#   (b) Teardown uses `fuser -k PORT/tcp`, NOT process-name-based kill commands —
#       name-pattern matches would self-match the script's own command line
#   (c) Bridge cache is IN-MEMORY — every (re)start must re-seed
#   (d) `?actor=<id>` must be appended to the simulator TARGET URL, not added afterward
#
# Prerequisites (see docs/simulator-testing.md for full setup guide):
#   - corepack pnpm (not bare pnpm) — confirmed via `corepack pnpm --version`
#   - On headless Linux: xvfb + GTK runtime packages (script sets env automatically)
#   - evenhub-simulator binary (globally installed, or script falls back to npx)
#
# Security note:
#   DEV_SECRET below is a throwaway LOCAL no-auth value — safe to commit, NEVER used in prod.
#   Production secrets live in deploy/.env (EVF_INTERNAL_SECRET). The bridge's
#   isDevNoAuth() requires NODE_ENV !== 'production', so this only works in dev mode.
#
# @see packages/bridge/src/auth/is-dev-no-auth.ts — no-auth gate
# @see packages/bridge/src/routes/internal-delta.ts — seed route
# @see docs/simulator-testing.md — full dev/test loop documentation

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────────

readonly BRIDGE_PORT=8911
readonly VITE_PORT=5173
readonly SIM_PORT=9898

# Throwaway LOCAL dev-only secret — safe to commit. NEVER used in production.
# Production: set EVF_INTERNAL_SECRET in deploy/.env
readonly DEV_SECRET="dev-secret"

# Directory layout
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
readonly FIXTURES_DIR="${SCRIPT_DIR}/sim-fixtures"
readonly REPO_ROOT="${SCRIPT_DIR}/.."
readonly RUN_DIR="${REPO_ROOT}/.sim-run"

# ──────────────────────────────────────────────────────────────────────────────
# Helper: wait_http — poll a URL until HTTP 200 (or optional body match)
#
# Usage: wait_http <url> <label> [timeout_secs] [body_substring]
# ──────────────────────────────────────────────────────────────────────────────
wait_http() {
  local url="$1"
  local label="$2"
  local timeout="${3:-30}"
  local body_match="${4:-}"
  local elapsed=0
  local interval=1

  echo "  Waiting for ${label} at ${url} ..."
  while true; do
    if [[ -n "$body_match" ]]; then
      # Check both HTTP 200 and body contains the expected substring
      local body
      body=$(curl -fsS --max-time 3 "$url" 2>/dev/null || true)
      if echo "$body" | grep -q "$body_match" 2>/dev/null; then
        echo "  ${label} ready (body match: ${body_match})"
        return 0
      fi
    else
      local code
      code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "000")
      if [[ "$code" == "200" ]]; then
        echo "  ${label} ready (HTTP 200)"
        return 0
      fi
    fi

    elapsed=$((elapsed + interval))
    if [[ $elapsed -ge $timeout ]]; then
      echo ""
      echo "ERROR: ${label} did not come up within ${timeout}s (url: ${url})"
      if [[ -f "${RUN_DIR}/${label,,}.log" ]]; then
        echo "--- last 20 lines of ${label,,}.log ---"
        tail -20 "${RUN_DIR}/${label,,}.log" || true
      fi
      exit 1
    fi
    sleep "$interval"
  done
}

# ──────────────────────────────────────────────────────────────────────────────
# Helper: do_seed — POST all fixtures to /internal/delta
#
# The bridge cache is IN-MEMORY, so every (re)start must re-seed.
# Roster is seeded first so the character list is available immediately.
# ──────────────────────────────────────────────────────────────────────────────
do_seed() {
  echo ""
  echo "Seeding fixtures into bridge..."

  local base_url="http://localhost:${BRIDGE_PORT}"
  local endpoint="${base_url}/internal/delta"

  # Seed roster first (must precede character snapshots so the list is ready)
  local roster_file="${FIXTURES_DIR}/roster.json"
  echo "  POST roster.json → ${endpoint}"
  local roster_resp
  roster_resp=$(curl -fsS \
    -X POST "${endpoint}" \
    -H "Authorization: Bearer ${DEV_SECRET}" \
    -H "Content-Type: application/json" \
    --data "@${roster_file}" \
    2>&1) || {
    echo "ERROR: Failed to POST roster.json — is the bridge running on :${BRIDGE_PORT}?"
    exit 1
  }
  if ! echo "$roster_resp" | grep -q '"ok":true'; then
    echo "ERROR: roster.json seed returned unexpected response:"
    echo "$roster_resp"
    exit 1
  fi
  echo "  roster seeded ok"

  # Seed all four character snapshots
  for slug in artemis dante karius shin; do
    local char_file="${FIXTURES_DIR}/character-${slug}.json"
    echo "  POST character-${slug}.json → ${endpoint}"
    local char_resp
    char_resp=$(curl -fsS \
      -X POST "${endpoint}" \
      -H "Authorization: Bearer ${DEV_SECRET}" \
      -H "Content-Type: application/json" \
      --data "@${char_file}" \
      2>&1) || {
      echo "ERROR: Failed to POST character-${slug}.json"
      exit 1
    }
    if ! echo "$char_resp" | grep -q '"ok":true'; then
      echo "ERROR: character-${slug}.json seed returned unexpected response:"
      echo "$char_resp"
      exit 1
    fi
    echo "  character-${slug} seeded ok"
  done

  # Seed the map scene (frame_png) so the glasses show a z=0 map background.
  # On real Foundry this streams from the canvas-extractor; in the sim we seed
  # a synthetic battle map so the HUD isn't composited over a black void.
  local map_file="${FIXTURES_DIR}/scene-map.json"
  if [[ -f "${map_file}" ]]; then
    echo "  POST scene-map.json → ${endpoint}"
    local map_resp
    map_resp=$(curl -fsS \
      -X POST "${endpoint}" \
      -H "Authorization: Bearer ${DEV_SECRET}" \
      -H "Content-Type: application/json" \
      --data "@${map_file}" \
      2>&1) || {
      echo "ERROR: Failed to POST scene-map.json"
      exit 1
    }
    if ! echo "$map_resp" | grep -q '"ok":true'; then
      echo "ERROR: scene-map.json seed returned unexpected response:"
      echo "$map_resp"
      exit 1
    fi
    echo "  scene-map seeded ok"
  fi

  echo "All fixtures seeded."
}

# ──────────────────────────────────────────────────────────────────────────────
# Helper: do_stop — kill all three service ports
#
# Uses fuser -k PORT/tcp — the canonical teardown on this box.
# We deliberately use fuser instead of process-name-based kill (e.g. by vite/evenhub
# patterns) because such patterns self-match the script's own command line (known footgun).
# ──────────────────────────────────────────────────────────────────────────────
do_stop() {
  echo "Stopping services on ports ${BRIDGE_PORT}, ${VITE_PORT}, ${SIM_PORT} ..."

  # fuser -k exits non-zero if no process owned the port — guard with || true
  fuser -k "${BRIDGE_PORT}/tcp" 2>/dev/null || true
  fuser -k "${VITE_PORT}/tcp" 2>/dev/null || true
  fuser -k "${SIM_PORT}/tcp" 2>/dev/null || true

  # Remove pid files
  rm -f "${RUN_DIR}/bridge.pid" "${RUN_DIR}/vite.pid" "${RUN_DIR}/sim.pid"

  echo "Services stopped."
}

# ──────────────────────────────────────────────────────────────────────────────
# Subcommand: start
# ──────────────────────────────────────────────────────────────────────────────
cmd_start() {
  # Parse optional --actor argument
  local actor_id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --actor)
        shift
        actor_id="${1:-}"
        if [[ -z "$actor_id" ]]; then
          echo "ERROR: --actor requires an actorId argument"
          exit 1
        fi
        ;;
      *)
        echo "WARNING: unknown argument '$1' — ignored"
        ;;
    esac
    shift
  done

  echo "┌─────────────────────────────────────────────────────────────────┐"
  echo "│  EVF simulator harness — start                                  │"
  echo "└─────────────────────────────────────────────────────────────────┘"

  if [[ -n "$actor_id" ]]; then
    echo "Actor override: ${actor_id}"
  else
    echo "Actor: default (Artemis, E14Tfh9Ba07cpPyM — first roster entry)"
  fi

  # Idempotent: tear down any prior session before starting fresh
  do_stop

  mkdir -p "${RUN_DIR}"

  # ── Bridge ────────────────────────────────────────────────────────────────
  echo ""
  echo "Starting bridge on :${BRIDGE_PORT} ..."
  EVF_DEV_NO_AUTH=true \
  EVF_INTERNAL_SECRET="${DEV_SECRET}" \
  PORT="${BRIDGE_PORT}" \
  NODE_ENV=development \
    corepack pnpm --filter @evf/bridge exec tsx src/index.ts \
    > "${RUN_DIR}/bridge.log" 2>&1 &
  echo $! > "${RUN_DIR}/bridge.pid"

  wait_http "http://localhost:${BRIDGE_PORT}/healthz" "bridge" 30

  # ── Seed ─────────────────────────────────────────────────────────────────
  do_seed

  # ── Vite ──────────────────────────────────────────────────────────────────
  echo ""
  echo "Starting Vite dev server on :${VITE_PORT} ..."
  VITE_EVF_NO_AUTH=true \
  VITE_EVF_DEV_BRIDGE_URL="http://localhost:${BRIDGE_PORT}" \
    corepack pnpm --filter @evf/g2-app exec vite --host 0.0.0.0 --port "${VITE_PORT}" \
    > "${RUN_DIR}/vite.log" 2>&1 &
  echo $! > "${RUN_DIR}/vite.pid"

  wait_http "http://localhost:${VITE_PORT}/" "vite" 30

  # ── Simulator target URL ───────────────────────────────────────────────────
  # The ?actor= query string MUST be appended to TARGET before passing it to the
  # simulator binary — appending it after the sim starts does NOT work (known footgun).
  local target="http://localhost:${VITE_PORT}/"
  if [[ -n "$actor_id" ]]; then
    target="${target}?actor=${actor_id}"
  fi

  # ── EvenHub simulator ─────────────────────────────────────────────────────
  echo ""
  echo "Starting EvenHub simulator on :${SIM_PORT} ..."
  echo "  Target URL: ${target}"

  # Resolve simulator binary: prefer globally installed, fall back to npx
  local sim_bin
  if command -v evenhub-simulator &>/dev/null; then
    sim_bin="evenhub-simulator"
  else
    echo "  evenhub-simulator not in PATH — using npx @evenrealities/evenhub-simulator"
    sim_bin="npx @evenrealities/evenhub-simulator"
  fi

  if [[ -z "${DISPLAY:-}" ]]; then
    # ── Headless mode ──────────────────────────────────────────────────────
    # The GTK env block is MANDATORY in headless mode — without it the simulator
    # crashes with glycin-loaders / GdkPixbuf errors (verified footgun, 260605 session).
    echo "  No DISPLAY detected — launching via xvfb-run with mandatory GTK env"
    export XDG_DATA_DIRS="/usr/share:/usr/local/share:/home/linuxbrew/.linuxbrew/share"
    export GDK_PIXBUF_MODULE_FILE="/usr/lib/x86_64-linux-gnu/gdk-pixbuf-2.0/2.10.0/loaders.cache"
    export GSK_RENDERER="cairo"
    export LIBGL_ALWAYS_SOFTWARE="1"
    # shellcheck disable=SC2086
    xvfb-run -a $sim_bin "$target" --automation-port "${SIM_PORT}" \
      > "${RUN_DIR}/sim.log" 2>&1 &
  else
    # ── Desktop / DISPLAY-set mode ─────────────────────────────────────────
    echo "  DISPLAY=${DISPLAY} — launching simulator directly"
    # shellcheck disable=SC2086
    $sim_bin "$target" --automation-port "${SIM_PORT}" \
      > "${RUN_DIR}/sim.log" 2>&1 &
  fi
  echo $! > "${RUN_DIR}/sim.pid"

  # GTK boot is slow — allow up to 60s; check /api/ping body for "pong"
  wait_http "http://127.0.0.1:${SIM_PORT}/api/ping" "sim" 60 "pong"

  # ── Cheatsheet ────────────────────────────────────────────────────────────
  echo ""
  echo "┌─────────────────────────────────────────────────────────────────┐"
  echo "│  EVF simulator harness — READY                                  │"
  echo "└─────────────────────────────────────────────────────────────────┘"
  echo ""
  echo "Services:"
  echo "  Bridge      http://localhost:${BRIDGE_PORT}   (no-auth dev, secret=${DEV_SECRET})"
  echo "  Vite        http://localhost:${VITE_PORT}/"
  echo "  Simulator   http://127.0.0.1:${SIM_PORT}  (glasses API)"
  echo ""
  echo "Roster actorIds (use --actor to select which PC the glasses render):"
  echo "  Artemis        E14Tfh9Ba07cpPyM   (default, hp 55/88, ac 18)"
  echo "  Dante Lanzulli 6KWxQXAiJgz4zKlS  (hp 41/63, ac 16)"
  echo "  Karius Frede   4GXG7ufxylS4H1Pk  (hp 70/70, ac 20)"
  echo "  Shin           VoNfASW4hQ4dG4cv   (hp 12/48, ac 14)"
  echo ""
  echo "Observation API (EvenHub simulator at :${SIM_PORT}):"
  echo "  Screenshot (576x288 RGBA png):"
  echo "    pnpm sim shot /tmp/glasses.png"
  echo "    curl -s http://127.0.0.1:${SIM_PORT}/api/screenshot/glasses -o /tmp/glasses.png"
  echo "  Console log:"
  echo "    curl -s http://127.0.0.1:${SIM_PORT}/api/console"
  echo "  Input event (R1 tap):"
  echo "    curl -s -X POST http://127.0.0.1:${SIM_PORT}/api/input \\"
  echo "      -H 'Content-Type: application/json' \\"
  echo "      -d '{\"action\":\"tap\"}'"
  echo ""
  echo "Switch PC:   pnpm sim start --actor 6KWxQXAiJgz4zKlS"
  echo "Re-seed:     pnpm sim seed"
  echo "Stop:        pnpm sim stop"
  echo ""
  echo "Logs in: ${RUN_DIR}/"
}

# ──────────────────────────────────────────────────────────────────────────────
# Subcommand: stop
# ──────────────────────────────────────────────────────────────────────────────
cmd_stop() {
  do_stop
}

# ──────────────────────────────────────────────────────────────────────────────
# Subcommand: seed
# ──────────────────────────────────────────────────────────────────────────────
cmd_seed() {
  do_seed
}

# ──────────────────────────────────────────────────────────────────────────────
# Subcommand: shot — capture a screenshot from the glasses viewport
#
# Usage: bash scripts/sim.sh shot [OUTPUT_PATH]
# ──────────────────────────────────────────────────────────────────────────────
cmd_shot() {
  local output="${1:-/tmp/glasses.png}"
  echo "Capturing glasses screenshot → ${output}"
  curl -fsS "http://127.0.0.1:${SIM_PORT}/api/screenshot/glasses" \
    -o "${output}" || {
    echo "ERROR: Could not reach simulator screenshot API at :${SIM_PORT}"
    echo "Is the simulator running? Try: pnpm sim start"
    exit 1
  }
  local size
  size=$(wc -c < "${output}" 2>/dev/null || echo 0)
  echo "Screenshot saved: ${output} (${size} bytes)"
}

# ──────────────────────────────────────────────────────────────────────────────
# Main — dispatch subcommand
# ──────────────────────────────────────────────────────────────────────────────
SUBCOMMAND="${1:-start}"
shift || true  # remove subcommand from $@; shift on empty $@ is a no-op in bash

case "$SUBCOMMAND" in
  start)
    cmd_start "$@"
    ;;
  stop)
    cmd_stop
    ;;
  seed)
    cmd_seed
    ;;
  shot)
    cmd_shot "${1:-}"
    ;;
  *)
    echo "Usage: pnpm sim [start [--actor ACTORID] | stop | seed | shot [PATH]]"
    echo ""
    echo "  start   Boot bridge + vite + EvenHub simulator (idempotent, re-seeds on every start)"
    echo "  stop    Tear down ports ${BRIDGE_PORT}, ${VITE_PORT}, ${SIM_PORT} (fuser -k)"
    echo "  seed    Re-seed fixtures into a running bridge"
    echo "  shot    Capture glasses screenshot (default: /tmp/glasses.png)"
    exit 1
    ;;
esac
