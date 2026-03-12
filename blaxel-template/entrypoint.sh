#!/usr/bin/env bash
set -e

# Start the Blaxel sandbox API (required)
/usr/local/bin/sandbox-api &

# Wait for the sandbox API to be ready
while ! nc -z 127.0.0.1 8080; do
  sleep 0.1
done

# Keep the container alive
exec sleep infinity
