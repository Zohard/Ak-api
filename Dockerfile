# Dockerfile for Railway - production build
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application (generates Prisma client and compiles TypeScript)
RUN npm run build

# Production stage
FROM node:20-alpine

# Install runtime dependencies only
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Set Node.js memory limit to 1GB
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Generate Prisma client in production
RUN npx prisma generate

# Expose port
EXPOSE 3003

# Run compiled production code
CMD ["npm", "run", "start:prod"]
