FROM denoland/deno:latest AS builder

WORKDIR /app

COPY deno.json deno.lock main.ts ./
COPY lib ./lib
COPY locales ./locales
COPY drizzle ./drizzle
COPY slusha.config.js ./slusha.config.js

RUN deno cache --allow-import --allow-scripts main.ts

RUN mkdir -p ./tmp ./log && \
    deno compile \
    --allow-env \
    --allow-net \
    --allow-read=. \
    --allow-import \
    --allow-write \
    --allow-sys \
    --allow-ffi \
    --unstable-detect-cjs \
    -o /app/slusha \
    main.ts

FROM gcr.io/distroless/cc-debian12:nonroot

ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

WORKDIR /home/nonroot/app

COPY --from=builder --chown=nonroot:nonroot /app/slusha ./slusha
COPY --from=builder --chown=nonroot:nonroot /app/locales ./locales
COPY --from=builder --chown=nonroot:nonroot /app/drizzle ./drizzle
COPY --from=builder --chown=nonroot:nonroot /app/slusha.config.js ./slusha.config.js
COPY --from=builder --chown=nonroot:nonroot /app/tmp ./tmp
COPY --from=builder --chown=nonroot:nonroot /app/log ./log

CMD ["/home/nonroot/app/slusha"]
