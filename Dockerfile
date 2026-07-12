FROM denoland/deno:2.9.2 AS builder
ENV DENO_DIR=/deno-dir
WORKDIR /app

COPY . .
RUN deno cache --allow-import main.ts

FROM denoland/deno:2.9.2
ENV DENO_DIR=/deno-dir
WORKDIR /app

RUN mkdir -p ./tmp ./log

COPY --from=builder /app .
COPY --from=builder /deno-dir /deno-dir

CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read=.", "--allow-import", "--allow-write", "--allow-sys", "--allow-ffi", "--unstable-detect-cjs", "main.ts"]
