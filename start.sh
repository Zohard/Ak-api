#!/bin/sh
set -e

echo "================================"
echo "Starting Anime-Kun NestJS API"
echo "================================"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "NODE_ENV: ${NODE_ENV:-not set}"
echo "PORT: ${PORT:-not set}"
echo "DATABASE_URL: ${DATABASE_URL:+***set***}"
echo "================================"

# Check if dist folder exists
if [ ! -d "dist" ]; then
    echo "ERROR: dist folder not found!"
    echo "Available files:"
    ls -la
    exit 1
fi

echo "✓ dist folder found"
echo "✓ Starting application..."

# Run the application with error handling
node dist/main.js || {
    echo "================================"
    echo "ERROR: Application failed to start!"
    echo "Exit code: $?"
    echo "================================"
    exit 1
}
