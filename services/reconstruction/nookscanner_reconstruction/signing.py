"""HMAC-SHA256 signing identical to packages/shared/src/signing.ts (threat T09).

signature = "v1=" + hex(HMAC_SHA256(secret, f"{timestamp}.{body}"))
"""

from __future__ import annotations

import hashlib
import hmac
import time

SIGNATURE_VERSION = "v1"
MAX_CLOCK_SKEW_SECONDS = 300


def sign_payload(secret: str, timestamp: int, body: str) -> str:
    if len(secret) < 32:
        raise ValueError("HMAC secret must be at least 32 characters")
    digest = hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"{SIGNATURE_VERSION}={digest}"


def verify_payload(
    secret: str, timestamp: int, body: str, signature: str, now_seconds: int | None = None
) -> tuple[bool, str | None]:
    now = int(time.time()) if now_seconds is None else now_seconds
    if abs(now - timestamp) > MAX_CLOCK_SKEW_SECONDS:
        return False, "STALE_TIMESTAMP"
    expected = sign_payload(secret, timestamp, body)
    if not hmac.compare_digest(expected, signature):
        return False, "BAD_SIGNATURE"
    return True, None
