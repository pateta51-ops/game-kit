#!/usr/bin/env bash
# Local CI, the fallback: ci.yml and the Full gate in a Linux machine (the architect's container, or
# the WSL Ubuntu machine, never the Windows PC itself) while the owner's runner is off. Builds the merge of the PR head into origin/main (what GitHub's pull_request event tests) in a fresh worktree with
# a clean `npm ci`, then runs ci.yml's job (npm run check) and the Full gate's e2e suite (the fuzz and tutorial steps join with the batches that create them). Writes <out>/<name>.log and
# <out>/<name>.summary; the summary ends with RESULT GREEN or RED, which the architect records in the PR.
#
# Usage: bash tools/architect/local-ci.sh <pr-number | branch> <expected-head-sha-40> [e2e-port]
#   a PR number fetches pull/<n>/head; a branch name fetches origin/<branch> (a batch session's run before its PR opens).
# Linux, Node 22; where the machine ships its own Chromium (the architect's container: /opt/pw-browsers/chromium; never
# `playwright install` there) PW_CHROMIUM_PATH points at it. Heavy steps run
# in a gate slot (gate-slot.sh), and one local CI run at a time holds the lock (flock).
set -u
REF=$1; SHA=$2; PORT=${3:-47$((RANDOM % 90 + 10))}
REPO=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
OUT=${LOCAL_CI_DIR:-/tmp/$(basename {{REPO_SLUG}})-ci}
GS="bash $REPO/tools/architect/gate-slot.sh"
CHROMIUM=${PW_CHROMIUM_PATH:-}
if [ -z "$CHROMIUM" ]; then
  for c in /opt/pw-browsers/chromium /opt/pw-browsers/chromium-*/chrome-linux*/chrome; do
    if [ -x "$c" ] && [ -f "$c" ]; then CHROMIUM=$c; break; fi
  done
fi
NAME=$(printf '%s' "$REF" | tr -c 'A-Za-z0-9.-' '-')
mkdir -p "$OUT"
W=$OUT/$NAME; LOG=$OUT/$NAME.log; SUM=$OUT/$NAME.summary
: > "$SUM"; : > "$LOG"
step() { local name=$1; shift; local t; t=$(date +%s); ( "$@" ) >> "$LOG" 2>&1; local rc=$?; echo "$name exit=$rc $(( $(date +%s)-t ))s" >> "$SUM"; return $rc; }
exec 9>"$OUT/.lock"; flock 9          # one local CI run at a time
cd "$REPO" || exit 2
if [[ "$REF" =~ ^[0-9]+$ ]]; then TRACK=refs/remotes/origin/pr/$REF; SPEC="pull/$REF/head:$TRACK"; LABEL="PR #$REF"
else TRACK=refs/remotes/origin/$REF; SPEC="$REF:$TRACK"; LABEL="branch $REF"; fi
git fetch -q origin "+refs/heads/main:refs/remotes/origin/main" "+$SPEC" 2>>"$LOG" || { echo "fetch failed" >> "$SUM"; echo "RESULT RED" >> "$SUM"; exit 2; }
HEAD_SHA=$(git rev-parse "$TRACK")
[ "$HEAD_SHA" = "$SHA" ] || { echo "head is $HEAD_SHA, expected $SHA" >> "$SUM"; echo "RESULT RED" >> "$SUM"; exit 3; }
git worktree remove --force "$W" 2>/dev/null; rm -rf "$W"
git worktree add -q --detach "$W" origin/main >> "$LOG" 2>&1 || { echo "RESULT RED" >> "$SUM"; exit 2; }
cd "$W" || exit 2
git -c user.name=local-ci -c user.email=local-ci@invalid merge -q --no-edit "$SHA" >> "$LOG" 2>&1 || { echo "merge conflict with origin/main" >> "$SUM"; echo "RESULT RED" >> "$SUM"; exit 4; }
echo "tested $(git rev-parse --short HEAD) = origin/main $(git rev-parse --short origin/main) + $LABEL head ${SHA:0:7}" >> "$SUM"
rc=0
step "npm-ci" npm ci --no-audit --no-fund || rc=1                 # ci.yml
step "check" $GS npm run check || rc=1                            # ci.yml and full-gate.yml
if [ -n "$CHROMIUM" ]; then                                       # full-gate.yml
  step "e2e" $GS env PW_CHROMIUM_PATH="$CHROMIUM" E2E_PORT="$PORT" npm run test:e2e || rc=1
else                                                              # a machine with Playwright's own browser (WSL runner)
  step "e2e" $GS env E2E_PORT="$PORT" npm run test:e2e || rc=1
fi
# the phone suite (WebKit) after the desktop one. Without WebKit it fails, unless PW_SKIP_WEBKIT=1
# (then SKIPPED, never GREEN for that step).
if [ "${PW_SKIP_WEBKIT:-0}" = 1 ]; then
  echo "e2e-phone SKIPPED (PW_SKIP_WEBKIT=1)" >> "$SUM"
elif ! ls -d "${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"/webkit-* >/dev/null 2>&1; then
  echo "e2e-phone exit=1 WebKit missing: npx playwright install webkit" >> "$SUM"; rc=1
else
  step "e2e-phone" $GS env E2E_PORT="$PORT" npm run test:e2e:phone || rc=1
fi
grep -E "Tests +[0-9]+ passed|[0-9]+ passed \(|traceability \(|repo-gate: |plancheck|sim(:smoke)?: " "$LOG" | tail -10 >> "$SUM"
echo "RESULT $([ $rc = 0 ] && echo GREEN || echo RED)" >> "$SUM"
cd "$REPO" && git worktree remove --force "$W" >> "$LOG" 2>&1
exit $rc
