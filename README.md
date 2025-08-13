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
3. update slusha.config.js to your liking

## Start:

```bash
scripts/run.bash
```

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
