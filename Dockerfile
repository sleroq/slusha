FROM denoland/deno:latest AS builder

ENV DENO_DIR=/app/.deno_cache

WORKDIR /app

COPY deno.json deno.lock ./

COPY . .

RUN deno cache --allow-import --allow-scripts main.ts

FROM denoland/deno:latest

ENV DENO_DIR=/app/.deno_cache
ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

WORKDIR /app

COPY --from=builder --chown=deno:deno /app .

RUN mkdir -p ./tmp ./log && \
    chown -R deno:deno ./tmp ./log

USER deno

CMD ["deno", "run", \
     "--allow-env", \
     "--allow-net", \
     "--allow-read=.", \
     "--allow-import", \
     "--allow-write", \
     "--allow-sys", \
     "--unstable-detect-cjs", \
     "main.ts"] 