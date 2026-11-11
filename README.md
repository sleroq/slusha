# Slusha

Dumbest girl in telegram.

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
      Photo input support
    </summary>
    <img src="https://i.ibb.co/SwmDZVWp/photo-2025-02-26-20-19-10.jpg" alt="Media support showcase">
  </details>
- Chat summary command disabled
- <details>
    <summary>
      Smart replies with ability to answer multiple people in one go
    </summary>
    <img src="https://i.ibb.co/dJtvhfDj/photo-2025-02-26-20-11-49.jpg" alt="Smart reply">
  </details>
- Per-chat settings
- Reply threads and reactions
- <details>
    <summary>
      Optional AI telemetry
    </summary>
    <img src="https://share.cum.army/u/YQEHu9.png" alt="Langfuse screenshot">
  </details>

## Requirements

- Bun
- PostgreSQL
- OpenCode API key
- Docker, gVisor, and the host-managed `sandboxd` service, or `SANDBOX_ENABLED=false`

## Preparation

1. `cp scripts/env.bash.example scripts/env.bash`
2. set up environment variables

## Development

Builds the Mini App and starts the backend server.

```bash
scripts/run.bash
```
