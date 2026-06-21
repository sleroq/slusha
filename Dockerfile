FROM --platform=$BUILDPLATFORM denoland/deno:2.7.4 AS widget-builder

WORKDIR /app

COPY widget ./widget
COPY lib/config-contract.ts ./lib/config-contract.ts
COPY lib/config-manifest.ts ./lib/config-manifest.ts

RUN deno task --config ./widget/deno.json build

FROM denoland/deno:2.7.4

ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

WORKDIR /app

COPY deno.json deno.lock main.ts ./
COPY lib ./lib
COPY locales ./locales
COPY drizzle ./drizzle
COPY --from=widget-builder /app/widget/dist ./widget/dist

RUN mkdir -p ./tmp ./log

CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read=.", "--allow-import", "--allow-write", "--allow-sys", "--allow-ffi", "--unstable-detect-cjs", "main.ts"]
