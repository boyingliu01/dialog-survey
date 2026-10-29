# FROM node:20-slim AS builder
#
# Node 22, not 20 (issue #213): the runtime tree contains `cookie@2.0.1`, whose
# `engines.node` is `>=22`, pulled in by `@fastify/cookie` 11.1.x — which
# `@fastify/secure-session` requires for the session cookie path. Keeping node:20
# meant `npm ci` printed an EBADENGINE warning on every build while that cookie
# code ran on a runtime it declares unsupported. Aligned rather than silenced:
# the image, `package.json` `engines`, and every runtime dependency's own
# `engines.node` now agree. `tests/docker-engine-consistency.test.ts` enforces
# that agreement, including that this line matches the runner stage and .nvmrc.
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# The CJK font is a Git LFS object (`.gitattributes`: assets/fonts/*.otf).
# A clone that never ran `git lfs pull` — the default for anything that is not
# an interactive developer machine — checks out a 133-byte POINTER file: it
# exists, it has the right name and extension, so every "does the font exist"
# check passes and the image ships a text file instead of a font. Chinese then
# renders as blank boxes in every exported PDF while the build and the running
# service report nothing (issue #217). Fail the build instead: a missing font is
# an operator fixable in one command, a silently broken deliverable is not.
COPY scripts/verify-font-asset.mjs ./scripts/verify-font-asset.mjs
RUN node scripts/verify-font-asset.mjs assets/fonts/NotoSansCJKsc-Regular.otf

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
FROM node:22-slim AS runner

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
COPY --from=builder /app/scripts/verify-font-asset.mjs ./scripts/verify-font-asset.mjs

# Re-assert the font here, not only in the builder (issue #217): this is the
# stage that actually ships, so the check belongs on the bytes the runner
# received. Cheap (one file read) and it turns "every PDF here is broken" into a
# failed build.
RUN node scripts/verify-font-asset.mjs assets/fonts/NotoSansCJKsc-Regular.otf

# Copy environment template
COPY --from=builder /app/.env.example ./.env.example

# Switch to non-root user
USER nodejs

# Health check — node fetch, not curl (curl is not guaranteed in either base image).
# Probes /health/ready, and parses the body (issue #218): `r.ok` alone made a
# deployment with no LLM key or placeholder DingTalk credentials report
# `healthy`. Readiness is 200 only when every dependency works.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health/ready').then(async (r) => { const body = await r.json().catch(() => ({})); process.exit(r.ok && body.status === 'healthy' ? 0 : 1); }).catch(() => process.exit(1))"

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
