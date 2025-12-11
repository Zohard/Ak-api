# Dockerfile for Railway - run in dev mode
FROM node:20-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files and prisma schema BEFORE installing
COPY package*.json ./
COPY prisma ./prisma/

# Now install dependencies (postinstall will run prisma generate)
RUN npm ci

# Copy all source code
COPY . .

# Expose port
EXPOSE 3003

# Run in development mode (NestJS will compile on the fly)
CMD ["npm", "run", "start:dev"]
