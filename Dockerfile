# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npm run build

# Prune dev dependencies after build
RUN npm prune --production

# ── Production stage ────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Limit Node.js heap to 512MB (sufficient for a NestJS API)
ENV NODE_OPTIONS="--max-old-space-size=512"
ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

EXPOSE $PORT

CMD ["node", "dist/src/main"]
