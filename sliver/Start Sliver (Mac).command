#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js isn't installed yet."
  echo "  Get the LTS version from https://nodejs.org , install it, then open this file again."
  echo ""
  open https://nodejs.org
  read -n 1 -s -r -p "  Press any key to close..."
  exit 1
fi
(sleep 2; open http://localhost:3000) &
node server/index.js
