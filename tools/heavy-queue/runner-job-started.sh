#!/usr/bin/env bash
# ACTIONS_RUNNER_HOOK_JOB_STARTED (K399): wait for a high slot of the heavy queue for this job; a watcher heartbeats while the
# job's Runner.Worker lives and releases when it ends. Steps inside the job pass through (HEAVY_HELD=1). Never fails the job.
H=$(dirname "$(readlink -f "$0")")
p=$$; while [ "${p:-0}" -gt 1 ] && [ "$(cat /proc/$p/comm 2>/dev/null)" != Runner.Worker ]; do p=$(awk '{print $4}' /proc/$p/stat 2>/dev/null); done
[ "${p:-0}" -gt 1 ] || p=$PPID
id=$(node "$H/heavy.mjs" hold --priority high --pid "$p" --label "${RUNNER_NAME:-runner} ${GITHUB_REPOSITORY:-} ${GITHUB_WORKFLOW:-}") || exit 0
mkdir -p /tmp/heavy-queue-runners && echo "$id" > "/tmp/heavy-queue-runners/${RUNNER_NAME:-none}"
[ -n "${GITHUB_ENV:-}" ] && echo HEAVY_HELD=1 >> "$GITHUB_ENV"
exit 0
