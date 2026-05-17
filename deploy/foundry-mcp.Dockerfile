# EvenFoundryVTT — Phase 11 V2 MCP server (HTTP mode for remote deployment)
#
# Security notes (T-03-17, T-11-16): NO build args for secrets.
# EVF_BEARER, EVF_BRIDGE_URL and other vars are supplied at runtime via
# docker-compose env_file — NEVER baked into image layers.
#
# Usage (from repo root):
#   docker compose -f deploy/docker-compose.yml up --build foundry-mcp

# ---------------------------------------------------------------------------
# Stage 1: builder
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /workspace

# Copy workspace root configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# Copy .npmrc so pnpm honours auto-install-peers=false / ignore-scripts=true
# inside the container — without this, container defaults diverge from what
# the lockfile expects and `pnpm install --frozen-lockfile` errors with
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH. Caught by deploy/smoke.sh first run.
COPY .npmrc ./
COPY tsconfig.base.json biome.jsonc vitest.config.ts ./

# Copy all packages (workspace deps must be resolvable by pnpm install)
COPY packages/ ./packages/

# Enable corepack so pnpm version matches packageManager field in package.json
RUN corepack enable

# Install with frozen lockfile; --ignore-scripts prevents postinstall surprises
# (matches CI gate 1 from .github/workflows/ci.yml)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build ALL workspace packages (shared-protocol MUST be built before foundry-mcp).
# Pitfall 10: pnpm --prod deploy uses symlinks resolved at build time; if
# shared-protocol/dist doesn't exist, the runner image gets a broken symlink.
RUN pnpm -r build

# pnpm deploy creates a self-contained, symlink-free directory for the runner.
# --prod strips devDependencies. Output: /app/foundry-mcp/
# --legacy: pnpm 10+ requires either inject-workspace-packages=true OR --legacy
#   flag OR force-legacy-deploy=true config. We use --legacy here (container-
#   build-scoped) instead of repo-wide .npmrc changes that would affect every
#   developer's pnpm install behavior. Caught by deploy/smoke.sh first run.
RUN pnpm --filter @evf/foundry-mcp --prod deploy --legacy /app/foundry-mcp

# ---------------------------------------------------------------------------
# Stage 2: runner
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

# Set NODE_ENV so the MCP server's production guards activate
ENV NODE_ENV=production

# Copy the self-contained deployment from builder stage
COPY --from=builder /app/foundry-mcp .

# Expose the MCP HTTP port (default 8911, bridge owns 8910)
EXPOSE 8911

# wget is included in busybox on Alpine — used by the docker-compose healthcheck.
# No additional packages needed.

# HTTP mode entry — dist/http.js runs the Streamable HTTP transport.
# stdio mode (dist/index.js) is used for Claude Desktop local integration
# and does NOT need Docker.
ENTRYPOINT ["node", "dist/http.js"]
