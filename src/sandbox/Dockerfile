FROM alpine:3.22

LABEL org.slusha.sandbox="1"

RUN apk add --no-cache tar curl ca-certificates \
    && addgroup -g 1000 sandbox \
    && adduser -D -u 1000 -G sandbox sandbox \
    && mkdir /workspace \
    && chown sandbox:sandbox /workspace

WORKDIR /workspace
USER sandbox:sandbox
CMD ["/bin/sh"]
