export NODE_PATH=${NODE_PATH:-$HOME/codex/base/node_modules}
cd "$(dirname "$0")/../.." && node tuners/card-hand-e2e/hit-area.mjs
