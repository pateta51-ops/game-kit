#!/usr/bin/env bash
# ACTIONS_RUNNER_HOOK_JOB_COMPLETED (K399): release this runner's heavy-queue slot. Never fails the job.
H=$(dirname "$(readlink -f "$0")")
f=/tmp/heavy-queue-runners/${RUNNER_NAME:-none}
[ -f "$f" ] && node "$H/heavy.mjs" release "$(cat "$f")" && rm -f "$f"
exit 0
