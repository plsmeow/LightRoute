# LightRoute

**LightRoute** is a lightweight, self-hosted fork of [OmniRoute](https://github.com/cheaper-inference/OmniRoute) tuned for small home servers, low-power CPUs, and slow disks.

It keeps the useful part — one OpenAI-compatible endpoint in front of many AI providers, with OAuth/API-key connections, model routing, fallback, and a dashboard — and removes the background work that made the original sluggish on a 4-core / 4 GB machine with a 5400 RPM HDD.

> **Кратко:** это облегчённый форк OmniRoute для локального использования на слабом сервере. Убраны реклама, спонсорские бейджи, тяжёлое логирование в SQLite, геймификация, сжатие промптов, фоновые синхронизации и лишние защиты. Добавлена настройка User-Agent на уровне провайдера. Всё работает через один endpoint `/v1`.

---

## Why this fork exists

The upstream project is feature-rich, but on a weak always-on server it spent a lot of time on work that is not needed for a private 2–5 agent setup:

- writing conversation-turn trees and SHA-256 hashes to SQLite on every agent step;
- synchronous request/proxy log inserts on every streamed chunk;
- XP, badges, leaderboards, and audit events;
- prompt-compression pipelines and background workers;
- periodic radar/catalog/ELO/free-proxy sync jobs;
- admission queues, circuit breakers, SSRF/PII/injection guards designed for public deployments.

LightRoute strips that work out and keeps the routing core.

## What changed

### Performance and storage

- **No conversation-turn tree.** `conversation_turn_nodes` inserts and per-message SHA-256 hashing are disabled. On the reference database this removed ~179k rows and the constant fsync traffic they caused.
- **Request logs in RAM.** Successful calls go to a 500-entry in-memory ring buffer (`ramCallLogs` / `ramProxyLogs`). Only errors and provider failures are written to SQLite.
- **SQLite tuned for a slow disk.** WAL journal, `synchronous=NORMAL`, 64 MB page cache, 256 MB `mmap`, `temp_store=MEMORY`, 5 s busy timeout.
- **No gamification.** XP, levels, badges, leaderboards, and their audit writes are no-ops.
- **No prompt compression.** Caveman, RTK, stacked compression, compression workers, and compression telemetry are disabled. The request body is passed through unchanged.
- **No dead background schedulers.** Radar, arena/ELO sync, models.dev sync, free-proxy crawler, and similar periodic jobs are removed from the dashboard and startup path.

### UI and branding

- Full LightRoute branding in the app shell, logo, package metadata, and PWA manifest.
- Removed the Keak product switcher, Kimi “official supporter” badge, Kimi preset banner, Cheaper Inference “open source friend” badge, and the sponsor banners on the home page.
- Removed the broken `ModelCompatPopover` from model rows.
- Removed unused sidebar groups: Agentic Features, Compression Context, Gamification, Costs/Teams, and Audit extras.

### Provider scope

The built-in catalogue and executor registry include only Antigravity, OpenAI Codex, Kiro, AgentRouter, OpenCode Go, Gemini Web, and DeepSeek Web. Existing compatible providers ArtBloom, BudsAI, cn, coarena, freegg, FujCloud, numes, and tokenharbor keep their connections and credentials. Startup removes other saved provider configurations and their synced catalogues without deleting historical usage or request logs.

### Provider User-Agent override

Compatible providers forward the incoming `User-Agent` by default. Turn on **Change User-Agent** in the provider settings to use an OpenCode, Codex, Pi, Oh My Pi, Claude, or DeepSeek Harness preset, or enter a custom value. This applies to all keys attached to the provider.

### Provider model catalogue

**Available Models** shows chat, image, audio, and other model types in the same grid. Search and visibility controls apply to the entire grid.

### Local-network mode

The fork is intended for a trusted LAN, not public exposure:

- private/local provider URLs are allowed (SSRF guard bypassed);
- prompt-injection and PII checks are disabled;
- admission queues are bypassed;
- circuit breakers always allow the request;
- session/auth complexity is left at the upstream defaults, but the deployment is expected to sit behind a trusted network or reverse proxy.

> **Warning:** do not expose this instance directly to the internet. If you need remote access, put it behind a VPN or an authenticating reverse proxy and set `REQUIRE_API_KEY=true`.

## Requirements

- **Runtime:** Node.js `>=22.22.2 <23` or `>=24 <27` (tested on Node 26.12).
- **Build:** Node.js plus `bun` or `npm`; at least 8 GB RAM is recommended for a Turbopack/Next.js production build.
- **Runtime RAM:** roughly 500 MB–1 GB for the dashboard and proxy under normal home-lab load.
- **Disk:** ~1.6 GB for the standalone build with `node_modules`; SQLite data lives separately.

## Quick start from source

```bash
git clone https://github.com/plsmeow/LightRoute.git
cd LightRoute

# Install dependencies (bun.lock is the primary lockfile)
bun install

# Production build. Turbopack is faster but uses more RAM.
OMNIROUTE_USE_TURBOPACK=1 node scripts/build/build-next-isolated.mjs

# Run the standalone server
cd .build/next/standalone
DATA_DIR="$HOME/.omniroute" \
OMNIROUTE_DATA_DIR="$HOME/.omniroute" \
PORT=1111 HOSTNAME=0.0.0.0 \
node server-ws.mjs
```

Open `http://<server>:1111/dashboard`.

If the build machine is RAM-constrained, use webpack instead:

```bash
OMNIROUTE_USE_TURBOPACK=0 node scripts/build/build-next-isolated.mjs
```

## Configuration

LightRoute reads configuration from two places:

| Path                          | Purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `~/.omniroute/runtime.env`    | Runtime settings generated/managed by the app (port, feature flags, retention). |
| `~/.omniroute/.env`           | Operator overrides and secrets.                                                 |
| `~/.omniroute/storage.sqlite` | Main SQLite database.                                                           |
| `~/.omniroute/db_backups/`    | Automatic pre-migration backups.                                                |

The data directory is still named `.omniroute` for compatibility with existing installations. Set `DATA_DIR` and `OMNIROUTE_DATA_DIR` to move it.

Important variables:

```dotenv
PORT=1111
HOSTNAME=0.0.0.0
DATA_DIR=/home/plsmeow/.omniroute
OMNIROUTE_DATA_DIR=/home/plsmeow/.omniroute
OMNIROUTE_UPSTREAM_HTTP2_ENABLED=false
OMNIROUTE_READY_TIMEOUT_MS=240000
```

## systemd deployment

Example unit (`/etc/systemd/system/lightroute.service`):

```ini
[Unit]
Description=LightRoute AI Router
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=plsmeow
Group=plsmeow
WorkingDirectory=/opt/lightroute
Environment=HOME=/home/plsmeow
Environment=NODE_ENV=production
Environment=DATA_DIR=/home/plsmeow/.omniroute
Environment=OMNIROUTE_DATA_DIR=/home/plsmeow/.omniroute
Environment=OMNIROUTE_UPSTREAM_HTTP2_ENABLED=false
Environment=OMNIROUTE_READY_TIMEOUT_MS=240000
EnvironmentFile=/home/plsmeow/.omniroute/runtime.env
EnvironmentFile=/home/plsmeow/.omniroute/.env
# Last file wins: force the port used by the dashboard/proxy.
EnvironmentFile=-/etc/lightroute.env
ExecStart=/usr/bin/node /opt/lightroute/server-ws.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

`/etc/lightroute.env`:

```dotenv
PORT=1111
HOSTNAME=0.0.0.0
```

Deploy:

```bash
sudo mkdir -p /opt/lightroute
sudo rsync -a --delete .build/next/standalone/ /opt/lightroute/
sudo chown -R plsmeow:plsmeow /opt/lightroute

sudo systemctl daemon-reload
sudo systemctl enable --now lightroute.service
sudo systemctl status lightroute.service
```

Upgrade:

```bash
sudo systemctl stop lightroute.service
sudo rsync -a --delete .build/next/standalone/ /opt/lightroute/
sudo chown -R plsmeow:plsmeow /opt/lightroute
sudo systemctl start lightroute.service
```

The database is migrated automatically on startup; a backup is written to `~/.omniroute/db_backups/` first.

## API

The proxy is OpenAI-compatible:

```bash
curl http://127.0.0.1:1111/v1/models

curl http://127.0.0.1:1111/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-api-key>' \
  -d '{
    "model": "antigravity/gemini-3.8-flash-high",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Health check:

```bash
curl http://127.0.0.1:1111/api/health
# {"status":"ok","timestamp":"..."}
```

The dashboard is at `/dashboard`; the OpenAI-compatible API is under `/v1` (with aliases such as `/v1/chat/completions`, `/v1/responses`, `/models`).

## Removed subsystems

- Radar and promo feeds
- Vector memory / knowledge base
- Skills sandbox (Docker/K8s/Python)
- Prompt evaluation suite
- Free-proxy crawler
- Teams and enterprise tiers
- Traffic inspector (HTTP/SOCKS5 MITM UI)
- External ELO/catalog sync
- Agentic Features (Memory, AgentSkills, Chaos Mode, OmniSkills, MCP Server, A2A Server, Plugins)
- Prompt compression (Caveman, RTK, stacked)
- Gamification (XP, levels, badges, leaderboard)
- Conversation turn tree and turn hashing
- Sponsor/advertising UI

Some internal package names, environment variables, and module paths still use the `omniroute` prefix so existing databases, scripts, and upstream patches remain compatible. The user-facing name is LightRoute.

## Upstream and license

LightRoute is a fork of [cheaper-inference/OmniRoute](https://github.com/cheaper-inference/OmniRoute), originally created by [Diego Souza](https://github.com/diegosouzapw). The original README is preserved as [README.upstream.md](README.upstream.md).

Licensed under the MIT License. See [LICENSE](LICENSE) for the original copyright notice.
