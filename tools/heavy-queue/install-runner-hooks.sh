#!/usr/bin/env bash
# K399: for every ~/actions-runner-*/ add the heavy-queue job hooks (the installed copy, HEAVY_HOME, default
# ~/.local/share/heavy-queue) to its .env (idempotent) and restart its systemd unit when the runner is idle (no Runner.Worker).
# A busy runner keeps running; run this again later to restart it.
H=${HEAVY_HOME:-$HOME/.local/share/heavy-queue}
[ -x "$H/runner-job-started.sh" ] || { echo "no installed heavy-queue in $H: run install-wsl.sh first" >&2; exit 1; }
SYSTEMCTL=${SYSTEMCTL:-sudo systemctl}
for d in "$HOME"/actions-runner-*/; do
  [ -d "$d" ] || continue
  e=$d.env; touch "$e"; changed=0
  [ -s "$e" ] && [ -n "$(tail -c1 "$e")" ] && echo >> "$e"
  for kv in "ACTIONS_RUNNER_HOOK_JOB_STARTED=$H/runner-job-started.sh" "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=$H/runner-job-completed.sh"; do
    grep -qxF "$kv" "$e" && continue
    sed -i "/^${kv%%=*}=/d" "$e"; echo "$kv" >> "$e"; changed=1
  done
  n=$(basename "$d"); unit=$(cat "$d.service" 2>/dev/null)
  [ $changed = 0 ] && [ -n "$unit" ] && t=$($SYSTEMCTL show -p ActiveEnterTimestamp --value "$unit" 2>/dev/null) && [ -n "$t" ] && [ "$(date -d "$t" +%s)" -lt "$(stat -c %Y "$e")" ] && changed=1
  if [ $changed = 0 ]; then echo "$n: hooks already set"
  elif [ -z "$unit" ]; then echo "$n: hooks set; no .service file, restart it by hand"
  elif pgrep -f "${d}bin/Runner.Worker" >/dev/null; then echo "$n: hooks set; busy, run this again to restart $unit"
  else $SYSTEMCTL restart "$unit" && echo "$n: hooks set, $unit restarted"; fi
done
