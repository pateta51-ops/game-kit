#!/usr/bin/env bash
# Installs the GitHub Actions self-hosted runner of one repository as a systemd service in a WSL Ubuntu machine, in
# its own folder, beside any runners already there, which it does not touch.
# Safe to run again: it keeps an installed runner, re-registers it only when it is not registered, and always ends by
# checking the service and the runner's status on GitHub.
#
#   RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label> bash install-wsl.sh [--check] [--token <token> | <token>]
#
# Optional: RUNNER_DIR (default ~/actions-runner-<label>), RUNNER_NAME (default <label>-wsl), RUNNER_TOKEN.
# The registration token (valid one hour) comes from `gh api -X POST repos/<repo>/actions/runners/registration-token`;
# that needs `gh` signed in inside WSL. If gh is only on Windows, get the token there and pass it; in PowerShell, so
# that it stops when gh fails (a failed gh leaves no token, and the registration would then fail with 401):
#   $t = gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token -q .token; if ($LASTEXITCODE -ne 0 -or -not $t) { "no token: run again" } else { wsl -d Ubuntu -e env RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label> RUNNER_TOKEN=$t bash <path>/install-wsl.sh }
# A token that is given (RUNNER_TOKEN set, even empty, or an argument) is checked before anything is downloaded.
# K453: it also keeps WSL itself up (WSL shuts the machine down when no Windows process holds it, and the runner dies with it):
# a Windows scheduled task "WSL keepalive <distro>" (at logon, no console window via conhost --headless) runs `wsl -d <distro> -- sleep infinity`; `--keepalive` does only that, `--remove-keepalive` deletes it, created through
# interop (schtasks.exe) and started at once. KEEPALIVE=0 skips it. Without interop it says so and carries on.
# It needs sudo -n, curl, tar and systemd in the WSL machine. It never
# prints the token. Exit codes: 0 the service is active and the runner is online (or --check found it so), 1 it is not,
# 2 bad usage or a missing tool.
set -euo pipefail

REPO="${RUNNER_REPO:?set RUNNER_REPO=<owner>/<repo>}"
LABEL="${RUNNER_LABEL:?set RUNNER_LABEL=<label>}"
DIR="${RUNNER_DIR:-$HOME/actions-runner-$LABEL}"
NAME="${RUNNER_NAME:-$LABEL-wsl}"
TOKEN="${RUNNER_TOKEN:-}"
GIVEN="${RUNNER_TOKEN+1}"
CHECK_ONLY=0
REMOVE=0
KA_ONLY=0

usage() { echo "usage: install-wsl.sh [--check] [--token <registration token> | <registration token>]" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --remove-keepalive) REMOVE=1 ;;
    --keepalive) KA_ONLY=1 ;;
    --token) shift; [ $# -gt 0 ] || usage; TOKEN="$1"; GIVEN=1 ;;
    -h|--help) usage ;;
    -*) usage ;;
    *) TOKEN="$1"; GIVEN=1 ;;
  esac
  shift
done

say() { printf '[install-wsl] %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { say "missing tool: $1 ($2)"; exit 2; }; }

# --- the token: checked before anything is downloaded or registered -----------------------------------------------------
check_token() {
  TOKEN="${TOKEN#"${TOKEN%%[![:space:]]*}"}"; TOKEN="${TOKEN%"${TOKEN##*[![:space:]]}"}"
  [[ "$TOKEN" =~ ^[A-Za-z0-9]{20,}$ ]] && return 0
  say "the registration token is missing or malformed: \`gh api -X POST repos/$REPO/actions/runners/registration-token\` probably failed (for example with a Server Error, HTTP 500): run it again and pass the new token"
  exit 2
}
get_token() {
  if [ -z "$GIVEN" ] && command -v gh >/dev/null 2>&1; then
    TOKEN=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token 2>/dev/null || true)
    GIVEN=$TOKEN
  fi
  if [ -z "$GIVEN" ]; then
    say "no registration token: sign gh in inside WSL (gh auth login) or pass the token from Windows (see the top of this script)"
    exit 2
  fi
  check_token
}
if [ "$CHECK_ONLY" = 0 ] && [ "$REMOVE" = 0 ] && [ "$KA_ONLY" = 0 ] && [ ! -f "$DIR/.runner" ]; then get_token; fi

[ "$REMOVE$KA_ONLY" != 00 ] || need curl "sudo apt-get install -y curl"
[ "$REMOVE$KA_ONLY" != 00 ] || need tar "sudo apt-get install -y tar"
[ "$REMOVE$KA_ONLY" != 00 ] || need systemctl "WSL needs systemd: add [boot] systemd=true to /etc/wsl.conf, then run wsl --shutdown in PowerShell"

# --- gate prerequisites: set RUNNER_WANT_PYMUPDF=1 when a build step renders PDFs with PyMuPDF -------------------------
if [ "${RUNNER_WANT_PYMUPDF:-0}" = 1 ] && ! python3 -c 'import pymupdf' >/dev/null 2>&1; then
  if [ "$CHECK_ONLY" = 1 ]; then
    say "missing: PyMuPDF (python3 -m pip install --user --break-system-packages pymupdf)"
  else
    say "installing PyMuPDF"
    python3 -m pip install --user --break-system-packages -q pymupdf || sudo -n apt-get install -y python3-fitz || say "could not install PyMuPDF"
  fi
fi

# --- the service and the runner's status ------------------------------------------------------------------------------
service_unit() { systemctl list-units --all --plain --no-legend 'actions.runner.*' 2>/dev/null | awk '{print $1}' | grep -F -- ".$NAME.service" | head -n 1 || true; }

# Prints "online" / "offline" / "unknown" for the runner named $NAME, using gh (WSL) when it is signed in.
runner_status() {
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    local s
    s=$(gh api "repos/$REPO/actions/runners" --jq ".runners[] | select(.name==\"$NAME\") | .status" 2>/dev/null || true)
    echo "${s:-unknown}"
  else
    echo "unknown"
  fi
}

verify() {
  local unit active status tries=0
  unit=$(service_unit)
  if [ -z "$unit" ]; then say "no systemd service for runner $NAME found"; return 1; fi
  active=$(systemctl is-active "$unit" 2>/dev/null || true)
  say "service $unit: $active"
  [ "$active" = "active" ] || return 1
  # the runner needs a few seconds to connect to GitHub
  while :; do
    status=$(runner_status)
    [ "$status" = "online" ] && break
    [ "$status" = "unknown" ] && break
    tries=$((tries + 1)); [ $tries -ge 12 ] && break
    sleep 5
  done
  case "$status" in
    online) say "runner $NAME is online (label $LABEL) at https://github.com/$REPO/settings/actions/runners" ;;
    unknown) say "service is active; gh is not signed in inside WSL, so check https://github.com/$REPO/settings/actions/runners (the runner $NAME should be Idle)"; return 0 ;;
    *) say "runner $NAME reports '$status' on GitHub"; return 1 ;;
  esac
}

keepalive() {
  [ "${KEEPALIVE:-1}" = 0 ] && return 0
  local distro="${WSL_DISTRO_NAME:-Ubuntu}" task
  task="WSL keepalive $distro"
  if ! command -v schtasks.exe >/dev/null 2>&1; then
    say "no Windows interop (schtasks.exe): WSL may shut down when idle; run on Windows: wsl -d $distro -- sleep infinity, hidden, at logon"
    return 0
  fi
  if [ "$REMOVE" = 1 ]; then
    schtasks.exe /Delete /F /TN "$task" >/dev/null 2>&1 && say "keepalive task \"$task\" removed (stop its sleep with: pkill -f 'sleep infinity')" || say "no keepalive task \"$task\" to remove"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    schtasks.exe /Query /TN "$task" >/dev/null 2>&1 && say "keepalive task \"$task\" exists" || say "no keepalive task \"$task\": WSL may shut down when idle (run install-wsl.sh again)"
    return 0
  fi
  # conhost --headless: no console window; /F replaces the task, so a re-run keeps one task
  if schtasks.exe /Create /F /SC ONLOGON /RL LIMITED /TN "$task" /TR "conhost.exe --headless wsl.exe -d $distro -- sleep infinity" >/dev/null 2>&1; then
    if pgrep -f 'sleep infinity' >/dev/null 2>&1; then say "keepalive task \"$task\" installed; its sleep is already running"
    else schtasks.exe /Run /TN "$task" >/dev/null 2>&1 || true; say "keepalive task \"$task\" installed and started (keeps WSL up while idle)"; fi
  else
    say "could not create the keepalive task \"$task\": WSL may shut down when idle"
  fi
}

if [ "$REMOVE" = 1 ] || [ "$KA_ONLY" = 1 ]; then keepalive; exit 0; fi
if [ "$CHECK_ONLY" = 1 ]; then keepalive; verify && exit 0 || exit 1; fi

# --- sudo, the token ----------------------------------------------------------------------------------------------------
sudo -n true 2>/dev/null || { say "sudo -n does not work in this WSL machine (the owner allowed it for services); run: sudo true  once, or fix /etc/sudoers.d"; exit 2; }

# --- download the runner ------------------------------------------------------------------------------------------------
mkdir -p "$DIR"
cd "$DIR"
if [ ! -x ./config.sh ]; then
  case "$(uname -m)" in
    x86_64) ARCH=x64 ;;
    aarch64|arm64) ARCH=arm64 ;;
    *) say "unsupported machine $(uname -m)"; exit 2 ;;
  esac
  say "looking up the latest runner release"
  VERSION=$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | grep -oE '"tag_name": *"v[0-9.]+"' | grep -oE '[0-9][0-9.]+')
  [ -n "$VERSION" ] || { say "could not read the latest runner version from api.github.com"; exit 2; }
  say "downloading actions-runner-linux-$ARCH-$VERSION"
  curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-$ARCH-$VERSION.tar.gz"
  tar xzf runner.tar.gz
  rm -f runner.tar.gz
fi
# the runner's own dependency installer (needs root; skipped quietly when it has nothing to do)
sudo -n ./bin/installdependencies.sh >/dev/null 2>&1 || say "installdependencies.sh did not run (continuing; the runner will say if something is missing)"

# --- register ---------------------------------------------------------------------------------------------------------
if [ ! -f .runner ]; then
  say "registering $NAME with label $LABEL for $REPO"
  ./config.sh --unattended --url "https://github.com/$REPO" --token "$TOKEN" --name "$NAME" --labels "$LABEL" --work _work --replace || {
    rm -f .runner
    say "registration failed: the token was rejected or has expired (it is valid one hour): fetch a new one and run this again"
    exit 1
  }
else
  say "already registered (.runner exists in $DIR)"
fi

# --- the systemd service ----------------------------------------------------------------------------------------------
if [ -z "$(service_unit)" ]; then
  say "installing the systemd service"
  sudo -n ./svc.sh install "$(id -un)"
fi
sudo -n ./svc.sh start >/dev/null 2>&1 || true
sleep 3
keepalive
verify && { say "done. The runner takes the jobs of ci.yml and full-gate.yml (runs-on: [self-hosted, $LABEL])."; exit 0; }
say "the runner is not healthy yet: run  sudo ./svc.sh status  in $DIR, and send the last lines to the architect"
exit 1
