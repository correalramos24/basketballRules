#!/usr/bin/env bash
#
# Local development helper for the Basketball Rules site.
# No Docker required.
#
# Usage: development/run.sh <command>
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4321}"

usage() {
  cat <<EOF
Basketball Rules — local development

Usage: development/run.sh <command>

Commands:
  install            Install dependencies (npm install)
  dev                Start the dev server at http://localhost:${PORT} (default)
  host               Start the dev server exposed on the LAN
  stop               Stop the background dev server
  status             Show dev server status
  logs               Stream dev server logs
  build              Build the static site into dist/
  preview            Preview the production build locally
  check              Type-check the project
  generate           Regenerate Lorem Ipsum articles from the parsed rulebook
  parse              Re-parse the rulebook PDF into scripts/rulebook-2026.json
  clean              Remove build output (.astro, dist)

Examples:
  development/run.sh install
  development/run.sh dev
  PORT=8080 development/run.sh dev
EOF
}

need_install() {
  if [ ! -d node_modules ]; then
    echo "Dependencies not installed. Running 'npm install'..."
    npm install
  fi
}

cmd="${1:-dev}"

case "$cmd" in
  install)
    npm install
    ;;
  dev)
    need_install
    npm run dev -- --port "$PORT"
    ;;
  host)
    need_install
    npm run dev:host -- --port "$PORT"
    ;;
  stop)
    npm run dev:stop
    ;;
  status)
    npm run dev:status
    ;;
  logs)
    npm run dev:logs
    ;;
  build)
    need_install
    npm run build
    ;;
  preview)
    need_install
    npm run preview
    ;;
  check)
    need_install
    npx astro check
    ;;
  generate)
    node scripts/generate_articles.mjs
    ;;
  parse)
    pdftotext docs/regles_fcbq_2026.pdf /tmp/regles.txt
    python3 scripts/parse_rulebook.py /tmp/regles.txt scripts/rulebook-2026.json
    ;;
  clean)
    rm -rf .astro dist
    echo "Removed .astro and dist"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo
    usage
    exit 1
    ;;
esac
