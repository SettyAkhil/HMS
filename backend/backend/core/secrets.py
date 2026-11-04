"""Symmetric encryption for secrets stored in the database (API keys/tokens
entered through an admin settings UI, as opposed to env vars). Uses Fernet
(AES-128-CBC + HMAC) keyed from SETTINGS_ENCRYPTION_KEY so a DB dump alone
doesn't expose credentials in plaintext.

SETTINGS_ENCRYPTION_KEY must be a Fernet key (generate with
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
Losing/rotating it makes previously-stored secrets undecryptable -- back it up
like any other credential.
"""

import os

from cryptography.fernet import Fernet, InvalidToken

_fernet = None
_fernet_checked = False


def _get_fernet():
    global _fernet, _fernet_checked
    if _fernet_checked:
        return _fernet
    _fernet_checked = True
    key = os.getenv("SETTINGS_ENCRYPTION_KEY")
    if not key:
        return None
    try:
        _fernet = Fernet(key.encode())
    except Exception as exc:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY is set but isn't a valid Fernet key. "
            "Generate one with: python -c \"from cryptography.fernet import "
            "Fernet; print(Fernet.generate_key().decode())\""
        ) from exc
    return _fernet


def encryption_configured() -> bool:
    return _get_fernet() is not None


def encrypt_secret(plaintext: str) -> str:
    fernet = _get_fernet()
    if fernet is None:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY is not set on the server -- required to "
            "store secrets entered through admin settings. Ask whoever "
            "manages the deployment to set it, then try again."
        )
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    fernet = _get_fernet()
    if fernet is None:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY is not set on the server -- required to "
            "read back secrets stored through admin settings."
        )
    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError(
            "Stored secret could not be decrypted -- SETTINGS_ENCRYPTION_KEY "
            "may have changed since it was saved."
        ) from exc
