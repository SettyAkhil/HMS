"""Integration credentials at rest. Encrypted with HR_SECRETS_KEY (Fernet);
the key never lives in the database, so a DB dump alone cannot replay them."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings
from app.errors import Unavailable


def _fernet() -> Fernet:
    if not settings.secrets_key:
        raise Unavailable("HR_SECRETS_KEY is not configured; integration credentials cannot be stored")
    return Fernet(settings.secrets_key.encode())


def encrypt(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt(token: str | None) -> str | None:
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise Unavailable("Stored integration credential cannot be decrypted (was HR_SECRETS_KEY rotated?)") from exc
