# Multi-stage build.
# Stage 1 (deps): installs Python dependencies into a virtual environment.
# Stage 2 (runtime): copies only the venv and application source — no build tools.

# ── Stage 1: dependency installer ─────────────────────────────────────────────
FROM python:3.14-slim AS deps

WORKDIR /build

# System packages needed to compile asyncpg and other C extensions.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only the dependency manifest first so Docker layer cache is preserved
# when only application code changes.
COPY pyproject.toml ./

# Create virtual environment and install all runtime dependencies.
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -e ".[dev]"

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.14-slim AS runtime

WORKDIR /app

# curl is needed for the Docker healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the fully-installed virtual environment from the deps stage.
COPY --from=deps /opt/venv /opt/venv

# Copy application source.
COPY src/ ./src/
COPY pyproject.toml ./

# Activate virtual environment for all subsequent commands.
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH="/app/src"

EXPOSE 8000

CMD ["uvicorn", "api_extractor.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
