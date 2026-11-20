#!/usr/bin/env bash
# ACTIONS_RUNNER_HOOK_JOB_STARTED (K399): wait for a high slot of the heavy queue for this job; a watcher heartbeats while the
# job's Runner.Worker lives and releases when it ends. No node or no queue: hold the flock fallback lock until the job ends.
# A job named in HEAVY_LIGHT_JOBS (default `changes docs`, K478) takes no slot and no lock. Steps inside the job pass through (HEAVY_HELD=1). Never fails the job.
H=$(dirname "$(readlink -f "$0")")
p=$$; while [ "${p:-0}" -gt 1 ] && [ "$(cat /proc/$p/comm 2>/dev/null)" != Runner.Worker ]; do p=$(awk '{print $4}' /proc/$p/stat 2>/dev/null); done
[ "${p:-0}" -gt 1 ] || p=$PPID
echo "[heavy] job ${GITHUB_JOB:-?}" >&2
for j in ${HEAVY_LIGHT_JOBS-changes docs}; do [ "$j" = "${GITHUB_JOB:-}" ] && { [ -n "${GITHUB_ENV:-}" ] && echo HEAVY_HELD=1 >> "$GITHUB_ENV"; exit 0; }; done
held() { if [ -n "${GITHUB_ENV:-}" ]; then echo HEAVY_HELD=1 >> "$GITHUB_ENV"; w=$(node "$H/heavy.mjs" workers 2>/dev/null); [ -n "$w" ] && echo "HEAVY_WORKERS=$w" >> "$GITHUB_ENV"; fi; exit 0; }
if ! command -v node >/dev/null; then echo "[heavy] node not found: using the flock fallback" >&2
elif id=$(node "$H/heavy.mjs" hold --priority high --pid "$p" --label "${RUNNER_NAME:-runner} ${GITHUB_REPOSITORY:-} ${GITHUB_WORKFLOW:-}"); then
  mkdir -p /tmp/heavy-queue-runners && echo "$id" > "/tmp/heavy-queue-runners/${RUNNER_NAME:-none}"
  held
else echo "[heavy] queue acquire failed: using the flock fallback" >&2; fi
command -v flock >/dev/null || { echo "[heavy] no flock either: job runs without a slot" >&2; exit 0; }
r=$(mktemp -u)
setsid flock "${HEAVY_LOCK:-/tmp/heavy-queue.lock}" sh -c "touch $r; while kill -0 $p 2>/dev/null; do sleep 5; done" </dev/null >/dev/null 2>&1 &
f=$!
echo "[heavy] waiting for ${HEAVY_LOCK:-/tmp/heavy-queue.lock}" >&2
while [ ! -e "$r" ] && kill -0 "$f" 2>/dev/null; do sleep 1; done
rm -f "$r"
held
