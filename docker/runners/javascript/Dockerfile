FROM node:20-alpine

# Create non-root user for isolated execution
RUN addgroup -S runner && adduser -S runner -G runner

WORKDIR /workspace

# Copy execution entrypoint script
COPY runner.sh /usr/local/bin/runner.sh
RUN chmod +x /usr/local/bin/runner.sh

USER runner

ENTRYPOINT ["/usr/local/bin/runner.sh"]
