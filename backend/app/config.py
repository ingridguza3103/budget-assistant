from pathlib import Path
from urllib.parse import urlsplit

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
    )

    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str = "budget_assistant"
    db_user: str = "budget_app"
    db_password: SecretStr | None = None
    database_url: SecretStr | None = None
    app_origin: str = "http://127.0.0.1:5173"

    @field_validator("app_origin")
    @classmethod
    def validate_origin(cls, value: str) -> str:
        origin = urlsplit(value.rstrip("/"))
        if (
            origin.scheme not in {"http", "https"}
            or not origin.hostname
            or origin.username is not None
            or origin.path
            or origin.query
            or origin.fragment
        ):
            raise ValueError("Use a single origin such as http://127.0.0.1:5173.")
        if origin.scheme == "http" and origin.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Use HTTPS for an origin outside localhost.")
        return f"{origin.scheme}://{origin.netloc}"

    @property
    def secure_cookie(self) -> bool:
        return self.app_origin.startswith("https://")


settings = Settings()
