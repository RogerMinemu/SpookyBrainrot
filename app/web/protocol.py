"""WebSocket envelope v1 and close codes."""
from __future__ import annotations

import json
import time
from typing import Any, Optional, Tuple

PROTOCOL_VERSION = 1

CLOSE_BAD_VERSION = 4000
CLOSE_REPLACED = 4001
CLOSE_HELLO_TIMEOUT = 4002
CLOSE_NOT_FOUND = 4004
CLOSE_GAME_DELETED = 4010


def envelope(t: str, payload: Optional[dict] = None, seq: int = 0) -> str:
    return json.dumps(
        {"v": PROTOCOL_VERSION, "t": t, "seq": seq, "ts": int(time.time() * 1000), "payload": payload or {}},
        separators=(",", ":"),
    )


def error_envelope(code: str, message: str = "", seq: int = 0) -> str:
    return envelope("error", {"code": code, "message": message or code}, seq)


class BadVersion(Exception):
    pass


class Malformed(Exception):
    pass


def parse(raw: str) -> Tuple[str, dict]:
    """Return (type, payload). Raises Malformed (bad JSON/shape) or BadVersion."""
    try:
        data: Any = json.loads(raw)
    except (ValueError, TypeError):
        raise Malformed("invalid json")
    if not isinstance(data, dict):
        raise Malformed("envelope must be an object")
    if data.get("v") != PROTOCOL_VERSION:
        raise BadVersion()
    t = data.get("t")
    if not isinstance(t, str) or not t:
        raise Malformed("missing type")
    payload = data.get("payload", {})
    if not isinstance(payload, dict):
        raise Malformed("payload must be an object")
    return t, payload
