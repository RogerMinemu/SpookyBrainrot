import json

from app.puzzles.cursed_wordle import COVERED, CursedWordle
from tests.test_wordle_turns import Rig


def test_letters_not_in_target_and_deterministic():
    a = Rig(seed=7, words=["SAHUR", "KETER", "NOCLIP"])
    b = Rig(seed=7, words=["SAHUR", "KETER", "NOCLIP"])
    assert a.s.target == b.s.target and a.s.letters == b.s.letters
    assert set(a.s.letters) == {"A", "B", "C"}
    assert all(ch not in a.s.target for ch in a.s.letters.values())
    assert len(set(a.s.letters.values())) == 3  # distinct where possible


def test_late_joiner_gets_a_letter():
    r = Rig(names=("A", "B"))
    r.add_player("Z")
    assert "Z" in r.s.letters and r.s.letters["Z"] not in r.s.target


def test_disconnect_keeps_letter_for_reconnect():
    r = Rig()
    letter = r.s.letters["B"]
    r.set_connected("B", False)
    r.set_connected("B", True)
    assert r.s.letters["B"] == letter


def test_disconnected_at_start_gets_letter_on_connect():
    r = Rig(names=("A", "B"), connected=False)
    assert r.s.letters == {} and r.s.turn is None
    r.set_connected("B", True)
    assert "B" in r.s.letters and r.s.turn == "B"


def test_exactly_one_cell_hidden_after_attempt_2_and_again_after_4():
    r = Rig(words=["SAHUR"])
    r.guess("A", "SAXXX")  # S,A correct
    assert r.s.hidden == []
    r.guess("B", "SAXXX")
    assert len(r.s.hidden) == 1
    assert any(e.name == "splash" for e in r.events)
    row, col = r.s.hidden[0]
    view = r.p.view_tv(r.s)
    assert view["rows"][row]["cells"][col] == {"l": "", "s": COVERED}
    r.guess("C", "SAXXX")
    assert len(r.s.hidden) == 1
    r.guess("A", "SAXXX")
    assert len(r.s.hidden) == 2 and len(set(r.s.hidden)) == 2


def test_nothing_hidden_when_nothing_revealed():
    r = Rig(words=["SAHUR"])
    r.guess("A", "BBBBB")
    r.guess("B", "BBBBB")
    assert r.s.hidden == [] and not any(e.name == "splash" for e in r.events)


def test_views_never_leak_target_or_other_letters():
    r = Rig()
    r.guess("A", "SAXXX")
    tv = json.dumps(r.p.view_tv(r.s))
    assert "SAHUR" not in tv and '"letter"' not in tv and "your_turn" not in tv
    va, vb = r.p.view_player(r.s, "A"), r.p.view_player(r.s, "B")
    assert va["letter"] == r.s.letters["A"] and vb["letter"] == r.s.letters["B"]
    assert va["letter"] != vb["letter"]
    assert va["your_turn"] is False and vb["your_turn"] is True
    assert "SAHUR" not in json.dumps(va) and "SAHUR" not in json.dumps(vb)
    assert set(tv_key for tv_key in r.p.view_tv(r.s)) >= {"kind", "length", "rows", "turn_name", "max_attempts"}


def test_serialize_roundtrip():
    r = Rig(words=["SAHUR"])
    r.guess("A", "SAXXX")
    r.guess("B", "SAXXX")
    data = json.loads(json.dumps(r.p.serialize(r.s)))
    s2 = CursedWordle(words=["SAHUR"]).deserialize(data)
    assert s2.target == r.s.target and s2.turn == r.s.turn
    assert s2.letters == r.s.letters and s2.hidden == r.s.hidden
    assert [a.guess for a in s2.attempts] == ["SAXXX", "SAXXX"]
    assert [a.marks for a in s2.attempts] == [a.marks for a in r.s.attempts]
    assert r.p.view_tv(s2) == r.p.view_tv(r.s)
