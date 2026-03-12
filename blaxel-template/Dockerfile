FROM ubuntu:22.04

# Copy the Blaxel sandbox API binary (required for all Blaxel templates)
COPY --from=ghcr.io/blaxel-ai/sandbox:latest /sandbox-api /usr/local/bin/sandbox-api

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl jq netcat-openbsd git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 + Claude Code CLI globally
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code

# Pre-accept Claude Code terms and disable autoupdater
ENV DISABLE_AUTOUPDATER=1

# Create workspace and user home directories
RUN useradd -m -s /bin/bash user || true
RUN mkdir -p /home/user/workspace && chown -R user:user /home/user

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
