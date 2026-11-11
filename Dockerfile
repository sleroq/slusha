FROM oven/bun:1.4.4 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build:web

FROM oven/bun:1.4.4
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data BACKUP_DIR=/app/backups
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data /app/backups && chown bun:bun /app/data /app/backups
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/src ./src
COPY --from=builder --chown=bun:bun /app/shared ./shared
COPY --from=builder --chown=bun:bun /app/packages ./packages
COPY --from=builder --chown=bun:bun /app/web/build ./web/build
COPY --from=builder --chown=bun:bun /app/package.json ./package.json
USER bun
CMD ["bun", "src/main.ts"]
