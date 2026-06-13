# TalkToMe Rollout

Status: TalkToMe `0.0.88` is published to the Huis extension feed.

## Update TalkToMe

Install or update TalkToMe from the local extension feed:

```text
http://vscode.huis
```

The feed should show:

```text
JohancGroenewald.talk-to-me 0.0.88
```

## Configure Local API Mode

Set these TalkToMe settings on the client machine or workspace:

```json
{
  "talkToMe.transcriptionProvider": "localApi",
  "talkToMe.transcriptionEndpoint": "https://speech-to-text.huis/v1/transcriptions"
}
```

If the VS Code extension host does not trust the Huis root CA, also set a PEM file path that exists on the client machine:

```json
{
  "talkToMe.transcriptionCaFile": "/etc/ssl/certs/huis-root-ca.pem"
}
```

The Linux path above works on `vscode.huis`. On Windows or macOS, use the path where the Huis root CA PEM is stored on that client.

## Store The Client Token

Run this command from VS Code:

```text
TalkToMe: Set Local Transcription API Key
```

Paste a speech-to-text client token. TalkToMe stores it in VS Code SecretStorage, not in settings JSON.

The initial token generated during bootstrap is stored on the server at:

```text
/root/speech-to-text-initial-client-token.txt
```

Do not paste client tokens into Git, docs, shell history, or chat logs.

## Smoke Test

Record a short phrase in TalkToMe after switching to `localApi`. The service should log a `POST /v1/transcriptions` request with:

```text
statusCode: 200
provider: openai
model: gpt-4o-transcribe
transcript_logged: false
```

If TalkToMe reports a TLS issuer error, confirm `talkToMe.transcriptionCaFile` points to a readable Huis root CA PEM file on the client.

To watch the server while testing:

```bash
sudo /opt/speech-to-text/scripts/watch-transcriptions.sh "10 minutes ago"
```
