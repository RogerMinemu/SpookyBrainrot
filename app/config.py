"""Runtime settings, resolved from environment variables."""
from __future__ import annotations

import os
import socket
from ipaddress import IPv4Address
from urllib.parse import urlsplit, urlunsplit
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8000
DEFAULT_MIN_PLAYERS = 2


def detect_lan_ipv4() -> str:
    """Ask the routing table for the LAN address; UDP connect sends no data."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.0.2.1", 80))
            address = sock.getsockname()[0]
            if not IPv4Address(address).is_loopback and not IPv4Address(address).is_unspecified:
                return address
    except OSError:
        pass
    try:
        for address in socket.gethostbyname_ex(socket.gethostname())[2]:
            ip = IPv4Address(address)
            if not ip.is_loopback and not ip.is_unspecified and not ip.is_link_local:
                return address
    except OSError:
        pass
    return "127.0.0.1"


def _valid_int(raw: Optional[str]) -> Optional[int]:
    if raw is None:
        return None
    try:
        value = int(raw.strip())
    except (ValueError, AttributeError):
        return None
    return value if 0 < value < 65536 else None


def resolve_port(env: Mapping[str, str]) -> int:
    """SERVER_PORT -> PORT -> 8000; invalid values are skipped."""
    for key in ("SERVER_PORT", "PORT"):
        port = _valid_int(env.get(key))
        if port is not None:
            return port
    return DEFAULT_PORT


@dataclass(frozen=True)
class Settings:
    host: str = "0.0.0.0"
    port: int = DEFAULT_PORT
    public_url: str = f"http://localhost:{DEFAULT_PORT}"
    public_url_defaulted: bool = True
    db_path: Path = ROOT_DIR / "data" / "spooky.db"
    admin_key: str = ""
    min_players: int = DEFAULT_MIN_PLAYERS

    @classmethod
    def from_env(cls, env: Optional[Mapping[str, str]] = None, load_dotenv_file: bool = False) -> "Settings":
        if load_dotenv_file:
            from dotenv import load_dotenv

            load_dotenv(ROOT_DIR / ".env", override=False)
        if env is None:
            env = os.environ
        port = resolve_port(env)
        raw_url = (env.get("PUBLIC_URL") or "").strip()
        defaulted = not raw_url
        public_url = (raw_url or f"http://{detect_lan_ipv4()}:{port}").rstrip("/")
        parts = urlsplit(public_url)
        if parts.hostname in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
            authority = detect_lan_ipv4()
            if parts.port is not None:
                authority += f":{parts.port}"
            public_url = urlunsplit(parts._replace(netloc=authority))
        raw_db = (env.get("DB_PATH") or "").strip()
        db_path = Path(raw_db) if raw_db else ROOT_DIR / "data" / "spooky.db"
        if not db_path.is_absolute():
            db_path = ROOT_DIR / db_path
        min_players = _valid_int(env.get("MIN_PLAYERS"))
        return cls(
            host="0.0.0.0",
            port=port,
            public_url=public_url,
            public_url_defaulted=defaulted,
            db_path=db_path,
            admin_key=(env.get("ADMIN_KEY") or "").strip(),
            min_players=min_players if min_players is not None else DEFAULT_MIN_PLAYERS,
        )

    def ensure_db_dir(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
