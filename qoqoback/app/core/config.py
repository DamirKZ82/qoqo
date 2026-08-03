from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "qoqo"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/qoqo"
    timezone: str = "Asia/Almaty"

    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 720

    # Хранится строкой через запятую — так же, как в .env
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    seed_owner_email: str = "owner@qoqo.kz"
    seed_owner_password: str = "owner12345"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
