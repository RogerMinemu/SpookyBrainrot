"""Repositories over the single sqlite connection."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from app.db.database import Database


@dataclass
class GameRow:
    id: str
    code: str
    name: str
    status: str
    state_json: str
    created_at: int
    updated_at: int


@dataclass
class PlayerRow:
    id: str
    game_id: str
    token: str
    name: str
    joined_at: int


def _game(r: sqlite3.Row) -> GameRow:
    return GameRow(r["id"], r["code"], r["name"], r["status"], r["state_json"], r["created_at"], r["updated_at"])


def _player(r: sqlite3.Row) -> PlayerRow:
    return PlayerRow(r["id"], r["game_id"], r["token"], r["name"], r["joined_at"])


class GamesRepo:
    def __init__(self, db: Database) -> None:
        self.c = db.conn

    def create(self, id: str, code: str, name: str, status: str, state_json: str, now_ms: int) -> GameRow:
        self.c.execute(
            "INSERT INTO games(id, code, name, status, state_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (id, code, name, status, state_json, now_ms, now_ms),
        )
        return self.get(id)  # type: ignore[return-value]

    def get(self, id: str) -> Optional[GameRow]:
        r = self.c.execute("SELECT * FROM games WHERE id=?", (id,)).fetchone()
        return _game(r) if r else None

    def get_by_code(self, code: str) -> Optional[GameRow]:
        r = self.c.execute(
            "SELECT * FROM games WHERE code=? AND status != 'finished' ORDER BY created_at DESC LIMIT 1",
            (code,),
        ).fetchone()
        return _game(r) if r else None

    def list(self) -> List[GameRow]:
        rows = self.c.execute("SELECT * FROM games ORDER BY updated_at DESC, created_at DESC").fetchall()
        return [_game(r) for r in rows]

    def code_in_use(self, code: str) -> bool:
        r = self.c.execute("SELECT 1 FROM games WHERE code=? AND status != 'finished'", (code,)).fetchone()
        return r is not None

    def save_state(self, id: str, status: str, state_json: str, now_ms: int) -> None:
        self.c.execute(
            "UPDATE games SET status=?, state_json=?, updated_at=? WHERE id=?",
            (status, state_json, now_ms, id),
        )

    def delete(self, id: str) -> bool:
        cur = self.c.execute("DELETE FROM games WHERE id=?", (id,))
        return cur.rowcount > 0


class PlayersRepo:
    def __init__(self, db: Database) -> None:
        self.c = db.conn

    def create(self, id: str, game_id: str, token: str, name: str, now_ms: int) -> PlayerRow:
        self.c.execute(
            "INSERT INTO players(id, game_id, token, name, joined_at) VALUES (?,?,?,?,?)",
            (id, game_id, token, name, now_ms),
        )
        return self.get_by_token(token)  # type: ignore[return-value]

    def get_by_token(self, token: str) -> Optional[PlayerRow]:
        r = self.c.execute("SELECT * FROM players WHERE token=?", (token,)).fetchone()
        return _player(r) if r else None

    def list_for_game(self, game_id: str) -> List[PlayerRow]:
        rows = self.c.execute(
            "SELECT * FROM players WHERE game_id=? ORDER BY joined_at, rowid", (game_id,)
        ).fetchall()
        return [_player(r) for r in rows]


class QrRepo:
    def __init__(self, db: Database) -> None:
        self.c = db.conn

    def count(self) -> int:
        return self.c.execute("SELECT COUNT(*) FROM qr_codes").fetchone()[0]

    def all(self) -> List[sqlite3.Row]:
        return self.c.execute("SELECT * FROM qr_codes ORDER BY kind, idx").fetchall()

    def get(self, token: str) -> Optional[sqlite3.Row]:
        return self.c.execute("SELECT * FROM qr_codes WHERE token=?", (token,)).fetchone()

    def ensure(self, generate: Callable[[], List[Any]]) -> bool:
        """Idempotent init: insert the registry only if empty. Returns True if created.

        Tokens are never regenerated (printed QR codes depend on them)."""
        if self.count() > 0:
            return False
        self.insert_all([(e.token, e.kind, e.idx) for e in generate()])
        return True

    def entries(self) -> List[Any]:
        from app.core.qr import QrEntry

        return [QrEntry(r["token"], r["kind"], r["idx"]) for r in self.all()]

    def insert_all(self, rows: List[tuple]) -> None:
        """rows: (token, kind, idx). One transaction."""
        self.c.execute("BEGIN")
        try:
            self.c.executemany("INSERT INTO qr_codes(token, kind, idx) VALUES (?,?,?)", rows)
            self.c.execute("COMMIT")
        except Exception:
            self.c.execute("ROLLBACK")
            raise


class HouseRepo:
    def __init__(self, db: Database) -> None:
        self.c = db.conn

    def all(self) -> Dict[int, dict]:
        rows = self.c.execute("SELECT * FROM house_config ORDER BY anchor_idx").fetchall()
        return {r["anchor_idx"]: {"spot_id": r["spot_id"], "riddle": r["riddle"]} for r in rows}

    def upsert(self, anchor_idx: int, riddle: str, spot_id: Optional[str]) -> None:
        self.c.execute(
            "INSERT INTO house_config(anchor_idx, spot_id, riddle) VALUES (?,?,?) "
            "ON CONFLICT(anchor_idx) DO UPDATE SET spot_id=excluded.spot_id, riddle=excluded.riddle",
            (anchor_idx, spot_id, riddle),
        )
