FROM e2bdev/base

# Install jq for JSON parsing in agent curl calls
RUN apt-get update && apt-get install -y jq && rm -rf /var/lib/apt/lists/*

# Install Node.js + Claude Code CLI globally
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code

# Pre-accept Claude Code terms and disable autoupdater
ENV DISABLE_AUTOUPDATER=1

# Create workspace directory
RUN mkdir -p /home/user/workspace
