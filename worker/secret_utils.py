import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "enc:v1:"


def is_encrypted(value: str | None) -> bool:
    return isinstance(value, str) and value.startswith(PREFIX)


def decrypt_secret(value: str | None) -> str | None:
    if not value or not is_encrypted(value):
        return value

    key = _get_key()
    parts = value.split(":", 4)
    if len(parts) != 5:
        raise ValueError("Encrypted secret value is malformed.")

    nonce = base64.b64decode(parts[2])
    tag = base64.b64decode(parts[3])
    ciphertext = base64.b64decode(parts[4])
    return AESGCM(key).decrypt(nonce, ciphertext + tag, None).decode("utf-8")


def _get_key() -> bytes:
    configured_key = os.getenv("ONECLICK_SECRET_KEY") or os.getenv("JWT_SECRET")
    if not configured_key:
        raise RuntimeError("ONECLICK_SECRET_KEY is required to decrypt environment variables.")

    try:
        decoded = base64.b64decode(configured_key, validate=True)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass

    return hashlib.sha256(configured_key.encode("utf-8")).digest()
