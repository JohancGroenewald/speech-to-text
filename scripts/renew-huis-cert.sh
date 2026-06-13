#!/usr/bin/env bash
set -euo pipefail

step ca certificate speech-to-text.huis \
  /etc/ssl/huis/speech-to-text.huis.crt \
  /etc/ssl/huis/speech-to-text.huis.key \
  --provisioner acme \
  --ca-url https://caserver.huis:9000 \
  --root /usr/local/share/ca-certificates/huis-root-ca.crt \
  --webroot /var/www/html \
  --san speech-to-text.huis \
  --force

chmod 0644 /etc/ssl/huis/speech-to-text.huis.crt
chmod 0600 /etc/ssl/huis/speech-to-text.huis.key
systemctl reload nginx
