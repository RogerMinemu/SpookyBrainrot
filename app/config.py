"""Runtime settings, resolved from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8000
DEFAULT_MIN_PLAYERS = 2


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
        public_url = (raw_url or f"http://localhost:{port}").rstrip("/")
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
