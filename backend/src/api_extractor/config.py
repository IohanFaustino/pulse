"""Application configuration via pydantic-settings.

Reads environment variables (or .env file) and exposes typed settings
consumed by the database engine, Redis client, and other components.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Top-level application settings.

    All fields are read from environment variables (case-insensitive).
    Falls back to .env file in the working directory when a variable is absent.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/api_extractor",
        description=(
            "Async SQLAlchemy DSN. Uses asyncpg driver. "
            "Inside Docker Compose use host 'postgres'; from host use 'localhost:5433'."
        ),
    )

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL for transform result caching.",
    )

    # ── Application ───────────────────────────────────────────────────────────
    app_env: str = Field(
        default="development",
        description="Runtime environment: development | test | production.",
    )
    log_level: str = Field(
        default="INFO",
        description="Loguru log level.",
    )

    # ── Scheduler ─────────────────────────────────────────────────────────────
    scheduler_enabled: bool = Field(
        default=True,
        description=(
            "Enable the APScheduler in-process scheduler. "
            "Set to false in test/CI environments to prevent jobs from firing."
        ),
    )
    scheduler_tz: str = Field(
        default="America/Sao_Paulo",
        description="IANA timezone for cron triggers (BRT = UTC-3).",
    )


# Module-level singleton — import and use directly.
settings = Settings()
