import itertools

from app.core import qr
from app.db.database import Database
from app.db.repos import QrRepo
from tests.fakes import seeded_rng


def test_generate_entries_shape():
    entries = qr.generate_entries()
    assert len(entries) == 15
    anchors = sorted(e.idx for e in entries if e.kind == "anchor")
    decoys = sorted(e.idx for e in entries if e.kind == "decoy")
    assert anchors == list(range(1, 8)) and decoys == list(range(1, 9))
    tokens = [e.token for e in entries]
    assert len(set(tokens)) == 15
    for t in tokens:
        assert len(t) >= 16
        assert set(t) <= set(qr.TOKEN_ALPHABET)


def test_alphabet_is_unambiguous_and_url_safe():
    assert not set("0O1ILB") & set(qr.TOKEN_ALPHABET)
    assert qr.TOKEN_ALPHABET.isalnum()


def test_ensure_is_idempotent_and_never_regenerates(tmp_path):
    repo = QrRepo(Database(tmp_path / "q.db"))
    assert repo.ensure(qr.generate_entries) is True
    first = [(e.token, e.kind, e.idx) for e in repo.entries()]
    assert len(first) == 15
    assert repo.ensure(qr.generate_entries) is False
    assert [(e.token, e.kind, e.idx) for e in repo.entries()] == first


def test_tokens_survive_new_app_instance(tmp_path):
    path = tmp_path / "q.db"
    a = QrRepo(Database(path))
    a.ensure(qr.generate_entries)
    first = {e.token for e in a.entries()}
    b = QrRepo(Database(path))
    b.ensure(qr.generate_entries)
    assert {e.token for e in b.entries()} == first


def test_generation_uses_injected_choice():
    rng = seeded_rng(7)
    a = qr.generate_entries(rng.choice)
    b = qr.generate_entries(seeded_rng(7).choice)
    assert a == b


def test_qr_url_trims_trailing_slash():
    assert qr.qr_url("http://x.test/", "ABC") == "http://x.test/k/ABC"


def test_room_keys_pair_each_room_with_its_anchor_in_room_order():
    from app.content import KEY_ROOMS

    entries = qr.generate_entries()
    keys = qr.room_keys(entries, KEY_ROOMS)
    assert [(room.room_no, e.kind, e.idx) for room, e in keys] == [(n, "anchor", n) for n in range(1, 7)]


def test_app_creates_registry_once(app, client, tmp_path):
    assert app.state.qr_repo.count() == 15
