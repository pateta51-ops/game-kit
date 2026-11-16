"""The numbers of a gate log for the merge message: the tested merge and what vitest, tsc, eslint, Playwright and the
kit's tools (local-ci.sh, check-runner, skip-reporter) count. A game's own lines are extra regex arguments.
Usage: python3 tools/architect/gate-numbers.py <saved job log, or a local-ci.sh log> [extra regex ...]"""
import re
import sys

txt = open(sys.argv[1], encoding='utf-8').read()
txt = re.sub(r'\\u001b\[[0-9;]*m|\x1b\[[0-9;]*m', '', txt)
PATTERN = '|'.join([r'Tested |^tested |Test Files +\d+|^\S*\s*Tests +\d+ |Tests: \d+ ran|\d+ passed \(\d|\d+ failed|error TS\d+'
                    r'|Found \d+ errors?|\d+ problems? \(|exit=\d+|^RESULT |wall \d.* checks added up'] + sys.argv[2:])
for line in txt.splitlines():
    if re.search(PATTERN, line):
        # a GitHub log line starts with a 28-character timestamp and a space
        print(line[29:220] if re.match(r'^\d{4}-\d\d-\d\dT', line) else line[:200])
