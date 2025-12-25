FROM node:20-alpine AS base

# Install OpenSSL for Prisma and Claude CLI
RUN apk add --no-cache openssl \
  && npm install -g @anthropic-ai/claude-cli

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Copy prisma schema for generation
COPY ./prisma/ ./prisma/

RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Build the application
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY . .

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV CLAUDE_CLI_PATH=/usr/local/bin/claude

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

USER nestjs

# Railway assigns PORT automatically
EXPOSE 8080

ENV PORT=8080

# Health check for Railway
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

CMD ["node", "dist/main"]
