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
#   build    production bundle (vite build → foundry-module/g2) served on the LAN with
#            `vite preview` — same demo scenes, but the exact bytes that ship.
#   foundry  your Foundry server (--foundry URL): runs the sideload GO/NO-GO checks and
#            shows the QR of the app served by Foundry. For one-scan pairing use the QR
#            in Foundry's «Associa occhiali G2» dialog instead; this QR opens the phone
#            page for the manual-code fallback.
#
# Usage
#   scripts/wizard.sh [--mode demo|build|foundry] [--scene tour|explore|combat-my-turn|…]
#                     [--dwell MS] [--port N] [--foundry URL] [--ip ADDR] [--no-firewall]
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
FOUNDRY_URL=""
LAN_IP=""
FIREWALL=1
DEBUG=0
ASSUME_YES=0
EVENHUB_CLI="@evenrealities/evenhub-cli@0.1.14"
SCENES="tour explore combat-my-turn actions target spells result reaction saves dying unpaired connecting offline"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${ROOT}/packages/g2-app/.wizard"
SERVER_PID=""
FIREWALL_OPENED=0

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

usage() { sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

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
    --foundry) FOUNDRY_URL="${2:-}"; MODE="foundry"; shift 2 ;;
    --ip) LAN_IP="${2:-}"; shift 2 ;;
    --no-firewall) FIREWALL=0; shift ;;
    --debug) DEBUG=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage; die "unknown option: $1" ;;
  esac
done

case "$MODE" in demo|build|foundry) ;; *) die "--mode must be demo, build or foundry" ;; esac
[[ "$PORT" =~ ^[0-9]+$ ]] || die "--port must be a number"
if [[ "$MODE" != "foundry" ]] && ! grep -qw -- "$SCENE" <<<"$SCENES"; then
  die "unknown --scene '$SCENE' (one of: $SCENES)"
fi
[[ -z "$DWELL" || "$DWELL" =~ ^[0-9]+$ ]] || die "--dwell must be milliseconds"
if [[ "$SCENE" == "tour" && -z "$DWELL" ]]; then DWELL=6000; fi

# ─── cleanup on exit ─────────────────────────────────────────────────────────
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    printf '\n  dev server stopped\n'
  fi
  if [[ $FIREWALL_OPENED -eq 1 ]]; then
    if sudo firewall-cmd --remove-port="${PORT}/tcp" >/dev/null 2>&1; then
      printf '  firewall port %s/tcp closed again\n' "$PORT"
    fi
  fi
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

open_firewall() {
  [[ $FIREWALL -eq 1 ]] || return 0
  command -v firewall-cmd >/dev/null || return 0
  sudo -n true 2>/dev/null || [[ -t 0 ]] || { warn "firewalld present; run with a TTY or --no-firewall"; return 0; }
  if ! firewall-cmd --state >/dev/null 2>&1; then return 0; fi
  if firewall-cmd --query-port="${PORT}/tcp" >/dev/null 2>&1; then
    ok "firewall already allows ${PORT}/tcp"
    return 0
  fi
  step "Firewall"
  if confirm "Open ${PORT}/tcp in firewalld until this wizard exits (sudo)?"; then
    if sudo firewall-cmd --add-port="${PORT}/tcp" >/dev/null; then
      FIREWALL_OPENED=1
      ok "${PORT}/tcp open (runtime only — closed on exit)"
    fi
  else
    warn "port left closed — the phone may not reach http://${LAN_IP}:${PORT}"
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
    ok "bundle in packages/foundry-module/g2"
    cmd="preview"
  else
    cmd="dev"
  fi
  step "Starting the app on the LAN (vite ${cmd})"
  (cd "$ROOT/packages/g2-app" && exec pnpm exec vite "$cmd" --host 0.0.0.0 --port "$PORT" --strictPort) \
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

check_foundry() {
  step "Foundry checks (${FOUNDRY_URL})"
  [[ "$FOUNDRY_URL" =~ ^https:// ]] \
    || warn "not HTTPS — the Even App WebView needs a trusted certificate for the real flow"
  if (cd "$ROOT" && FOUNDRY_URL="$FOUNDRY_URL" pnpm --silent --filter @evf/validation-harness \
        validate:direct-sideload:skip-hardware); then
    ok "sideload checks passed"
  else
    warn "some checks failed — fix them before scanning (see docs/setup-guide.md)"
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

if [[ "$MODE" == "foundry" ]]; then
  [[ -n "$FOUNDRY_URL" ]] || die "--mode foundry needs --foundry https://your-foundry.example"
  check_toolchain
  check_foundry
  base="${FOUNDRY_URL%/}"
  show_qr "${base}/modules/evenfoundryvtt/g2/index.html"
  printf '  For one-scan pairing use the QR in Foundry → «Associa occhiali G2» instead.\n'
  exit 0
fi

check_toolchain
detect_ip
pick_port
open_firewall
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
