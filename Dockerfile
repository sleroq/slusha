FROM denoland/deno:2.7.4

ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

WORKDIR /app

COPY deno.json deno.lock main.ts ./
COPY lib ./lib
COPY locales ./locales
COPY drizzle ./drizzle

RUN mkdir -p ./tmp ./log

CMD ["deno", "run", "--allow-env", "--allow-net", "--allow-read=.", "--allow-import", "--allow-write", "--allow-sys", "--allow-ffi", "--unstable-detect-cjs", "main.ts"]
