from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class SettingsRead(ORMModel):
    company_name: str
    legal_name: str | None
    phone: str | None
    email: str | None
    address: str | None
    logo_url: str | None
    logo_dark_url: str | None
    favicon_url: str | None
    primary_color: str
    accent_color: str
    hero_title: str | None
    hero_subtitle: str | None


class SettingsWrite(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    legal_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    primary_color: str = Field(default="#00533B", pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: str = Field(default="#D4AF37", pattern=r"^#[0-9A-Fa-f]{6}$")
    hero_title: str | None = None
    hero_subtitle: str | None = None
