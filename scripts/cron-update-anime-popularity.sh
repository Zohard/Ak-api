#!/bin/bash

# Anime Popularity Update Script for Cron
# This script updates anime popularity rankings in the database

# Set the working directory to the NestJS backend
cd /home/zohardus/www/anime-kun-nestjs-v2

# Log file location
LOG_DIR="/home/zohardus/www/anime-kun-nestjs-v2/logs"
LOG_FILE="$LOG_DIR/anime-popularity-$(date +%Y-%m-%d).log"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Start
log "=========================================="
log "Starting anime popularity update..."

# Load environment variables if .env file exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    log "Loaded environment variables from .env"
fi

# Run the update script
log "Running npm script..."
npm run update-anime-popularity >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    log "✅ Anime popularity update completed successfully"
else
    log "❌ Anime popularity update failed with exit code $EXIT_CODE"
fi

log "=========================================="
echo ""

# Keep only last 30 days of logs
find "$LOG_DIR" -name "anime-popularity-*.log" -type f -mtime +30 -delete

exit $EXIT_CODE
