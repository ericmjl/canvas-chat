# Multi-stage Dockerfile: minimal final image with pixi and uv copied from
# official images, then pixi install so the environment is ready in one container.
#
# Build:  docker build -t canvas-chat .
# Run:    docker run -p 7865:7865 canvas-chat pixi run dev
# Or:     docker run -it canvas-chat pixi run python -c "import canvas_chat; print('ok')"
#
# Reproducibility: pin images, e.g. ghcr.io/prefix-dev/pixi:0.63.2,
#                  ghcr.io/astral-sh/uv:0.4.x

# For reliable build (pre-built wheels, no primp/boring-sys2 compile):
#   docker build --platform linux/amd64 -t canvas-chat .
# On Apple Silicon omit --platform to build arm64 (may need build deps; primp can fail).

# -----------------------------------------------------------------------------
# Stage 1: Extract pixi binary from official image
# -----------------------------------------------------------------------------
FROM ghcr.io/prefix-dev/pixi:latest AS pixi-source
# Pixi is at /usr/local/bin/pixi (see prefix-dev/pixi-docker)

# -----------------------------------------------------------------------------
# Stage 2: Extract uv (and uvx) from official distroless image
# -----------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:latest AS uv-source
# Distroless image has /uv and /uvx at root (docs.astral.sh/uv/guides/integration/docker)

# -----------------------------------------------------------------------------
# Stage 3: Runtime with pixi + uv + installed environment
# -----------------------------------------------------------------------------
FROM ubuntu:24.04 AS runtime

# Minimal deps; amd64 wheels mean we usually don't need build-essential
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy pixi from official image
COPY --from=pixi-source /usr/local/bin/pixi /usr/local/bin/pixi

# Copy uv and uvx from official distroless image into PATH
COPY --from=uv-source /uv /uvx /usr/local/bin/

# Verify binaries
RUN pixi --version && uv --version

WORKDIR /app

# Copy project (.dockerignore excludes .pixi, .venv, .git, node_modules, etc.)
COPY . .

# Install full pixi environment (locked); creates .pixi/envs/default from lockfile
RUN pixi install --locked

# Verify native deps (e.g. pydantic_core) load; fails build if wrong wheel was installed
RUN pixi run python -c "import pydantic_core; import canvas_chat; print('ok')"

# Default: run server without reload (reload spawns a subprocess that can hit pydantic_core issues)
# For dev with reload: docker run -p 7865:7865 canvas-chat pixi run dev
EXPOSE 7865
CMD ["pixi", "run", "serve"]
