# Prisma + PostgreSQL Migration Plan

## Overview

Migrate Slusha from JSON file storage (`memory.json`) to PostgreSQL with Prisma ORM.

**Key Decisions:**
- Store all messages indefinitely (no deletion), but keep same limits for AI context
- Preserve `/forget` semantics by storing a chat-level boundary timestamp (`Chat.historyStartAt`) and only using messages after it for AI history
- Reactions stored as individual rows (one per user per emoji per message)
- Message additions and member updates are separate transactions
- Keep full `telegramInfo` JSON blobs for compatibility with dynamic media type handling
- Extract frequently-queried fields for efficient filtering

---

## Database Schema

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["deno"]
  output          = "../node_modules/.prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Chat {
  id                     BigInt       @id // Telegram chat ID
  type                   String       // "private", "group", "supergroup", "channel"
  title                  String?      // For groups
  firstName              String?      // For private chats
  username               String?
  
  notes                  String[]     @default([])
  lastNotesMessageId     Int?
  lastMemoryMessageId    Int?
  memory                 String?      @db.Text
  lastUse                DateTime     @default(now())
  chatModel              String?
  character              Json?        // BotCharacter blob
  messagesToPass         Int?
  randomReplyProbability Float?
  hateMode               Boolean      @default(false)
  locale                 String?
  
  telegramInfo           Json         // Full TgChat object for edge cases

  // When set, AI history should only use messages after this timestamp.
  historyStartAt         DateTime?
  
  messages               Message[]
  members                Member[]
  optOutUsers            OptOutUser[]
  
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt
}

model Message {
  id              Int       @id @default(autoincrement())
  
  // Extracted frequently-used fields
  telegramId      Int       // Telegram message_id
  chatId          BigInt
  text            String    @db.Text
  isMyself        Boolean
  senderId        BigInt?   // from.id
  senderUsername  String?   // from.username
  senderFirstName String?   // from.first_name
  date            DateTime  // message timestamp
  caption         String?   @db.Text
  
  // Reply tracking
  replyToTelegramId Int?    // Telegram message_id of replied message
  replyToText       String? @db.Text
  
  // Full Telegram Message object for media/complex features
  telegramInfo    Json
  
  chat            Chat      @relation(fields: [chatId], references: [id], onDelete: Cascade)
  reactions       Reaction[]
  
  createdAt       DateTime  @default(now())
  
  @@unique([chatId, telegramId])
  @@index([chatId, date])
  @@index([chatId, senderId])
}

model Reaction {
  id              Int      @id @default(autoincrement())
  
  messageId       Int
  message         Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  
  type            String   // "emoji" or "custom"
  emoji           String?
  customEmojiId   String?
  
  // Who reacted
  userId          BigInt?
  userUsername    String?
  userFirstName   String?
  
  createdAt       DateTime @default(now())
  
  @@unique([messageId, type, emoji, customEmojiId, userId]) // Prevent duplicate reactions
  @@index([messageId])
}

model Member {
  id             Int      @id @default(autoincrement())
  
  telegramId     BigInt   // Telegram user ID
  chatId         BigInt
  username       String?
  firstName      String
  description    String   @default("")
  lastUse        DateTime @default(now())
  
  telegramInfo   Json     // Full User object
  
  chat           Chat     @relation(fields: [chatId], references: [id], onDelete: Cascade)
  
  @@unique([chatId, telegramId])
  @@index([chatId, lastUse])
}

model OptOutUser {
  id         Int     @id @default(autoincrement())
  
  telegramId BigInt
  chatId     BigInt
  username   String?
  firstName  String
  
  chat       Chat    @relation(fields: [chatId], references: [id], onDelete: Cascade)
  
  @@unique([chatId, telegramId])
}
```

---

## Migration Tasks

### Phase 1: Infrastructure Setup

- [x] **1.1** Create / update `docker-compose.yml` for local PostgreSQL
  - Note: repo already had `docker-compose.yml` for production. It now includes:
    - a `postgres` service for local dev
    - a `slusha-prod` service behind `profiles: ["production"]` (so local Postgres is available without running the bot container)

  ```yaml
  services:
    postgres:
      image: postgres:16-alpine
      environment:
        POSTGRES_USER: slusha
        POSTGRES_PASSWORD: slusha_dev
        POSTGRES_DB: slusha
      ports:
        - "5432:5432"
      volumes:
        - postgres_data:/var/lib/postgresql/data

    slusha-prod:
      profiles: ["production"]
      image: slusha:latest
      environment:
        - DATABASE_URL=${DATABASE_URL}
      # ... (other env + volumes)

  volumes:
    postgres_data:
  ```

- [x] **1.2** Add Prisma dependencies to `deno.json`
  ```json
  {
    "imports": {
      "@prisma/client": "npm:@prisma/client@^6.0.0",
      "prisma": "npm:prisma@^6.0.0"
    }
  }

- [x] **1.3** Create `prisma/schema.prisma` (schema above)

- [x] **1.4** Add `DATABASE_URL` to environment setup
  - Updated `scripts/env.bash.example`
  - Example: `DATABASE_URL="postgresql://slusha:slusha_dev@localhost:5432/slusha"`


- [ ] **1.5** Generate Prisma client and run initial migration

  ✅ Client generation works locally:
  ```bash
  DATABASE_URL="postgresql://slusha:slusha_dev@localhost:5432/slusha" deno run -A npm:prisma validate
  DATABASE_URL="postgresql://slusha:slusha_dev@localhost:5432/slusha" deno run -A npm:prisma generate
  ```

  ⚠️ Initial migration (`migrate dev`) is currently blocked in this environment because:
  - Docker daemon is not reachable (so `docker compose up postgres` fails)
  - No Postgres is running at `localhost:5432` (so `prisma migrate dev --create-only` also fails)

  Once Postgres is running (either via Docker or a local installation), run:
  ```bash
  deno run -A npm:prisma migrate dev --name init
  ```

---

### Phase 2: Data Access Layer

- [ ] **2.1** Create `lib/db/client.ts` - Prisma client singleton
  - Initialize PrismaClient
  - Export singleton instance
  - Handle connection lifecycle

- [ ] **2.2** Create `lib/db/types.ts` - Shared types
  - Define `ChatMessage` reconstruction type (from DB Message → memory ChatMessage)
  - Define input types for creating messages, reactions, etc.

- [x] **2.3** Create `lib/db/chat.ts` - Chat repository
  - Implemented:
    - `getOrCreateChat(tgChat: TgChat)`
    - `updateChat(chatId: bigint, data: ...)`
    - `getChatById(chatId: bigint)`

- [x] **2.4** Create `lib/db/message.ts` - Message repository
  - Implemented:
    - `addMessage(chatId: bigint, message: CreateMessageInput)`
    - `getMessages(chatId: bigint, limit: number)` (includes reactions)
    - `getMessageByTelegramId(chatId: bigint, telegramId: number)` (includes reactions)
    - `updateMessageText(chatId: bigint, telegramId: number, text: string)`
    - `toMemoryMessage(dbMessage)` (reconstructs ChatMessage + reactions)

- [x] **2.5** Create `lib/db/reaction.ts` - Reaction repository
  - Implemented:
    - `addReaction(messageId: number, reaction: CreateReactionInput)`
    - `removeReaction(messageId: number, reaction: RemoveReactionInput)`
    - `getReactionsForMessage(messageId: number)`
    - `toMemoryReactions(...)` (DB rows -> MessageReactions)

- [x] **2.6** Create `lib/db/member.ts` - Member repository
  - Implemented:
    - `upsertMember(chatId: bigint, user: User)`
    - `removeMember(chatId: bigint, telegramId: bigint)`
    - `getActiveMembers(chatId: bigint, days: number, limit: number)`

- [x] **2.7** Create `lib/db/optout.ts` - OptOut repository
  - Implemented:
    - `addOptOut(chatId: bigint, user: OptOutUser)`
    - `removeOptOut(chatId: bigint, telegramId: bigint)`
    - `isOptedOut(chatId: bigint, telegramId: bigint)`
    - `getOptOutUsers(chatId: bigint)`

---

### Phase 3: Refactor Memory Classes

- [ ] **3.1** Rewrite `lib/memory.ts` - `Memory` class
  - Remove `chats: {}` in-memory storage
  - Add `prisma: PrismaClient` reference
  - `getChat()` becomes async, calls chat repository
  - Remove `save()` method (no longer needed)

- [ ] **3.2** Rewrite `lib/memory.ts` - `ChatMemory` class
  - All methods become async
  - `getHistory()` → fetch from DB with limit (config.maxMessagesToStore)
  - `addMessage()` → insert into DB
  - `clear()` → update chat's lastNotes, optionally clear notes array
  - `getMessageById()` → DB lookup
  - `addEmojiReaction()` / `removeEmojiReaction()` → reaction repository
  - `addCustomReaction()` / `removeCustomReaction()` → reaction repository
  - `setReactionCounts()` → batch upsert reactions
  - `updateUser()` → member repository upsert
  - `getActiveMembers()` → member repository query
  - `removeOldMessages()` → NO-OP (we keep all messages now)
  - `removeOldNotes()` → trim chat.notes array in DB

- [ ] **3.3** Update `loadMemory()` function
  - Return Memory instance with Prisma client
  - No JSON file loading

---

### Phase 4: Update Bot Code

- [ ] **4.1** Update `main.ts`
  - Import Prisma client
  - Initialize Prisma connection
  - Pass to Memory constructor
  - Handle async initialization

- [ ] **4.2** Update `lib/telegram/setup-bot.ts`
  - Middleware becomes async for `ctx.m` initialization
  - `ctx.m.getChat()` calls are now async
  - Message saving middleware becomes async
  - Chat migration handler becomes async

- [x] **4.3** Update `lib/app/scheduler.ts`
  - Removed `memory.save()` interval (DB auto-persists)
  - Kept file cleanup interval

- [x] **4.4** Update `lib/app/shutdown.ts`
  - Removed `memory.save()`
  - Added Prisma disconnect on shutdown

- [ ] **4.5** Update `lib/telegram/handlers/ai.ts`
  - Add `await` to all `ctx.m.*` calls
  - `ctx.m.getChat()` → `await ctx.m.getChat()`
  - `ctx.m.getHistory()` → `await ctx.m.getHistory()`
  - `ctx.m.addMessage()` → `await ctx.m.addMessage()`
  - `ctx.m.addEmojiReaction()` → `await ctx.m.addEmojiReaction()`

- [ ] **4.6** Update `lib/telegram/bot/notes.ts`
  - Add `await` to all `ctx.m.*` calls
  - Both notes and memory handlers need async updates

- [ ] **4.7** Update `lib/telegram/bot/character.ts`
  - `ctx.memory.chats[chatId]` → `await chatRepo.getChatById(chatId)`
  - `chat.members.find()` → `await memberRepo.getMember(chatId, userId)`
  - ChatMemory reconstruction for callback queries

- [ ] **4.8** Update `lib/telegram/middlewares/should-reply.ts`
  - `ctx.m.getLastMessage()` → `await ctx.m.getLastMessage()`
  - `ctx.m.getChat()` → `await ctx.m.getChat()`

- [ ] **4.9** Update `lib/telegram/bot/msg-delay.ts`
  - Async history access

- [ ] **4.10** Update `lib/telegram/bot/opt-out.ts`
  - Async opt-out user management

- [ ] **4.11** Update `lib/telegram/bot/language.ts`
  - Async chat locale updates

- [ ] **4.12** Update `lib/telegram/bot/context.ts`
  - Async chat config access

- [ ] **4.13** Update `lib/telegram/commands/summary.ts`
  - Async notes access

- [ ] **4.14** Update `lib/telegram/commands/lobotomy.ts`
  - Async memory clearing

- [ ] **4.15** Update `lib/telegram/commands/model.ts`
  - Async chat model updates

- [ ] **4.16** Update `lib/telegram/commands/random.ts`
  - Async random probability updates

- [ ] **4.17** Update `lib/telegram/commands/hatemode.ts`
  - Async hate mode toggle

- [ ] **4.18** Update `lib/telegram/commands/forget.ts`
  - Async history operations

- [ ] **4.19** Update `lib/history.ts`
  - Ensure `ChatMessage` interface compatibility
  - `msg.info` should work as-is (reconstructed from telegramInfo JSON)

---

### Phase 5: Migration Script

- [x] **5.1** Create `scripts/migrate-json-to-postgres.ts`
  - Reads `memory.json`
  - For each chat in `memory.chats`:
    - Upserts Chat record
    - Inserts Message rows (with reactions)
    - Upserts Member rows
    - Upserts OptOutUser rows
  - Handles BigInt conversion for Telegram IDs
  - Uses per-chat transaction for consistency

---

### Phase 6: Testing & Cleanup

- [ ] **6.1** Test bot startup and Prisma connection

- [ ] **6.2** Test message saving and retrieval

- [ ] **6.3** Test all commands:
  - [ ] /start
  - [ ] /character
  - [ ] /summary
  - [ ] /lobotomy
  - [ ] /model
  - [ ] /random
  - [ ] /optout, /optin
  - [ ] /language
  - [ ] /hatemode
  - [ ] /forget
  - [ ] /changelog

- [ ] **6.4** Test AI response generation with history from DB

- [ ] **6.5** Test reactions (add/remove)

- [ ] **6.6** Test notes and memory generation

- [ ] **6.7** Test chat migration (group → supergroup)

- [ ] **6.8** Test character selection (callback queries)

- [ ] **6.9** Run migration script on production data (backup first!)

- [ ] **6.10** Remove old JSON-related code:
  - `memory.json` references
  - `save()` method
  - File-based memory loading

- [ ] **6.11** Update `README.md`:
  - Add PostgreSQL requirement
  - Add DATABASE_URL setup
  - Add Docker Compose instructions
  - Update Docker production setup

- [ ] **6.12** Update `Dockerfile` for PostgreSQL support (if needed)

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `docker-compose.yml` | New | PostgreSQL service |
| `prisma/schema.prisma` | New | Database schema |
| `deno.json` | Modify | Add Prisma dependencies |
| `scripts/env.bash.example` | Modify | Add DATABASE_URL |
| `lib/db/client.ts` | New | Prisma client singleton |
| `lib/db/types.ts` | New | Shared DB types |
| `lib/db/chat.ts` | New | Chat repository |
| `lib/db/message.ts` | New | Message repository |
| `lib/db/reaction.ts` | New | Reaction repository |
| `lib/db/member.ts` | New | Member repository |
| `lib/db/optout.ts` | New | OptOut repository |
| `lib/memory.ts` | Major rewrite | Prisma-backed Memory/ChatMemory |
| `main.ts` | Modify | Prisma initialization |
| `lib/telegram/setup-bot.ts` | Modify | Async middleware |
| `lib/app/scheduler.ts` | Modify | Remove save interval |
| `lib/app/shutdown.ts` | Modify | Prisma disconnect |
| `lib/telegram/handlers/ai.ts` | Modify | Async memory calls |
| `lib/telegram/bot/notes.ts` | Modify | Async memory calls |
| `lib/telegram/bot/character.ts` | Modify | Async chat/member access |
| `lib/telegram/middlewares/should-reply.ts` | Modify | Async memory calls |
| `lib/telegram/bot/msg-delay.ts` | Modify | Async history access |
| `lib/telegram/bot/opt-out.ts` | Modify | Async opt-out management |
| `lib/telegram/bot/language.ts` | Modify | Async locale updates |
| `lib/telegram/bot/context.ts` | Modify | Async config access |
| `lib/telegram/commands/*.ts` | Modify | Async memory operations |
| `scripts/migrate-json-to-postgres.ts` | New | Data migration script |
| `README.md` | Modify | Updated setup docs |

---

## Notes

- All Telegram IDs (chat, user, message) use `BigInt` in Prisma to handle large IDs
- The `telegramInfo` JSON blob preserves full Telegram objects for compatibility
- Reactions are normalized (one row per user per reaction) for easier querying
- Messages are never deleted - use `date` index for efficient recent message queries
- The `@@unique` constraint on Reaction prevents duplicate reactions from same user

---

## Rollback Plan

If issues arise:
1. Stop the bot
2. Restore `memory.json` from backup
3. Revert code changes
4. Restart with old JSON-based system

Always backup `memory.json` before running migration script!
