#!/usr/bin/env bash

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

FETCH_METHOD="${RAVEN_FETCH_METHOD:-auto}"
MAX_PAPERS="${RAVEN_MAX_PAPERS:-}"
LIST_DELAY="${RAVEN_LIST_DELAY:-1.0}"
HOST="${RAVEN_HOST:-127.0.0.1}"
PORT="${RAVEN_PORT:-5173}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fetch)
      FETCH_METHOD="${2:-auto}"
      shift 2
      ;;
    --max-papers)
      MAX_PAPERS="${2:-}"
      shift 2
      ;;
    --delay)
      LIST_DELAY="${2:-1.0}"
      shift 2
      ;;
    --host)
      HOST="${2:-127.0.0.1}"
      shift 2
      ;;
    --port)
      PORT="${2:-5173}"
      shift 2
      ;;
    *)
      shift 1
      ;;
  esac
done

mkdir -p "$DIR/logs"
LOG_FILE="$DIR/logs/raven_start_$(date +%Y%m%d).log"

log() {
  printf '%s\n' "$*" | tee -a "$LOG_FILE"
}

run_fetch_rss() {
  log "Fetching latest arXiv papers (rss)..."
  python fetch_arxiv.py 2>&1 | tee -a "$LOG_FILE"
  return "${PIPESTATUS[0]}"
}

run_fetch_list() {
  log "Fetching latest arXiv papers (list page)..."
  local args=()
  if [[ -n "$MAX_PAPERS" ]]; then
    args+=(--max-papers "$MAX_PAPERS")
  fi
  if [[ -n "$LIST_DELAY" ]]; then
    args+=(--delay "$LIST_DELAY")
  fi
  python fetch_arxiv_list.py "${args[@]}" 2>&1 | tee -a "$LOG_FILE"
  return "${PIPESTATUS[0]}"
}

case "$FETCH_METHOD" in
  list)
    run_fetch_list
    ;;
  rss)
    run_fetch_rss
    ;;
  auto|*)
    if [[ -f "$DIR/fetch_arxiv_list.py" ]]; then
      if ! run_fetch_list; then
        run_fetch_rss
      fi
    else
      run_fetch_rss
    fi
    ;;
esac

URL="http://${HOST}:${PORT}/"

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    log "Starting Vite dev server..."
    npm run dev -- --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 &
else
    log "Vite dev server is already running on port $PORT."
fi

for _ in {1..30}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

log "Opening RAVEN in your browser..."
open "$URL"
