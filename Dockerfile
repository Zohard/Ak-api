# Dockerfile for Railway using ts-node (no build step needed)
FROM node:20-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy prisma schema
COPY prisma ./prisma/
RUN npx prisma generate

# Copy all source code
COPY . .

# Expose port
EXPOSE 3003

# Run with ts-node (no build needed)
CMD ["npm", "run", "start:ts"]
