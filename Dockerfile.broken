# Multi-stage build for production optimization
FROM node:20-alpine AS builder

# Install dependencies only when needed
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for building)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application (use railway build script to skip Vercel-specific build-api.js)
RUN echo "=== Starting build ===" && \
    echo "Current directory:" && pwd && \
    echo "Files in current directory:" && ls -la && \
    echo "Running: npm run build:railway" && \
    npm run build:railway && \
    echo "=== Build command finished ===" && \
    echo "Current directory after build:" && pwd && \
    echo "All files after build:" && ls -la && \
    echo "Checking if dist exists:" && \
    if [ -d "dist" ]; then \
      echo "✓ dist folder exists" && \
      echo "Contents of dist:" && \
      ls -la dist/ && \
      if [ -f "dist/main.js" ]; then \
        echo "✓ dist/main.js FOUND"; \
      else \
        echo "✗ dist/main.js NOT FOUND in dist folder"; \
      fi; \
    else \
      echo "✗ dist folder does NOT exist"; \
      echo "Searching for main.js anywhere:"; \
      find . -name "main.js" 2>/dev/null || echo "main.js not found anywhere"; \
    fi

# Production stage
FROM node:20-alpine AS production

# Create app user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Set working directory
WORKDIR /app

# Copy built application and only production node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Verify files were copied from builder
RUN echo "=== Verifying copied files in production stage ===" && \
    ls -la && \
    echo "=== Checking dist folder ===" && \
    ls -la dist/ && \
    echo "=== Checking if dist/main.js exists ===" && \
    test -f dist/main.js && echo "✓ dist/main.js confirmed" || echo "✗ dist/main.js MISSING"

# Install only production dependencies in final image
RUN npm ci --omit=dev && npm cache clean --force

# Generate Prisma client in production stage
RUN npx prisma generate

# Create uploads directory
RUN mkdir -p uploads && chown nestjs:nodejs uploads

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/api/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]