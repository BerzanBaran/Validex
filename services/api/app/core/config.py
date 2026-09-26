from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="VALIDEX_",
        extra="ignore",
    )

    app_name: str = "Validex API"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://validex:validex@localhost:5432/validex"
    auto_create_schema: bool = False
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])


@lru_cache
def get_settings() -> Settings:
    return Settings()

