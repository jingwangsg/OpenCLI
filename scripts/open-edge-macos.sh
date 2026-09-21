#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ ! -f "$repo_dir/extension/dist/background.js" ]; then
  echo 'Build the Browser Bridge first: npm --prefix extension ci && npm --prefix extension run build' >&2
  exit 1
fi

# Edge only applies extension flags when starting a browser process. A dedicated
# user-data directory keeps this independent of an already-running personal Edge.
exec open -na 'Microsoft Edge' --args \
  --user-data-dir="$HOME/.opencli/edge-profile" \
  --load-extension="$repo_dir/extension" \
  --no-first-run --no-default-browser-check "$@"
