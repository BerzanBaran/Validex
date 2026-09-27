from functools import lru_cache

import base58
from pydantic import Field, field_validator, model_validator
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
    auth_challenge_ttl_seconds: int = Field(default=300, ge=60, le=900)
    access_token_ttl_minutes: int = Field(default=15, ge=5, le=60)
    jwt_secret: str = Field(
        default="dev-only-change-this-secret-before-production-1234",
        min_length=32,
    )
    jwt_issuer: str = "validex-api"
    admin_wallet: str = ""
    solana_rpc_url: str = "https://api.devnet.solana.com"
    solana_program_id: str = ""
    usdc_mint: str = ""
    voucher_encryption_secret: str = Field(
        default="dev-only-voucher-encryption-secret-change-me",
        min_length=32,
    )

    @field_validator("admin_wallet")
    @classmethod
    def validate_admin_wallet(cls, value: str) -> str:
        if not value:
            return value
        try:
            if len(base58.b58decode(value)) != 32:
                raise ValueError("VALIDEX_ADMIN_WALLET must be a Solana public key")
        except ValueError as error:
            raise ValueError("VALIDEX_ADMIN_WALLET must be a Solana public key") from error
        return value

    @model_validator(mode="after")
    def reject_development_secret_in_production(self) -> "Settings":
        if self.environment != "development" and self.jwt_secret.startswith("dev-only-"):
            raise ValueError("VALIDEX_JWT_SECRET must be changed outside development")
        if self.environment != "development" and self.voucher_encryption_secret.startswith(
            "dev-only-"
        ):
            raise ValueError(
                "VALIDEX_VOUCHER_ENCRYPTION_SECRET must be changed outside development"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
