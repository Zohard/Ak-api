# Dockerfile for Railway - production build
FROM node:20-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Set Node.js memory limit to 1GB
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Copy package files and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies including devDependencies (needed for build)
RUN npm ci

# Copy all source code
COPY . .

# Build the application (generates Prisma client and compiles TypeScript)
RUN npm run build

# NOW set production environment (after build is done)
ENV NODE_ENV=production

# Verify build succeeded
RUN ls -la dist/ && echo "Build successful!" && ls -la dist/main.js

# Remove dev dependencies to save space (optional, comment out if build fails)
# RUN npm prune --production

# Expose port
EXPOSE 3003

# Run compiled production code directly
CMD ["node", "dist/main.js"]
