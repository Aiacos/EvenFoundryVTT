#!/usr/bin/env bash
# EvenFoundryVTT — G2 test wizard.
#
# Prepares everything to try the glasses app on real Even Realities G2 hardware and
# prints the QR to scan with the Even Realities App (Developer Mode → Even Hub tab →
# "Scan QR", per hub.evenrealities.com/docs/test/local-testing).
#
# Modes
#   demo     (default) local Vite dev server on the LAN with scripted HUD scenes
#            (?demo=…) — no Foundry needed. Checks the real-host page geometry,
#            fonts, map and gestures.
#   build    production bundle (vite build → packages/g2-app/dist) served on the LAN with
#            `vite preview` — same demo scenes, but the exact bytes that ship.
#   live     the real pairing flow against YOUR Foundry (ADR-0019), with the app from
#            this checkout: serves it on the LAN, checks the relay, and tells you the
#            module setting to change («Glasses app page» = this LAN URL). Then open
#            «Collega occhiali G2» in Foundry (Alt+G) and scan ITS QR with the Even
#            Realities App. `--local-relay` also runs the relay here (`wrangler dev`) —
#            only for an http:// Foundry (an https page cannot open ws:// on the LAN).
#            `pnpm dev:glasses` = this mode.
#
# Usage
#   scripts/wizard.sh [--mode demo|build|live] [--scene tour|explore|combat-my-turn|…]
#                     [--dwell MS] [--port N] [--local-relay] [--ip ADDR] [--no-firewall]
#                     [--debug] [--yes] [--help]
#
# Needs: bash, Node 24 + pnpm (repo toolchain), curl. The QR is drawn by the official
# @evenrealities/evenhub-cli (fetched with npx). Stop with Ctrl-C: the dev server is
# stopped and a firewall port opened by the wizard is closed again.

set -euo pipefail

# ─── defaults ────────────────────────────────────────────────────────────────
MODE="demo"
SCENE="tour"
DWELL=""
PORT="5173"
PORT_EXPLICIT=0
LOCAL_RELAY=0
RELAY_PORT="8787"
DEV_RELAY=""
LAN_IP=""
FIREWALL=1
DEBUG=0
ASSUME_YES=0
EVENHUB_CLI="@evenrealities/evenhub-cli@0.1.14"
SCENES="tour explore combat-my-turn actions target spells result reaction saves dying unpaired connecting offline"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT}/packages/g2-app/.wizard"
SERVER_PID=""
RELAY_PID=""
FIREWALL_PORTS=()

# ─── output helpers ──────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; N=$'\e[0m'
else
  B=""; G=""; Y=""; R=""; C=""; N=""
fi
step() { printf '\n%s▸ %s%s\n' "$B$C" "$*" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$Y" "$N" "$*"; }
die()  { printf '  %s✗ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }

usage() { sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

confirm() { # confirm "question" → 0 yes / 1 no (default no; --yes answers yes)
  [[ $ASSUME_YES -eq 1 ]] && return 0
  [[ -t 0 ]] || return 1
  local answer
  read -r -p "  $1 [s/N] " answer
  [[ "$answer" =~ ^[sSyY]$ ]]
}

# ─── arguments ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --scene) SCENE="${2:-}"; shift 2 ;;
    --dwell) DWELL="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; PORT_EXPLICIT=1; shift 2 ;;
    --local-relay) LOCAL_RELAY=1; shift ;;
    --ip) LAN_IP="${2:-}"; shift 2 ;;
    --no-firewall) FIREWALL=0; shift ;;
    --debug) DEBUG=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage; die "unknown option: $1" ;;
  esac
done

case "$MODE" in demo|build|live) ;; *) die "--mode must be demo, build or live" ;; esac
[[ "$PORT" =~ ^[0-9]+$ ]] || die "--port must be a number"
if [[ "$MODE" != "live" ]] && ! grep -qw -- "$SCENE" <<<"$SCENES"; then
  die "unknown --scene '$SCENE' (one of: $SCENES)"
fi
[[ -z "$DWELL" || "$DWELL" =~ ^[0-9]+$ ]] || die "--dwell must be milliseconds"
if [[ "$SCENE" == "tour" && -z "$DWELL" ]]; then DWELL=6000; fi

# ─── cleanup on exit ─────────────────────────────────────────────────────────
cleanup() {
  local pid port
  for pid in "$SERVER_PID" "$RELAY_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  if [[ -n "$SERVER_PID" ]]; then printf '\n  dev servers stopped\n'; fi
  for port in "${FIREWALL_PORTS[@]}"; do
    if sudo firewall-cmd --remove-port="${port}/tcp" >/dev/null 2>&1; then
      printf '  firewall port %s/tcp closed again\n' "$port"
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ─── steps ───────────────────────────────────────────────────────────────────
check_toolchain() {
  step "Toolchain"
  command -v node >/dev/null || die "Node.js not found (repo uses Node $(cat "$ROOT/.nvmrc"))"
  command -v pnpm >/dev/null || die "pnpm not found (corepack enable)"
  command -v curl >/dev/null || die "curl not found"
  ok "node $(node --version) · pnpm $(pnpm --version)"
  if [[ ! -d "$ROOT/node_modules" ]]; then
    warn "dependencies missing — installing"
    (cd "$ROOT" && pnpm install --frozen-lockfile)
  fi
  ok "dependencies installed"
}

detect_ip() {
  step "LAN address"
  if [[ -z "$LAN_IP" ]]; then
    LAN_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<NF;i++) if ($i=="src") {print $(i+1); exit}}')"
    [[ -n "$LAN_IP" ]] || LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  [[ -n "$LAN_IP" ]] || die "cannot detect the LAN IP — pass --ip 192.168.x.y"
  ok "$LAN_IP (phone and PC must be on this network; client-isolated Wi-Fi won't work)"
}

open_firewall() { # open_firewall PORT
  local port="$1"
  [[ $FIREWALL -eq 1 ]] || return 0
  command -v firewall-cmd >/dev/null || return 0
  sudo -n true 2>/dev/null || [[ -t 0 ]] || { warn "firewalld present; run with a TTY or --no-firewall"; return 0; }
  if ! firewall-cmd --state >/dev/null 2>&1; then return 0; fi
  if firewall-cmd --query-port="${port}/tcp" >/dev/null 2>&1; then
    ok "firewall already allows ${port}/tcp"
    return 0
  fi
  step "Firewall"
  if confirm "Open ${port}/tcp in firewalld until this wizard exits (sudo)?"; then
    if sudo firewall-cmd --add-port="${port}/tcp" >/dev/null; then
      FIREWALL_PORTS+=("$port")
      ok "${port}/tcp open (runtime only — closed on exit)"
    fi
  else
    warn "port left closed — the phone may not reach ${LAN_IP}:${port}"
  fi
}

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

pick_port() { # keep --port as given; otherwise take the first free port from 5173 up
  if port_busy "$PORT"; then
    [[ $PORT_EXPLICIT -eq 1 ]] && die "port ${PORT} is already in use — choose another --port"
    local p
    for p in $(seq "$PORT" $((PORT + 20))); do
      if ! port_busy "$p"; then
        warn "port ${PORT} busy (another dev server?) — using ${p}"
        PORT="$p"
        return 0
      fi
    done
    die "no free port in ${PORT}–$((PORT + 20)) — pass --port N"
  fi
}

start_server() {
  mkdir -p "$LOG_DIR"
  local log="$LOG_DIR/server.log" cmd
  if [[ "$MODE" == "build" ]]; then
    step "Production build"
    (cd "$ROOT" && pnpm --filter @evf/g2-app build >"$LOG_DIR/build.log" 2>&1) \
      || die "build failed — see $LOG_DIR/build.log"
    ok "bundle in packages/g2-app/dist"
    cmd="preview"
  else
    cmd="dev"
  fi
  step "Starting the app on the LAN (vite ${cmd})"
  (cd "$ROOT/packages/g2-app" && VITE_RELAY_URL="$DEV_RELAY" \
    exec pnpm exec vite "$cmd" --host 0.0.0.0 --port "$PORT" --strictPort) \
    >"$log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    if curl -fs -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
      ok "serving http://${LAN_IP}:${PORT}/ (log: packages/g2-app/.wizard/server.log)"
      return 0
    fi
    kill -0 "$SERVER_PID" 2>/dev/null || die "server exited — see $log"
    sleep 0.5
  done
  die "server did not answer within 30 s — see $log"
}

start_relay() { # --local-relay: the relay of this checkout on the LAN (wrangler dev)
  step "Starting the relay on the LAN (wrangler dev :${RELAY_PORT})"
  mkdir -p "$LOG_DIR"
  (cd "$ROOT/packages/relay" && exec npx wrangler dev --ip 0.0.0.0 --port "$RELAY_PORT") \
    >"$LOG_DIR/relay.log" 2>&1 &
  RELAY_PID=$!
  for _ in $(seq 1 90); do
    if curl -fs -o /dev/null "http://127.0.0.1:${RELAY_PORT}/health" 2>/dev/null; then
      DEV_RELAY="ws://${LAN_IP}:${RELAY_PORT}"
      ok "relay on ${DEV_RELAY} (log: packages/g2-app/.wizard/relay.log)"
      return 0
    fi
    kill -0 "$RELAY_PID" 2>/dev/null || die "relay exited — see $LOG_DIR/relay.log"
    sleep 0.5
  done
  die "relay did not answer within 45 s — see $LOG_DIR/relay.log"
}

check_relay() { # the production relay must answer before a live test
  local url
  url="$(sed -n "s/.*DEFAULT_RELAY_URL = 'wss:\/\/\([^']*\)'.*/https:\/\/\1/p" \
    "$ROOT/packages/shared-protocol/src/direct/relay.ts")"
  step "Relay (${url})"
  if curl -fsS --max-time 10 "${url}/health" >/dev/null 2>&1; then
    ok "production relay answers"
  else
    warn "production relay not reachable — deploy it (docs/runbook.md) or use --local-relay"
  fi
}

show_qr() {
  local url="$1" debug_note=""
  [[ $DEBUG -eq 1 ]] && debug_note=" (debug channel on: window.__evf, captured warnings)"
  step "Scan this QR with the Even Realities App"
  npx -y "$EVENHUB_CLI" qr --url "$url" 2>/dev/null \
    || { warn "could not draw the QR with $EVENHUB_CLI — open the URL above as a QR generator input"; }
  cat <<EOF

  ${B}On the phone${N} (first time only: steps 1–2)
    1. Have an Even Realities account (created in the Even Realities App)
    2. Sign in once at ${B}https://hub.evenrealities.com/login${N} — that makes the account a
       developer account — then force-quit and reopen the Even Realities App
    3. Tab ${B}Even Hub${N} → ${B}Scan QR${N} → aim at the code above
    4. The glasses render the app within a second
       Logs: Developer Mode screen → developer console${debug_note}
    Note: a QR-loaded app stops when the phone backgrounds it — re-scan after a lock.

EOF
}

# ─── main ────────────────────────────────────────────────────────────────────
printf '%sEvenFoundryVTT · G2 test wizard%s  (mode: %s)\n' "$B" "$N" "$MODE"

if [[ "$MODE" == "live" ]]; then
  check_toolchain
  detect_ip
  pick_port
  open_firewall "$PORT"
  if [[ $LOCAL_RELAY -eq 1 ]]; then
    open_firewall "$RELAY_PORT"
    start_relay
  else
    check_relay
  fi
  start_server
  printf '\n  %sIn Foundry%s (module settings › EvenFoundryVTT, this browser only)\n' "$B" "$N"
  printf '    • Glasses app page (advanced) = %shttp://%s:%s/%s\n' "$B" "$LAN_IP" "$PORT" "$N"
  if [[ -n "$DEV_RELAY" ]]; then
    printf '    • Relay (advanced)           = %s%s%s   (http:// Foundry only)\n' "$B" "$DEV_RELAY" "$N"
  fi
  printf '  Then press %sAlt+G%s («Collega occhiali G2») and scan THAT QR with the Even\n' "$B" "$N"
  printf '  Realities App (Developer Mode → Even Hub → Scan QR). Edits hot-reload on the glasses.\n'
  printf '\n  Press %sCtrl-C%s to stop.\n' "$B" "$N"
  wait "$SERVER_PID"
  exit 0
fi

check_toolchain
detect_ip
pick_port
open_firewall "$PORT"
start_server

query="demo=${SCENE}"
[[ -n "$DWELL" ]] && query="${query}&dwell=${DWELL}"
[[ $DEBUG -eq 1 ]] && query="${query}&debug=1"
show_qr "http://${LAN_IP}:${PORT}/?${query}"

cat <<EOF
  ${B}What to check${N}
    • the D&D-sheet page appears (portrait · AC shield · HP · square map top-right);
      a full-screen layout instead means the host rejected the sheet grid
    • the two top-band tiles meet cleanly at the centre (x = 288)
    • legibility of numbers, pixelated map and portrait brightness
    • gestures: tap = actions · swipe = cursor · double-tap = back
      (single scene: --scene explore | combat-my-turn | actions | target | …)

  Press ${B}Ctrl-C${N} to stop.
EOF
wait "$SERVER_PID"
