# Slusha

Smartest girl in telegram.

> Try it out - [@sl_chatbot](https://t.me/sl_chatbot) yourself or check out quotes - [@slushaquotes](https://t.me/s/slushaquotes)

## Features

- <details>
    <summary>
      Human-like responses in multiple messages
    </summary>
    <img src="https://i.ibb.co/LjYwWHH/photo-2025-02-26-20-11-54.jpg" alt="Multi-line responses">
  </details>
- <details>
    <summary>
      Characters from Chub.ai
    </summary>
    <img src="https://i.ibb.co/yFKJDxYG/photo-2025-02-26-20-11-40.jpg" alt="Character selection">
  </details>
- <details>
    <summary>
      Video, voice, photo, round videos, stickers input support (and more)
    </summary>
    <img src="https://i.ibb.co/SwmDZVWp/photo-2025-02-26-20-19-10.jpg" alt="Media support showcase">
  </details>
- Long-term memory and chat summary command
- <details>
    <summary>
      Smart replies with ability to answer multiple people in one go
    </summary>
    <img src="https://i.ibb.co/dJtvhfDj/photo-2025-02-26-20-11-49.jpg" alt="Smart reply">
  </details>
- Extensive per-chat configuration
- Undertanding of Telegram-specific features, like reply threads, via bot messages, quotes and forwards
- <details>
    <summary>
      Optional AI telemetry for debugging and cost/prompt review
    </summary>
    <img src="https://share.cum.army/u/YQEHu9.png" alt="Langfuse screenshot">
  </details>

## Requirements

- deno
- gemini api key (or other supported by [ai-sdk](https://sdk.vercel.ai/providers/ai-sdk-providers/))

## Preparation

1. `cp scripts/env.bash.example scripts/env.bash`
2. set up environment variables

## Start:

```bash
scripts/run.bash
```

## Config web widget (Telegram Mini App)

- Set `WIDGET_BASE_URL` to your public bot URL (example: `https://example.com`)
- Optional web server env vars: `WEB_HOST` (default `0.0.0.0`), `WEB_PORT` (default `8080`)
- Build widget assets (Deno-first):

```bash
scripts/build-widget.bash
```

- Use `/config` in chat (`/config global` for global config)

## Metrics (Prometheus + Grafana)

- `slusha_http_requests_total`
- `slusha_http_request_duration_seconds`
- `slusha_telegram_updates_total`
- `slusha_telegram_handler_errors_total`
- `slusha_ai_requests_total`
- `slusha_ai_request_duration_seconds`
- `slusha_ai_failures_total`
- `slusha_ai_finish_reason_total`
- `slusha_ai_tokens_total`
- `slusha_rate_limit_exceeded_total`
- `slusha_usage_downgraded_total`
- `slusha_process_uptime_seconds`
- `slusha_process_resident_memory_bytes`

### Prometheus scrape config

Add a target in your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: slusha
    metrics_path: /metrics
    static_configs:
      - targets:
          - localhost:8080
```

If Slusha runs in Docker or another host, replace `localhost:8080` with the reachable address.

### Grafana dashboard

Import the dashboard JSON from:

- `grafana/slusha-observability-dashboard.json`

In Grafana:

1. Go to Dashboards -> Import
2. Upload `grafana/slusha-observability-dashboard.json`
3. Select your Prometheus datasource when prompted

## Docker Production

```bash
# Build and run
docker build -t slusha-bot .
docker run -d \
  --name slusha-bot \
  --restart unless-stopped \
  -e BOT_TOKEN=your_bot_token \
  -e AI_TOKEN=your_ai_token \
  slusha-bot

# Using Docker Compose
docker-compose --profile production up -d slusha-prod
```
