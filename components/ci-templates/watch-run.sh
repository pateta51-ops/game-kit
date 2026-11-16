#!/usr/bin/env bash
# Wait for a GitHub Actions run of this repository to finish (CI or the Full gate), then print its conclusion, each job
# and each failed step. Run it as one background command so the session is woken when it exits; never poll by hand.
# A private repository needs a token: GH_TOKEN or GITHUB_TOKEN when set, else `gh auth token`.
# Usage: bash tools/architect/watch-run.sh <run-id>   (WATCH_TIMEOUT seconds, default 3600; WATCH_INTERVAL, default 30)
# Exit: 0 success, 1 any other conclusion, 2 run not found, 3 timed out, 4 the API answered with an error.
# A network failure or an unreadable answer is retried quietly until the timeout.
# As pulled (the slug not filled in): REPO_SLUG, else the owner/repo of this checkout's origin.
R=$1; S='{{REPO_SLUG}}'
case "$S" in '{{'*) S=${REPO_SLUG:-$(git -C "$(dirname "$0")" config --get remote.origin.url | sed -E 's#(\.git)?/*$##; s#^.*[:/]([^/]+/[^/]+)$#\1#')};; esac
API=${WATCH_API:-https://api.github.com}/repos/$S/actions/runs/$R
TOKEN=${GH_TOKEN:-${GITHUB_TOKEN:-$(gh auth token 2>/dev/null)}}
get() { if [ -n "$TOKEN" ]; then curl -s -H "Authorization: Bearer $TOKEN" "$1"; else curl -s "$1"; fi; }
END=$(( $(date +%s) + ${WATCH_TIMEOUT:-3600} ))
while :; do
  s=$(get "$API" | python3 -c "
import json,sys
try: d=json.load(sys.stdin); d.get
except Exception: sys.exit(0)
print(d.get('status'), d.get('conclusion')) if d.get('status') else print('error', d.get('message'))")
  case "$s" in
    completed*) break;;
    "error Not Found") echo "run $R: not found (no token?)"; exit 2;;
    error*) echo "run $R: API error: ${s#error }"; exit 4;;
  esac
  [ "$(date +%s)" -ge "$END" ] && { echo "run $R: timed out, still ${s:-unknown}"; exit 3; }
  sleep "${WATCH_INTERVAL:-30}"
done
echo "run $R: $s"
get "$API/jobs?per_page=100" | python3 -c "
import json,sys
try: d=json.load(sys.stdin); d.get
except Exception: d={}
if 'jobs' not in d: print('jobs: not read', d.get('message',''))
for j in d.get('jobs') or []:
    print(j.get('name'), j.get('conclusion'), j.get('runner_name'), j.get('started_at'), j.get('completed_at'))
    for st in j.get('steps') or []:
        if st.get('conclusion') not in ('success','skipped'): print('   step', st.get('number'), st.get('name'), st.get('conclusion'))"
[ "$s" = "completed success" ]
