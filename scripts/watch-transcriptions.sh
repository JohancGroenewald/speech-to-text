#!/usr/bin/env bash
set -euo pipefail

since="${1:-now}"

echo "Watching speech-to-text transcription logs since: ${since}" >&2
echo "Press Ctrl+C to stop." >&2

journalctl -u speech-to-text --since "${since}" --follow --output cat \
  | grep --line-buffered -E '"msg":"(client request received|client audio received|client response sent|transcription complete)"'
