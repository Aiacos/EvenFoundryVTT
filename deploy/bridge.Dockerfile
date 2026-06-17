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

# ─── Headless player-view (ADR-0015 §C P2) — system Chromium for Playwright ───
# Playwright cannot run its bundled (glibc) browser on Alpine/musl, so we install
# Alpine's Chromium + the fonts/libs it needs and point Playwright at it via
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. The browser download is skipped at install
# time (.npmrc ignore-scripts + the flag below). Software WebGL (swiftshader) is
# requested via the launch args in playwright-browser.ts so Foundry's PIXI scene
# renders without a GPU. ~150 MB added; only used when a player-view mode is on.
# Chromium + Xvfb + Mesa software GL. Foundry's PIXI needs a WORKING WebGL
# context; headless swiftshader does NOT provide one (PIXI crashes on
# `getExtension` of an undefined context). The fix (verified 2026-06-17) is to
# run Chromium HEADFUL inside an Xvfb virtual display backed by Mesa llvmpipe —
# a software GL that renders WebGL correctly. ~250 MB added; only exercised when
# a player-view mode is enabled.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto-emoji \
      xvfb \
      mesa-gl \
      mesa-egl \
      mesa-dri-gallium \
      mesa-gbm
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    EVF_PLAYER_VIEW_HEADFUL=1 \
    DISPLAY=:99 \
    LIBGL_ALWAYS_SOFTWARE=1

# Copy the self-contained deployment from builder stage
COPY --from=builder /app/bridge .

# Entrypoint: start the Xvfb virtual display (so the headful Chromium has a GL
# surface), then run the bridge. Xvfb runs in the background; the bridge owns the
# foreground process (PID 1 semantics preserved via exec).
RUN printf '#!/bin/sh\nXvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/dev/null 2>&1 &\nexec node dist/index.js\n' \
      > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose the bridge HTTP port (default 8910)
EXPOSE 8910

# wget is included in busybox on Alpine — used by the docker-compose healthcheck.
ENTRYPOINT ["/app/entrypoint.sh"]
