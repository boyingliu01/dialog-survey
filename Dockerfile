FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# --- Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy runtime files
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/views ./src/views
COPY --from=builder /app/public ./public

# Runtime files needed by the Prisma CLI (container-side migrate deploy, DD-009 / #152)
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Copy environment template
COPY --from=builder /app/.env.example ./.env.example

# Switch to non-root user
USER nodejs

# Health check — node fetch, not curl (curl is absent from node:20-alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

EXPOSE 3001

# Apply pending migrations before boot (issue #152: prisma/migrations/ is the
# source of truth; migrate deploy is a no-op when the schema is already up to
# date). A failed migration must not start the app against a stale schema.
# Direct node invocation of the CLI entry: `npx` may try to FETCH prisma@latest
# because the runner stage installs deps with --ignore-scripts and never links
# the bin shim, which would silently upgrade the pinned 7.10.0.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/src/server.js"]
