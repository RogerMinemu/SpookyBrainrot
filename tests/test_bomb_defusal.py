"""Room 6 plugin: the rules (one case per manual line), the torn manual, strikes, boom, roles, private bomb."""
import itertools
import json
import random

import pytest

from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Emit, Touch
from app.core.puzzle import ActionRejected, PlayerInfo, PuzzleCtx
from app.puzzles import bomb_defusal as bd
from app.puzzles.bomb_defusal import (
    HOLD, TAP, BombDefusal, button_action, deal_pages, make_keypad, make_password, password_matches, release_ok, wire_to_cut,
)
from tests.fakes import FakeClock, seeded_rng

NO_VOWEL_EVEN, NO_VOWEL_ODD = "BC1D22", "BC1D23"
VOWEL_EVEN, VOWEL_ODD = "EB1C22", "EB1C23"


class Rig:
    def __init__(self, n=3, seed=1234):
        self.clock = FakeClock()
        self.p = BombDefusal()
        self.players = [PlayerInfo(f"p{i}", f"P{i}", True) for i in range(n)]
        self.ctx = PuzzleCtx(self.clock, seeded_rng(seed), self.players)
        self.s = self.p.start(self.ctx, [x.id for x in self.players])

    def act(self, action, pid=None):
        return self.p.handle(self.ctx, self.s, pid or self.s.defuser, action)

    def tick_after(self, ms):
        self.clock.advance(ms / 1000)
        return self.p.tick(self.ctx, self.s)

    def wrong_wire(self):
        right = wire_to_cut(self.s.wires, self.s.serial)
        return next(i for i in range(len(self.s.wires)) if i != right)

    def solve_wires(self):
        return self.act({"type": "cut", "wire": wire_to_cut(self.s.wires, self.s.serial)})

    def solve_keypad(self):
        fx = []
        for i in self.s.keypad_order:
            fx = self.act({"type": "key", "symbol": i})
        return fx

    def solve_password(self):
        for col, (letters, ch) in enumerate(zip(self.s.columns, self.s.word)):
            while letters[self.s.pos[col]] != ch:
                self.act({"type": "letter", "col": col, "dir": 1})
        return self.act({"type": "submit"})

    def tap_button(self, hold_ms=200):
        self.act({"type": "button", "down": True})
        self.clock.advance(hold_ms / 1000)
        return self.act({"type": "button", "down": False})


def kinds(effects):
    return [type(e) for e in effects]


# --- the rules: one case per manual line -----------------------------------------------------------------
@pytest.mark.parametrize("colors,serial,cut", [
    (["negro", "rojo", "azul"], NO_VOWEL_ODD, 2),
    (["rojo", "amarillo", "azul"], NO_VOWEL_ODD, 1),
    (["rojo", "azul", "azul"], NO_VOWEL_EVEN, 0),
    (["rojo", "azul", "azul"], NO_VOWEL_ODD, 1),
    (["rojo", "azul", "rojo", "blanco"], NO_VOWEL_ODD, 2),
    (["rojo", "rojo", "amarillo", "blanco"], NO_VOWEL_EVEN, 2),
    (["azul", "rojo", "amarillo", "blanco"], NO_VOWEL_EVEN, 0),
    (["azul", "rojo", "amarillo", "negro"], NO_VOWEL_EVEN, 3),
    (["rojo", "azul", "azul", "amarillo", "negro"], VOWEL_EVEN, 3),
    (["rojo", "amarillo", "amarillo", "azul", "negro"], NO_VOWEL_EVEN, 0),
    (["azul", "azul", "blanco", "blanco", "rojo"], NO_VOWEL_EVEN, 1),
    (["negro", "azul", "rojo", "rojo", "azul"], NO_VOWEL_EVEN, 2),
    (["rojo", "azul", "azul", "blanco", "negro", "rojo"], NO_VOWEL_ODD, 2),
    (["amarillo", "blanco", "blanco", "azul", "rojo", "negro"], NO_VOWEL_EVEN, 3),
    (["amarillo", "amarillo", "azul", "azul", "negro", "blanco"], NO_VOWEL_EVEN, 5),
    (["amarillo", "amarillo", "rojo", "azul", "negro", "blanco"], NO_VOWEL_EVEN, 3),
])
def test_every_wire_rule(colors, serial, cut):
    assert wire_to_cut(colors, serial) == cut


@pytest.mark.parametrize("color,label,batteries,serial,action", [
    ("azul", "ABORTAR", 0, NO_VOWEL_EVEN, HOLD),
    ("rojo", "DETONAR", 2, NO_VOWEL_EVEN, TAP),
    ("blanco", "MANTENER", 0, VOWEL_EVEN, HOLD),
    ("rojo", "TUNG", 3, NO_VOWEL_EVEN, TAP),
    ("amarillo", "DETONAR", 1, NO_VOWEL_EVEN, HOLD),
    ("rojo", "MANTENER", 0, NO_VOWEL_EVEN, TAP),
    ("azul", "TUNG", 0, NO_VOWEL_EVEN, TAP),
])
def test_every_button_rule(color, label, batteries, serial, action):
    assert button_action(color, label, batteries, serial) == action


def test_every_wire_count_and_colour_mix_has_an_answer_in_range():
    for n in range(3, 7):
        for colors in itertools.islice(itertools.product(bd.WIRE_COLORS, repeat=n), 0, None, 7):
            for serial in (NO_VOWEL_EVEN, VOWEL_ODD):
                assert 0 <= wire_to_cut(list(colors), serial) < n


def test_release_needs_the_strip_digit_on_the_clock_with_a_little_grace():
    assert release_ok("azul", 183_000)  # 3:03
    assert not release_ok("azul", 254_400)  # 4:15 (or 4:16 just before)
    assert release_ok("blanco", 254_400)
    assert release_ok("amarillo", 244_000)  # the phone still showed 4:05 a moment ago
    assert not release_ok("amarillo", 243_200)


def test_keypad_columns_never_share_more_than_two_symbols_so_four_of_one_fit_no_other():
    for a, b in itertools.combinations(bd.KEYPAD_COLUMNS, 2):
        assert len(set(a) & set(b)) <= 2
    rng = random.Random(4)
    for _ in range(200):
        symbols, order = make_keypad(rng)
        fits = [c for c in bd.KEYPAD_COLUMNS if set(symbols) <= set(c)]
        assert len(fits) == 1 and sorted(order) == [0, 1, 2, 3]
        assert [symbols[i] for i in order] == [s for s in fits[0] if s in symbols]


@pytest.mark.parametrize("seed", range(80))
def test_the_password_has_exactly_one_answer_and_never_starts_solved(seed):
    word, columns, pos = make_password(random.Random(seed))
    assert password_matches(columns) == [word]
    assert all(len(c) == bd.LETTERS_PER_COLUMN and len(set(c)) == len(c) for c in columns)
    assert "".join(c[p] for c, p in zip(columns, pos)) != word


# --- the manual ---------------------------------------------------------------------------------------------
def test_the_manual_carries_every_rule_text_and_every_word_once():
    text = json.dumps(bd.MANUAL, ensure_ascii=False)
    for rules in bd.WIRE_RULES.values():
        for line, _, _ in rules:
            assert line in text
    for line, _, _ in bd.BUTTON_RULES:
        assert line in text
    words = [w for p in bd.MANUAL for w in p.get("words", [])]
    assert sorted(words) == sorted(bd.PASSWORD_WORDS)
    assert [p["symbols"] for p in bd.MANUAL if "symbols" in p] == [list(c) for c in bd.KEYPAD_COLUMNS]
    assert "Tira amarilla: un 5." in text and "Tira amarillo" not in text  # "la tira" is feminine
    assert len(bd.PAGE_IDS) == len(set(bd.PAGE_IDS)) == 14


def test_only_the_pages_with_a_vowel_rule_warn_that_the_serial_has_no_i_or_o():
    assert [p["id"] for p in bd.MANUAL if bd.SERIAL_NOTE in p["lines"]] == ["wires-5", "button-press"]
    assert "A, E o U" in bd.SERIAL_NOTE


@pytest.mark.parametrize("experts", [1, 2, 3, 5, 9, 13])
def test_pages_are_dealt_once_each_and_evenly(experts):
    pids = [f"e{i}" for i in range(experts)]
    dealt = deal_pages(pids, list(bd.PAGE_IDS))
    flat = [p for pages in dealt.values() for p in pages]
    assert sorted(flat) == sorted(bd.PAGE_IDS)
    sizes = [len(v) for v in dealt.values()]
    assert max(sizes) - min(sizes) <= 1


# --- roles and views -------------------------------------------------------------------------------------------
def test_one_artificiero_has_the_bomb_and_the_others_share_the_manual():
    r = Rig(n=4)
    assert r.s.defuser == "p0" and r.s.phase == bd.PHASE_ARMED and r.s.left == bd.BOMB_MS // 1000
    views = {p.id: r.p.view_player(r.s, p.id) for p in r.players}
    assert views["p0"]["role"] == "defuser" and views["p0"]["bomb"] is not None and views["p0"]["manual"] == []
    pages = []
    for pid in ("p1", "p2", "p3"):
        assert views[pid]["role"] == "expert" and views[pid]["bomb"] is None
        pages += [p["id"] for p in views[pid]["manual"]]
    assert sorted(pages) == sorted(bd.PAGE_IDS)


def test_the_tv_never_shows_the_bomb():
    r = Rig()
    tv = r.p.view_tv(r.s)
    blob = json.dumps(tv, ensure_ascii=False)
    assert "bomb" not in tv and "manual" not in tv
    for secret in (r.s.serial[:3], r.s.word, *r.s.keypad):
        assert secret not in blob
    assert tv["defuser"] == "P0" and sum(e["pages"] for e in tv["experts"]) == len(bd.PAGE_IDS)


def test_alone_the_artificiero_gets_the_whole_manual():
    r = Rig(n=1)
    v = r.p.view_player(r.s, "p0")
    assert v["bomb"] is not None and [p["id"] for p in v["manual"]] == bd.PAGE_IDS


def test_only_the_artificiero_can_touch_the_bomb():
    r = Rig()
    with pytest.raises(ActionRejected) as ei:
        r.act({"type": "cut", "wire": 0}, pid="p1")
    assert ei.value.code == "not_defuser"
    with pytest.raises(ActionRejected) as ei:
        r.act({"type": "dance"})
    assert ei.value.code == "bad_action"
    with pytest.raises(ActionRejected) as ei:
        r.act({"type": "cut", "wire": 9})
    assert ei.value.code == "bad_action"


# --- modules ------------------------------------------------------------------------------------------------------
def test_right_wire_defuses_the_module_wrong_wire_is_a_strike():
    r = Rig()
    ends = r.s.ends_ms
    fx = r.act({"type": "cut", "wire": r.wrong_wire()})
    assert kinds(fx) == [Touch, Emit, AddBrainrot] and fx[1].name == "toast" and fx[2].amount == brainrot.BOMB_STRIKE_PENALTY
    assert r.s.strikes == 1 and r.s.ends_ms == ends - bd.STRIKE_MS and r.s.left == (ends - bd.STRIKE_MS - r.clock.now_ms()) // 1000
    fx = r.solve_wires()
    assert kinds(fx) == [Touch, Emit] and "Cables" in fx[1].data["text"] and r.s.solved == ["wires"]
    assert r.act({"type": "cut", "wire": 0}) == []  # a defused module ignores more cuts


def test_button_tap_rule():
    r = Rig()
    r.s.button, r.s.batteries, r.s.serial = {"color": "azul", "label": "TUNG", "strip": "azul"}, 0, NO_VOWEL_EVEN
    assert r.tap_button(200)[0] == Touch() and "button" in r.s.solved


def test_button_tap_rule_held_too_long_is_a_strike():
    r = Rig()
    r.s.button, r.s.batteries, r.s.serial = {"color": "azul", "label": "TUNG", "strip": "azul"}, 0, NO_VOWEL_EVEN
    r.tap_button(bd.HOLD_MS + 100)
    assert r.s.strikes == 1 and "button" not in r.s.solved


def test_button_hold_rule_lights_the_strip_and_needs_the_right_digit():
    r = Rig()
    r.s.button, r.s.batteries, r.s.serial = {"color": "azul", "label": "ABORTAR", "strip": "azul"}, 0, NO_VOWEL_EVEN
    r.tap_button(300)  # released before the strip: wrong for a hold
    assert r.s.strikes == 1
    r.act({"type": "button", "down": True})
    assert r.p.view_player(r.s, r.s.defuser)["bomb"]["button"] == {"color": "azul", "label": "ABORTAR", "held": True, "strip": None}
    assert Touch() in r.tick_after(bd.HOLD_MS) and r.s.strip_on
    assert r.p.view_player(r.s, r.s.defuser)["bomb"]["button"]["strip"] == "azul"
    r.s.ends_ms = r.clock.now_ms() + 183_000  # 3:03 shows a 3
    r.act({"type": "button", "down": False})
    assert "button" in r.s.solved and r.s.strikes == 1


def test_button_hold_released_on_the_wrong_digit_is_a_strike():
    r = Rig()
    r.s.button, r.s.batteries, r.s.serial = {"color": "azul", "label": "ABORTAR", "strip": "amarillo"}, 0, NO_VOWEL_EVEN
    r.act({"type": "button", "down": True})
    r.tick_after(bd.HOLD_MS + 200)
    r.s.ends_ms = r.clock.now_ms() + 222_000  # 3:42: no 5
    r.act({"type": "button", "down": False})
    assert r.s.strikes == 1 and r.s.hold_since is None


def test_keypad_order_and_a_wrong_press_keeps_the_progress():
    r = Rig()
    first, second = r.s.keypad_order[0], r.s.keypad_order[1]
    assert r.act({"type": "key", "symbol": first}) == [Touch()]
    assert r.act({"type": "key", "symbol": r.s.keypad_order[2]})[0] == Touch() and r.s.strikes == 1
    assert r.s.pressed == [first]
    r.act({"type": "key", "symbol": second})
    r.act({"type": "key", "symbol": r.s.keypad_order[2]})
    fx = r.act({"type": "key", "symbol": r.s.keypad_order[3]})
    assert "keypad" in r.s.solved and kinds(fx) == [Touch, Emit]


def test_password_cycles_and_a_wrong_submit_is_a_strike():
    r = Rig()
    r.act({"type": "submit"})
    assert r.s.strikes == 1
    before = r.s.pos[0]
    r.act({"type": "letter", "col": 0, "dir": -1})
    assert r.s.pos[0] == (before - 1) % bd.LETTERS_PER_COLUMN
    r.solve_password()
    assert "password" in r.s.solved


def test_all_four_modules_complete_the_room():
    r = Rig()
    r.s.button, r.s.batteries, r.s.serial = {"color": "azul", "label": "TUNG", "strip": "azul"}, 0, NO_VOWEL_EVEN
    r.s.wires = ["rojo", "azul", "azul"]
    r.s.cut = [False] * 3
    r.solve_wires()
    r.tap_button()
    r.solve_keypad()
    fx = r.solve_password()
    assert kinds(fx) == [Emit, Complete] and fx[0].data["text"] == "¡Bomba desactivada!"


# --- clock, strikes, boom ------------------------------------------------------------------------------------------------
def test_the_clock_ticks_in_whole_seconds():
    r = Rig()
    assert r.tick_after(400) == []
    assert r.tick_after(700) == [Touch()] and r.s.left == bd.BOMB_MS // 1000 - 1


def test_three_strikes_blow_it_up_and_a_new_bomb_goes_to_the_next_player():
    r = Rig()
    epoch = r.s.epoch
    r.act({"type": "submit"})
    r.act({"type": "submit"})
    fx = r.act({"type": "submit"})
    assert r.s.phase == bd.PHASE_BOOM
    assert kinds(fx) == [Touch, Emit, AddBrainrot] and fx[1].name == "round_failed" and fx[1].data["title"] == "¡BUM!"
    assert fx[2].amount == brainrot.BOMB_BOOM_PENALTY
    with pytest.raises(ActionRejected) as ei:
        r.act({"type": "submit"})
    assert ei.value.code == "wrong_phase"
    assert r.tick_after(bd.BOOM_MS - 1) == []
    assert r.tick_after(1) == [Touch()]
    assert r.s.phase == bd.PHASE_ARMED and r.s.epoch == epoch + 1 and r.s.strikes == 0 and r.s.solved == []
    assert r.s.defuser == "p1"


def test_the_clock_running_out_blows_it_up():
    r = Rig()
    fx = r.tick_after(bd.BOMB_MS)
    assert r.s.phase == bd.PHASE_BOOM and r.s.left == 0 and any(isinstance(e, Emit) and e.name == "round_failed" for e in fx)


def test_penalties_are_capped_per_room():
    r = Rig()
    for _ in range(4):  # 4 bombs x (2 strikes + boom)
        for _ in range(3):
            r.act({"type": "submit"})
        r.tick_after(bd.BOOM_MS)
    assert r.s.penalty_total == brainrot.ROOM_PENALTY_CAP


# --- presence ---------------------------------------------------------------------------------------------------------------
def test_the_bomb_passes_on_when_the_artificiero_leaves():
    r = Rig()
    r.act({"type": "button", "down": True})
    r.players[0].connected = False
    assert r.p.on_presence(r.ctx, r.s) == [Touch()]
    assert r.s.defuser == "p1" and r.s.hold_since is None
    r.players[0].connected = True
    r.p.on_presence(r.ctx, r.s)
    assert r.s.defuser == "p1"  # coming back does not take the bomb back


# --- persistence / debug ---------------------------------------------------------------------------------------------------------
def test_serialize_roundtrip_and_peek():
    r = Rig()
    r.solve_wires()
    r.act({"type": "submit"})
    blob = json.loads(json.dumps(r.p.serialize(r.s), ensure_ascii=False))
    assert r.p.serialize(r.p.deserialize(blob)) == r.p.serialize(r.s)
    with pytest.raises((ValueError, KeyError)):
        r.p.deserialize({**blob, "wires": ["morado"] * 3})
    peek = r.p.debug_peek(r.s)
    assert r.s.word in peek and "Cables: corta el" in peek
