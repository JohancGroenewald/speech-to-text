# TalkToMe Rollout

Repository rollout target: TalkToMe `0.0.94` from the Huis extension feed. Run
the status check below to verify current feed and host state.

## Update TalkToMe

Install or update TalkToMe from the local extension feed:

```text
http://vscode.huis
```

The configured rollout check expects:

```text
JohancGroenewald.talk-to-me 0.0.94
```

This workspace includes `.vscode/extensions.private.json`, so VS Code clients with `garmin.private-extension-manager` installed should discover the Huis feed when the workspace opens.

## Configure Local API Mode

Set these TalkToMe settings on the client machine or workspace:

```json
{
  "talkToMe.transcriptionProvider": "localApi",
  "talkToMe.transcriptionEndpoint": "https://speech-to-text.huis/v1/transcriptions"
}
```

If the VS Code extension host does not trust the Huis root CA, also set a PEM file path that exists on that client machine:

```json
{
  "talkToMe.transcriptionCaFile": "/etc/ssl/certs/huis-root-ca.pem"
}
```

The Linux path above works only for Linux clients such as `vscode.huis`. On Windows or macOS, use the path where the Huis root CA PEM is stored on that client. Keep OS-specific CA paths in user or machine settings, not in the shared workspace.

This repository includes `.vscode/settings.json` with the shared `localApi`
provider and endpoint values already set. A separate VS Code workspace file or
user setting can override them, so inspect the effective settings when
troubleshooting.

Opening this workspace with TalkToMe `0.0.94` should therefore select `localApi`
automatically. TalkToMe no longer requires an OpenAI key unless
`talkToMe.transcriptionProvider` is explicitly set to `openai`. The local API
token still has to be stored through SecretStorage.

## Store the Client Token

Run this command from VS Code:

```text
TalkToMe: Set Local Transcription API Key
```

Paste a speech-to-text client token. TalkToMe stores it in VS Code SecretStorage, not in settings JSON.

If the legacy initial-token handoff file is still retained, it is stored at:

```text
/root/speech-to-text-initial-client-token.txt
```

Do not paste client tokens into Git, docs, shell history, or chat logs.

## Smoke Test

Before recording, confirm that `GET /readyz` returns `ok: true`. Then record a
short phrase in TalkToMe after switching to `localApi`. The service should emit
the following metadata across its audit events:

```text
method: POST
route: /v1/transcriptions
status_code: 200
provider: openai
model: gpt-4o-transcribe
transcript_logged: false
```

If TalkToMe reports a TLS issuer error, confirm `talkToMe.transcriptionCaFile` points to a readable Huis root CA PEM file on the client.

To watch the server while testing:

```bash
sudo /opt/speech-to-text/scripts/watch-transcriptions.sh "10 minutes ago"
```

For a one-shot status check before or after a client recording:

```bash
cd /opt/speech-to-text
npm run rollout:status -- "10 minutes ago"
```

The status check verifies its configured TalkToMe version target and reports
only metadata such as request IDs, client IDs, duration, model, and
`transcript_logged`; it does not print tokens or transcript text.
