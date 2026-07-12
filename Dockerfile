FROM denoland/deno:2.9.2 AS builder
ENV DENO_DIR=/deno-dir
WORKDIR /app

COPY deno.json deno.lock package.json* ./
COPY web/package.json* ./web/
RUN deno ci --prod --skip-types

COPY . .

FROM denoland/deno:2.9.2
ENV DENO_DIR=/deno-dir
WORKDIR /app

RUN mkdir -p ./tmp ./log

COPY --from=builder /app .
COPY --from=builder /deno-dir /deno-dir

# TODO: Stricter permissions
# FIXME: Figure out why is it downloading drizzle here
CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read=.", "--allow-import", "--allow-write", "--allow-sys", "--allow-ffi", "--unstable-detect-cjs", "main.ts"]
