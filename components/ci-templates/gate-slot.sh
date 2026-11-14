#!/usr/bin/env bash
# Run one heavy gate (npm run check, npm run test:e2e, a simulation) in one of the machine's gate slots, so that at most
# GATE_SLOTS (default 2) heavy gates run at once on a shared machine. The slots are lock
# files in GATE_DIR, so the limit holds across every repository on the machine that uses the same GATE_DIR. Waits for a free
# slot, then runs the command in the current directory and exits with its code.
# Usage (from any worktree of this repository): bash tools/architect/gate-slot.sh npm run check
D=${GATE_DIR:-/tmp/game-gates}
N=${GATE_SLOTS:-2}
mkdir -p "$D"
waited=0
while :; do
  for i in $(seq 1 "$N"); do
    flock -n -E 200 "$D/slot$i.lock" "$@"; rc=$?
    if [ "$rc" -ne 200 ]; then exit "$rc"; fi
  done
  [ $waited -eq 0 ] && echo "[gate-slot] all $N slots busy; waiting for one: $*" >&2
  waited=1
  sleep 15
done
