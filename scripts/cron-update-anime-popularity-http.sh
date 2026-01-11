#!/bin/bash

# Anime Popularity Update Script for Cron (HTTP Endpoint Version)
# This script calls the HTTP endpoint to update anime popularity rankings

# Configuration
API_URL="${API_BASE_URL:-http://localhost:3000}/api/cron/update-anime-popularity"
CRON_API_KEY="${CRON_API_KEY}"

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
log "Starting anime popularity update via HTTP endpoint..."

# Load environment variables if .env file exists
if [ -f /home/zohardus/www/anime-kun-nestjs-v2/.env ]; then
    export $(cat /home/zohardus/www/anime-kun-nestjs-v2/.env | grep -v '^#' | xargs)
    log "Loaded environment variables from .env"
fi

# Check if API key is set
if [ -z "$CRON_API_KEY" ]; then
    log "❌ ERROR: CRON_API_KEY environment variable is not set"
    log "Please set CRON_API_KEY in .env file"
    exit 1
fi

# Call the HTTP endpoint
log "Calling API: $API_URL"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Key: $CRON_API_KEY" \
    2>&1)

# Extract HTTP status code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
# Extract response body (everything except last line)
RESPONSE_BODY=$(echo "$RESPONSE" | sed '$d')

# Log the response
log "HTTP Status: $HTTP_CODE"
log "Response: $RESPONSE_BODY"

# Check if request was successful
if [ "$HTTP_CODE" -eq 200 ]; then
    log "✅ Anime popularity update completed successfully"

    # Pretty print the response if jq is available
    if command -v jq &> /dev/null; then
        log "Response details:"
        echo "$RESPONSE_BODY" | jq '.' >> "$LOG_FILE" 2>&1
    fi

    EXIT_CODE=0
elif [ "$HTTP_CODE" -eq 401 ]; then
    log "❌ Authentication failed - Invalid API key"
    EXIT_CODE=1
else
    log "❌ Anime popularity update failed with HTTP status $HTTP_CODE"
    EXIT_CODE=1
fi

log "=========================================="
echo ""

# Keep only last 30 days of logs
find "$LOG_DIR" -name "anime-popularity-*.log" -type f -mtime +30 -delete

exit $EXIT_CODE
