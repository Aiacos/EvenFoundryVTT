# EvenFoundryVTT — Bridge service multi-stage Dockerfile
#
# Security notes (T-03-17): NO build args for secrets.
# EVF_INTERNAL_SECRET and EVF_PLUGIN_HOST_URL are supplied at runtime via
# docker-compose env_file — NEVER baked into image layers.
#
# Usage (from repo root):
#   docker compose -f deploy/docker-compose.yml up --build

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

# Build ALL workspace packages (shared-protocol MUST be built before bridge).
# Pitfall 10: pnpm --prod deploy uses symlinks resolved at build time; if
# shared-protocol/dist doesn't exist, the runner image gets a broken symlink.
RUN pnpm -r build

# pnpm deploy creates a self-contained, symlink-free directory for the runner.
# --prod strips devDependencies. Output: /app/bridge/
# --legacy: pnpm 10+ requires either inject-workspace-packages=true OR --legacy
#   flag OR force-legacy-deploy=true config. We use --legacy here (container-
#   build-scoped) instead of repo-wide .npmrc changes that would affect every
#   developer's pnpm install behavior. Caught by deploy/smoke.sh first run.
RUN pnpm --filter @evf/bridge --prod deploy --legacy /app/bridge

# ---------------------------------------------------------------------------
# Stage 2: runner
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

# OCI image metadata (shown by registries + Compose dashboards like Portainer/Dockge/Komodo).
# The icon is the same greyscale d20 used for the Even Hub listing (assets/icon/icon.png).
LABEL org.opencontainers.image.title="EvenFoundryVTT Bridge" \
      org.opencontainers.image.description="Bridge service projecting a Foundry VTT D&D 5e session onto Even Realities G2 glasses." \
      org.opencontainers.image.url="https://github.com/Aiacos/EvenFoundryVTT" \
      org.opencontainers.image.source="https://github.com/Aiacos/EvenFoundryVTT" \
      org.opencontainers.image.documentation="https://github.com/Aiacos/EvenFoundryVTT/blob/main/docs/release/bridge.md" \
      org.opencontainers.image.licenses="MIT" \
      com.evenfoundryvtt.icon="https://raw.githubusercontent.com/Aiacos/EvenFoundryVTT/main/assets/icon/icon.png"

# Set NODE_ENV so the bridge's startup guard activates (T-03-21)
ENV NODE_ENV=production

# Copy the self-contained deployment from builder stage
COPY --from=builder /app/bridge .

# Expose the bridge HTTP port (default 8910)
EXPOSE 8910

# wget is included in busybox on Alpine — used by the docker-compose healthcheck.
# No additional packages needed.

# Real production entrypoint (packages/bridge/src/index.ts → dist/index.js via tsup)
ENTRYPOINT ["node", "dist/index.js"]
