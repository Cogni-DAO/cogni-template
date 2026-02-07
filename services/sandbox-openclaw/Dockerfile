# Thin layer over openclaw:local — adds socat for socket bridge + our entrypoint.
# No multi-stage build, no file pruning. Per OPENCLAW_SANDBOX_SPEC.md P0.
FROM openclaw:local
USER root
RUN apt-get update && apt-get install -y --no-install-recommends socat \
  && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh
RUN chmod 755 /usr/local/bin/sandbox-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint.sh"]
