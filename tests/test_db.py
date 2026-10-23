import sqlite3

import pytest

from app.db.database import Database
from app.db.repos import GamesRepo, HouseRepo, PlayersRepo, QrRepo


@pytest.fixture
def db(tmp_path):
    d = Database(tmp_path / "data" / "x.db")
    yield d
    d.close()


def test_db_file_created_under_tmp_dir(tmp_path):
    d = Database(tmp_path / "nested" / "x.db")
    assert (tmp_path / "nested" / "x.db").exists()
    d.close()


def test_schema_and_version(db):
    tables = {r[0] for r in db.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"meta", "games", "players", "qr_codes", "house_config"} <= tables
    v = db.conn.execute("SELECT value FROM meta WHERE key='schema_version'").fetchone()[0]
    assert v == "1"
    assert db.conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert db.conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"


def test_cascade_delete_players(db):
    games, players = GamesRepo(db), PlayersRepo(db)
    games.create("g1", "ABCD", "n", "lobby", "{}", 1)
    players.create("p1", "g1", "tok", "Ana", 2)
    assert players.list_for_game("g1")
    assert games.delete("g1") is True
    assert players.get_by_token("tok") is None
    assert games.delete("g1") is False


def test_snapshot_roundtrip(db):
    games = GamesRepo(db)
    games.create("g1", "ABCD", "n", "lobby", '{"a":1}', 1)
    games.save_state("g1", "running", '{"a":2}', 5)
    g = games.get("g1")
    assert (g.status, g.state_json, g.updated_at) == ("running", '{"a":2}', 5)


def test_code_unique_only_for_active(db):
    games = GamesRepo(db)
    games.create("g1", "ABCD", "n", "lobby", "{}", 1)
    with pytest.raises(sqlite3.IntegrityError):
        games.create("g2", "ABCD", "m", "lobby", "{}", 2)
    games.save_state("g1", "finished", "{}", 3)
    games.create("g2", "ABCD", "m", "lobby", "{}", 4)
    assert games.get_by_code("ABCD").id == "g2"


def test_qr_insert_all_atomic_and_house(db):
    qr = QrRepo(db)
    qr.insert_all([("t1", "anchor", 1), ("t2", "decoy", 1)])
    assert qr.count() == 2
    with pytest.raises(sqlite3.IntegrityError):
        qr.insert_all([("t3", "anchor", 2), ("t1", "anchor", 3)])
    assert qr.count() == 2
    h = HouseRepo(db)
    h.upsert(2, "r", None)
    h.upsert(2, "r2", "spot")
    assert h.all() == {2: {"spot_id": "spot", "riddle": "r2"}}
