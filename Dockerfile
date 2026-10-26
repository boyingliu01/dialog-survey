FROM node:20-slim AS builder

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

# Drop build-time-only packages from the tree the runner stage copies (issue #210).
# `npm prune --omit=dev` does NOT do this: `prisma` and `typescript` are devDependencies
# AND optional peerDependencies of @prisma/client, so npm records them as devOptional and
# keeps them under --omit=dev -- dragging in @prisma/dev, @prisma/studio-core (Prisma
# Studio, a GUI no server opens), effect, an embedded PGlite and the schema-engine
# binary. The script derives the runtime graph from what dist/ actually imports and
# exits non-zero rather than shipping a tree that is missing something. Measured:
# node_modules 731 MB -> 163 MB, image 1.22 GB -> 477 MB.
RUN node scripts/prune-runtime-deps.mjs --dir /app && du -sh /app/node_modules

# --- Runner Stage ---
FROM node:20-slim AS runner

WORKDIR /app

# Create non-root user (Debian syntax; Alpine's addgroup/adduser are BusyBox applets
# with a different flag set, which is one reason the base image is Debian-based).
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nodejs

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy runtime files
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/views ./src/views
COPY --from=builder /app/public ./public

# CJK font for PDF export. export.service.ts resolves it from ASSETS_DIR
# (default ./assets/fonts); it deliberately does not live under reports/ so that
# directory stays disposable. Neither base image ships a CJK font, so without
# this every exported PDF renders Chinese as blank boxes.
COPY --from=builder /app/assets ./assets
RUN mkdir -p /app/reports && chown -R nodejs:nodejs /app/reports /app/assets

# Runtime files needed by the container-side migrate step (DD-009 / #152).
# prisma.config.ts is what the migration runner resolves the datasource from;
# scripts/ holds the runner itself now that the Prisma CLI is pruned away.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/scripts/migrate-deploy.mjs ./scripts/migrate-deploy.mjs

# Copy environment template
COPY --from=builder /app/.env.example ./.env.example

# Switch to non-root user
USER nodejs

# Health check — node fetch, not curl (curl is not guaranteed in either base image)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

EXPOSE 3001

# Apply pending migrations before boot (issue #152: prisma/migrations/ is the
# source of truth; applying is a no-op when the schema is already up to date).
# A failed migration must not start the app against a stale schema.
#
# This used to invoke the Prisma CLI directly (`node node_modules/prisma/build/
# index.js migrate deploy`). That binary is gone: pruning for issue #210 removes
# the CLI, which is ~40 MB of build-time tooling the server never loads. The
# replacement applies the same migration.sql files with `pg` and records them in
# `_prisma_migrations` using Prisma's own schema and checksums, so a database
# migrated here is still readable by `prisma migrate deploy` (deploy.sh, a
# developer machine) and vice versa. Verified in both directions against the CLI.
CMD ["sh", "-c", "node scripts/migrate-deploy.mjs && node dist/src/server-entry.js"]
