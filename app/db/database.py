"""Single SQLite connection (stdlib). Only ever used from the event-loop thread."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Union

SCHEMA_VERSION = "1"

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('lobby','running','finished')),
    state_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_code_active
    ON games(code) WHERE status != 'finished';
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE TABLE IF NOT EXISTS qr_codes (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('anchor','decoy')),
    idx INTEGER NOT NULL,
    UNIQUE(kind, idx)
);
CREATE TABLE IF NOT EXISTS house_config (
    anchor_idx INTEGER PRIMARY KEY CHECK (anchor_idx BETWEEN 1 AND 7),
    spot_id TEXT,
    riddle TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: Union[str, Path]) -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        # The app is single-threaded on the event loop, but TestClient builds
        # the app in a different thread than the one that serves it.
        self.conn = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript(SCHEMA)
        self.conn.execute(
            "INSERT OR IGNORE INTO meta(key, value) VALUES ('schema_version', ?)",
            (SCHEMA_VERSION,),
        )

    def close(self) -> None:
        self.conn.close()
