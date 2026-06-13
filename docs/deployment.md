# Deployment

This service runs on `speech-to-text.huis` as a local LAN API behind nginx.

## Runtime Files

Secrets and mutable runtime state live outside the Git repository:

```text
/etc/speech-to-text/speech-to-text.env
/var/lib/speech-to-text/client-keys.json
/root/speech-to-text-admin-token.txt
/root/speech-to-text-initial-client-token.txt
/etc/ssl/huis/speech-to-text.huis.crt
/etc/ssl/huis/speech-to-text.huis.key
```

The admin and initial client token handoff files are root-only. The OpenAI API key is stored only in the systemd environment file.

## Service

The systemd unit is versioned at:

```text
deploy/systemd/speech-to-text.service
```

Install or update it with:

```bash
sudo cp deploy/systemd/speech-to-text.service /etc/systemd/system/speech-to-text.service
sudo systemctl daemon-reload
sudo systemctl enable --now speech-to-text
sudo systemctl status speech-to-text
```

Useful commands:

```bash
sudo systemctl restart speech-to-text
sudo journalctl -u speech-to-text -f
```

## nginx

The nginx site is versioned at:

```text
deploy/nginx/speech-to-text.conf
```

Install or update it with:

```bash
sudo cp deploy/nginx/speech-to-text.conf /etc/nginx/sites-available/speech-to-text
sudo ln -sfn /etc/nginx/sites-available/speech-to-text /etc/nginx/sites-enabled/speech-to-text
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

nginx terminates HTTPS using the Huis CA certificate and proxies traffic to `http://127.0.0.1:7077`.

## TLS Certificate

The initial certificate was issued from `caserver.huis` through the `acme` provisioner using HTTP-01 webroot validation.

Renew manually with:

```bash
sudo scripts/renew-huis-cert.sh
```

The certificate currently covers:

```text
speech-to-text.huis
```

## Admin Frontend

The admin frontend is available at:

```text
https://speech-to-text.huis/admin
```

Use the root-only admin token from:

```text
/root/speech-to-text-admin-token.txt
```

The first generated TalkToMe client token is stored once at:

```text
/root/speech-to-text-initial-client-token.txt
```

After a token is created through the admin UI, only its hash is stored in `CLIENT_KEYS_FILE`.

## Health Checks

```bash
curl -fsS https://speech-to-text.huis/healthz
curl -fsS https://speech-to-text.huis/readyz
```

`/readyz` should report `gpt-4o-transcribe` as the configured model.

Direct port `7077` is bound to `127.0.0.1` only. LAN clients should use nginx over HTTPS.
