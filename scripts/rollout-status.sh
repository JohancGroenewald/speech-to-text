#!/usr/bin/env bash
set -uo pipefail

service_url="${SPEECH_TO_TEXT_URL:-https://speech-to-text.huis}"
registry_url="${TALKTOME_REGISTRY_URL:-http://vscode.huis}"
talktome_package="${TALKTOME_PACKAGE:-talk-to-me}"
expected_talktome_version="${EXPECTED_TALKTOME_VERSION:-0.0.90}"
expected_model="${EXPECTED_MODEL:-gpt-4o-transcribe}"
since="${1:-10 minutes ago}"
failed=0

section() {
  printf '\n%s\n' "$1"
}

ok() {
  printf '[ok] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1"
  failed=1
}

json_value() {
  local json="$1"
  local field="$2"

  printf '%s' "$json" | jq -r "${field} // empty" 2>/dev/null || true
}

settings_value() {
  local key="$1"

  node -e '
    const fs = require("node:fs");
    const settings = JSON.parse(fs.readFileSync(".vscode/settings.json", "utf8"));
    process.stdout.write(settings[process.argv[1]] || "");
  ' "$key" 2>/dev/null || true
}

private_registry_name() {
  node -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync(".vscode/extensions.private.json", "utf8"));
    const registry = process.argv[1];
    const found = (config.registries || []).find((entry) => entry.registry === registry);
    process.stdout.write(found ? (found.name || found.registry) : "");
  ' "$registry_url" 2>/dev/null || true
}

has_talktome_recommendation() {
  node -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync(".vscode/extensions.private.json", "utf8"));
    const recommendations = config.recommendations || [];
    process.stdout.write(recommendations.includes("johancgroenewald.talk-to-me") ? "yes" : "");
  ' 2>/dev/null || true
}

section "Speech-to-text rollout status"
printf 'Service URL: %s\n' "$service_url"
printf 'TalkToMe registry: %s\n' "$registry_url"

section "Service"
health_json="$(curl -fsS "${service_url}/healthz" 2>/dev/null || true)"
if [ -n "$health_json" ] && [ "$(json_value "$health_json" ".ok")" = "true" ]; then
  ok "healthz is green"
else
  fail "healthz did not return ok:true"
fi

ready_json="$(curl -fsS "${service_url}/readyz" 2>/dev/null || true)"
ready_model="$(json_value "$ready_json" ".model")"
ready_provider="$(json_value "$ready_json" ".provider")"
if [ -n "$ready_json" ] && [ "$(json_value "$ready_json" ".ok")" = "true" ]; then
  ok "readyz is green (${ready_provider}/${ready_model})"
else
  fail "readyz did not return ok:true"
fi

if [ "$ready_model" = "$expected_model" ]; then
  ok "model is ${expected_model}"
else
  fail "model is '${ready_model:-unknown}', expected ${expected_model}"
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet speech-to-text; then
    ok "systemd service speech-to-text is active"
  else
    fail "systemd service speech-to-text is not active"
  fi

  if systemctl is-active --quiet nginx; then
    ok "nginx is active"
  else
    fail "nginx is not active"
  fi
else
  warn "systemctl is unavailable; skipped service process checks"
fi

section "TalkToMe workspace"
if [ -f ".vscode/settings.json" ]; then
  provider="$(settings_value "talkToMe.transcriptionProvider")"
  endpoint="$(settings_value "talkToMe.transcriptionEndpoint")"
  ca_file="$(settings_value "talkToMe.transcriptionCaFile")"

  if [ "$provider" = "localApi" ]; then
    ok "workspace provider is localApi"
  else
    fail "workspace provider is '${provider:-unset}', expected localApi"
  fi

  if [ "$endpoint" = "${service_url}/v1/transcriptions" ]; then
    ok "workspace endpoint targets ${service_url}/v1/transcriptions"
  else
    fail "workspace endpoint is '${endpoint:-unset}'"
  fi

  if [ -n "$ca_file" ]; then
    ok "workspace CA file is configured (${ca_file})"
  else
    warn "workspace CA file is not configured"
  fi
else
  fail ".vscode/settings.json is missing"
fi

if [ -f ".vscode/extensions.private.json" ]; then
  registry_name="$(private_registry_name)"
  if [ -n "$registry_name" ]; then
    ok "workspace private extension registry includes ${registry_url} (${registry_name})"
  else
    fail "workspace private extension registry does not include ${registry_url}"
  fi

  if [ "$(has_talktome_recommendation)" = "yes" ]; then
    ok "workspace recommends johancgroenewald.talk-to-me"
  else
    fail "workspace does not recommend johancgroenewald.talk-to-me"
  fi
else
  fail ".vscode/extensions.private.json is missing"
fi

section "TalkToMe feed"
if command -v npm >/dev/null 2>&1; then
  feed_version="$(
    timeout 15 npm view "$talktome_package" version --registry "$registry_url" 2>/dev/null \
      | tail -n 1 || true
  )"
  if [ "$feed_version" = "$expected_talktome_version" ]; then
    ok "feed publishes TalkToMe ${expected_talktome_version}"
  else
    fail "feed publishes '${feed_version:-unknown}', expected ${expected_talktome_version}"
  fi
else
  warn "npm is unavailable; skipped TalkToMe feed version check"
fi

section "Recent transcription completions"
if command -v journalctl >/dev/null 2>&1; then
  log_lines="$(
    journalctl -u speech-to-text --since "$since" --output cat --no-pager 2>/dev/null \
      | grep '"msg":"transcription complete"' \
      | tail -n 5 || true
  )"

  if [ -z "$log_lines" ]; then
    warn "no transcription completions found since '${since}'"
  elif command -v jq >/dev/null 2>&1; then
    while IFS= read -r line; do
      printf '%s\n' "$line" | jq -r '
        "[ok] request=\(.request_id // .reqId) client=\(.client_id // "unknown") duration=\(.duration_ms // "unknown")ms model=\(.model // "unknown") transcript_logged=\(if has("transcript_logged") then .transcript_logged else "unknown" end)"
      '
    done <<< "$log_lines"
  else
    printf '%s\n' "$log_lines"
  fi
else
  warn "journalctl is unavailable; skipped transcription log summary"
fi

section "Result"
if [ "$failed" -eq 0 ]; then
  ok "server-side rollout checks passed"
else
  fail "one or more server-side rollout checks failed"
fi

exit "$failed"
