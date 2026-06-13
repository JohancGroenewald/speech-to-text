#!/usr/bin/env bash
set -euo pipefail

nginx -t
systemd-analyze verify deploy/systemd/speech-to-text.service

echo "Parsed nginx and systemd configs."
