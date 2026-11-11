# Slusha rewrite

> Agents: Do not edit this document without explicit user confirmation.

## Goal

Rebuild Slusha as a maintainable Telegram AI bot using Bun, pi-durable, PostgreSQL, and a SolidJS Mini App. Keep conversations working. Start with a clean design rather than reproducing the current implementation's complexity.

Use domain-oriented design where it clarifies behavior: give meaningful entities and types methods that own their rules. Avoid unnecessary abstractions, layers, and branching across the app. The agent maintains the implementation; the user owns product decisions.

When implementation starts, consolidate the project's concise documentation and design guidance into `AGENTS.md`.

## Current bot

Slusha responds in private and group Telegram chats using conversation history, configurable personalities, models, and media. A Telegram Mini App manages settings.

### UX

- Replies in private chats; in groups, responds to direct replies, mentions, configured patterns, and random messages.
- Uses message history, reply relationships, and topics. Can send multiple replies and reactions to selected messages.
- Supports images and other media, subject to model and configuration support.
- Searches and selects Chub.ai characters, with a default Slusha character.
- Supports chat language, user opt-outs, history controls, and a chat-specific hatemode.
- Provides personal, chat, and authorized global settings in a Telegram-authenticated Mini App.
- `/model` and `/random` report settings. `/summary` is disabled. `/changelog` links to commits.

### Backend

- A Deno process runs a grammY polling bot, HTTP server, and cache cleanup.
- SQLite/libSQL and Drizzle store Telegram history, users, chats, reactions, settings, roles, and characters.
- The Vercel AI SDK connects to Google, OpenRouter, and OpenCode Go, with model-specific capabilities and fallback paths.
- The bot builds model context from stored Telegram events and sends structured reply and reaction actions.
- The app serves the SolidJS Mini App and its authenticated settings API, with metrics and optional Langfuse tracing.

## Target UX

### Conversations

- Preserve private and group conversations, reply selection, message targeting, reactions, topics, and configurable personalities.
- Prioritize the default character. Support Chub.ai as a first-class character source, not a second-class integration.
- Support images at launch. Other media can wait.
- Use the Mini App for model selection. Remove `/model` and `/random` for now; additional settings can follow after launch.
- Keep `/summary` disabled; design long-term memory separately.
- Preserve existing reply triggers, language, privacy, hatemode, and permission behavior where applicable. Default-character conversations and model selection take priority.

### Session controls

- `/forget`: chat admins only. Start a fresh pi session context without loading earlier chat history. Keep database records and agent-created files. Continue from the fresh context until the next session rotation.
- `/lobotomy`: chat admins only, with explicit confirmation. Reset the pi session and delete its agent-created files. Keep database records. Start the next generation without earlier chat history.
- Neither command deletes database history or changes the agent's capabilities. Authorized history tools remain available in both cases; only `/lobotomy` removes agent-created files.

### Privacy

- Opt-out is per user and applies prospectively: continue storing their Telegram events, but do not send events created during opt-out to inference providers while they remain opted out.
- Messages sent before opt-out may remain in the existing session.
- After opting back in, messages sent during opt-out become eligible for context on the next session rotation; do not rebuild the current session to add them.
- Enforce the same boundary for session inputs, history tools, and files exposed to the model.
- Consider a separate user-data deletion command later, without unnecessarily invalidating the prompt cache.

### Budgets

- Give every user and chat a budget, reset weekly. Show users an abstract percentage, not token amounts.
- Save messages even when a budget is exhausted. An exhausted user cannot trigger generation; other users can trigger it if both their own and the chat's budgets permit.
- Charge generation usage separately against the triggering user's budget and the chat's budget. For combined pending private messages, attribute the run to the user whose message triggered it.
- Prefer accounting for input and output tokens, including cached reads when reported. Use the simplest fair accounting supported by pi-ai; this is application budgeting, not provider billing.
- Weekly limits will be configured later. Payment and additional budget mechanisms come later.

## Target design

### Runtime and deployment

- Use Bun for runtime, packages, tests, builds, and deployment tooling. Do not use Deno.
- Run one application process. Serve independent chats concurrently without introducing workers unless needed.
- Pin a current Bun release for reproducible builds and update it regularly.
- If pi-durable cannot run reliably on Bun, use Node for that component as an exception.

### Application data

- Use PostgreSQL with Drizzle ORM and a newly designed schema.
- Treat stored Telegram events and chat history as the authoritative record of what happened.
- Migrate the legacy user list and any available summaries. Do not migrate old chat histories or legacy settings; start pi sessions fresh. Check whether summaries exist in the source database before migration.
- Validate migrated users and summaries before switching over. Do not carry forward old schema or code complexity without a reason.

### Settings

- Preserve shared defaults and global, per-chat, and per-user settings with explicit override resolution. Keep the scopes distinct and apply only authorized overrides.
- Model selection in the Mini App is required at launch. Other settings and editors may follow later; their absence must not compromise the settings design.

### Agent sessions and context

- Use pi-durable and pi-ai in place of the Vercel AI SDK and current AI integration. Do not retain the existing AI fallback stack.
- Use one pi conversation per Telegram topic, or per chat when topics are absent. Isolate storage by chat/session by default.
- Store each topic/chat's pi-durable state in its own SQLite database on persistent storage. PostgreSQL maps Telegram chat/topic IDs to session storage; the sandbox cannot access the databases directly.
- The pi session is the model's context during a conversation. Populate it from Telegram history as needed; append or reconcile changes without rebuilding the entire context every generation.
- Keep a stable context prefix across replies to benefit from provider prompt caching. Initially rotate near 70% of the model's context limit and seed the new session with up to 20 recent eligible messages that fit its budget. Treat these as tunable defaults; adjust from pricing and observed performance.
- Append new context as messages or system events rather than rebuilding the session. Record message edits with before/after content and reaction changes as system events.
- Assign stable, compact message references so the agent can target replies and the application can identify messages in edits and reactions.
- Keep other topics and relevant external context outside the active session, accessible through scoped files or tools when useful. Do not expose another chat's data unless explicitly permitted later.
- Provider caching is an optimization, not a guarantee. Edits, privacy controls, rotation, or provider behavior may require context changes.
- Limit workspace file contents to 25 MB per chat.

### Providers and tools

- Make OpenCode Go the first-class launch provider. Consider Codex later.
- Do not switch models as an image-support fallback. Define how the user is informed when the selected model cannot process an image.
- The agent sends replies and reactions through tools. Keep Telegram delivery and authorization in the application boundary.
- Tool availability is configurable by chat. At launch, agents generally have broad tool access, including code execution; selected chats may have different permissions.
- Run shell commands with just-bash in the Bun process, using persistent chat-scoped virtual workspaces. JavaScript execution is configurable; shell network access is disabled.
- The shell tool returns output to pi-durable. Reply and reaction tools use the app's Telegram integration directly.

### Telegram ingestion and recovery

- Persist received Telegram updates and do not intentionally drop pending updates on startup. Telegram retains unreceived updates for at most 24 hours.
- After downtime, preserve received history but only reply to eligible group messages from the last 15 minutes. Make the threshold configurable.
- In private chats, reply even after downtime. Add accumulated messages to the session and produce one reply for the pending batch; consecutive messages from one user may be grouped.
- Persist queued work. Ideally resume an interrupted agent run when the interruption is within a configurable window, initially around 15 minutes. For older runs, prefer a simple policy that respects the group and private-chat rules above.
- pi-durable resumes checkpointed work; an interrupted model request may be retried rather than resumed mid-response.
- Prefer simple recovery over exactly-once delivery. A rare missing or duplicate reply or reaction after a crash is acceptable.

### Mini App and operations

- Keep the SolidJS Mini App unless the new API contract requires changes. Review its API and Telegram authentication for practical improvements; preserve server-side authorization.
- Provide backups, recovery, Langfuse traces, and graceful-enough shutdown. Stop active execution on shutdown and resume eligible work on startup.
- Back up PostgreSQL and each live SQLite database using database-aware backups, plus agent-created files, to persistent backup storage roughly once per minute. Restore a matching backup set; accept up to the backup interval of data loss.
- Keep Telegram events authoritative when restored PostgreSQL and session checkpoints differ. On recovery, reconcile missing session context from stored events without replaying old external actions. Test restores across both stores.

## Verification

- Use integration and end-to-end tests for conversations, migrated users and summaries, settings resolution, opt-outs, session resets, budgets, sandbox isolation, and restart and backup recovery.
- Add inference and prompt-quality tests later, using fixtures and a judge model to detect response degradation.

## First milestone

Define the core conversation, session, privacy, and storage boundaries. Then build a vertical slice that receives and persists Telegram messages, runs an OpenCode Go pi-durable session, sends a reply, and recovers after restart. Validate prompt-cache behavior and chat isolation before expanding feature coverage.
