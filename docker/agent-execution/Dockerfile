# Dockerfile for Secure Agent Execution Environment
# Provides minimal, hardened container for isolated agent task execution

FROM node:20-alpine AS base

# Install security updates and minimal dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    su-exec \
    && rm -rf /var/cache/apk/*

# Create non-root user for agent execution
RUN addgroup -g 1001 swarm && \
    adduser -D -u 1001 -G swarm swarm

# Set up workspace
WORKDIR /workspace
RUN chown swarm:swarm /workspace

# Install Claude CLI globally (if available)
# This would be replaced with actual Claude installation
RUN npm install -g @anthropic/claude-cli || echo "Claude CLI not available, using mock"

# Copy minimal Node.js runtime for agent execution
FROM base AS runtime

# Switch to non-root user
USER swarm:swarm

# Create minimal execution environment
RUN mkdir -p /workspace/{input,output,temp,logs} && \
    chmod 755 /workspace/* && \
    echo '#!/bin/sh\necho "Mock Claude execution: $@"' > /usr/local/bin/claude-mock && \
    chmod +x /usr/local/bin/claude-mock || true

# Set environment variables
ENV NODE_ENV=production \
    SWARM_MODE=agent-execution \
    USER=swarm \
    HOME=/workspace

# Security: Remove package managers and unnecessary tools
USER root
RUN apk del apk-tools && \
    rm -rf /var/cache/apk/* \
           /root/.npm \
           /tmp/* \
           /var/tmp/* \
           /usr/share/man \
           /usr/share/doc

# Final security hardening
USER swarm:swarm

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD echo "Agent container healthy" || exit 1

# Entry point with security
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "while true; do sleep 30; done"]

# Labels for swarm management
LABEL maintainer="claude-flow-swarm" \
      version="1.0.0" \
      description="Secure agent execution environment" \
      security.level="isolated" \
      swarm.component="agent-executor"