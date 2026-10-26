"""Room 6, "Desactivad la bomba": Keep Talking and Nobody Explodes with the manual torn into pieces.

Rules:
- ONE connected phone, the artificiero, holds the bomb: only its view carries the bomb and only it can act on
  it. The TV shows the clock, the strikes and which modules are done, never the bomb itself.
- The manual is a set of PAGES (one rule block each) dealt round-robin, in a fresh shuffle per bomb, across the
  OTHER connected phones: the bigger the group, the thinner each share. Alone, the artificiero gets them all.
- Four modules: wires, button, keypad (brainrot symbols) and password. All four defused -> Complete.
- A mistake is a strike: STRIKE_MS off the clock and a small capped penalty. MAX_STRIKES strikes or the clock
  reaching zero -> BOOM (bigger capped penalty) and, after BOOM_MS, a brand new bomb for the next player.
- Every rule text lives next to the code that applies it (WIRE_RULES, BUTTON_RULES...), so the manual the
  phones read and the checks the server makes can never drift apart.
- Time runs on ctx.clock (tick); whole seconds left are mirrored into the state because views have no clock.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from random import Random
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from app.core import brainrot
from app.core.effects import AddBrainrot, Complete, Effect, Emit, Touch
from app.core.puzzle import ActionRejected, PuzzleCtx

BOMB_MS = 300_000
STRIKE_MS = 30_000
MAX_STRIKES = 3
BOOM_MS = 5000
HOLD_MS = 1000  # holding the button this long lights its strip
RELEASE_GRACE_MS = 700  # the phone shows the clock a little late: a release also counts against this much earlier

PHASE_ARMED = "armed"
PHASE_BOOM = "boom"

MODULES = ("wires", "button", "keypad", "password")
MODULE_TITLES = {"wires": "Cables", "button": "Botón", "keypad": "Símbolos", "password": "Contraseña"}

SERIAL_LETTERS = "ABCDEFGHJKLMNPRSTUVXZ"  # no I or O (they read as 1 and 0): the vowels are A, E and U
VOWELS = frozenset("AEU")
WIRE_COLORS = ("rojo", "azul", "amarillo", "blanco", "negro")
BUTTON_COLORS = ("rojo", "azul", "amarillo", "blanco")
BUTTON_LABELS = ("ABORTAR", "DETONAR", "MANTENER", "TUNG")
STRIP_DIGIT = {"azul": 3, "amarillo": 5, "rojo": 2, "blanco": 1}
STRIP_NAMES = {"azul": "azul", "amarillo": "amarilla", "rojo": "roja", "blanco": "blanca"}  # "la tira" is feminine
TAP, HOLD = "tap", "hold"

# Each column has 6 symbols and no two columns share more than 2, so any 4 symbols of a column fit no other one.
KEYPAD_COLUMNS: Tuple[Tuple[str, ...], ...] = (
    ("🦈", "👟", "🌵", "💣", "🍌", "👻"),
    ("☕", "🦈", "🧠", "🥁", "🌙", "🍌"),
    ("🐊", "🩰", "🧠", "👟", "💀", "⏰"),
    ("🐒", "⏰", "🌵", "🔥", "🩰", "🥁"),
    ("💀", "🐘", "🔥", "☕", "🐊", "🌙"),
)
PASSWORD_WORDS: Tuple[str, ...] = (
    "ANCLA", "BOMBA", "BRUJA", "CABLE", "CALMA", "CLAVO", "CUEVA", "FAROL", "FUEGO", "GOLPE",
    "GRITO", "HUESO", "LLAVE", "LUNAR", "MANTA", "MIEDO", "MONJA", "NIEVE", "NOCHE", "PISTA",
    "PLAZA", "RELOJ", "RUIDO", "SALTO", "SELVA", "SUELO", "SUSTO", "TIGRE", "TUMBA", "ZOMBI",
)
PASSWORD_LISTS = 3
PASSWORD_ALPHABET = "ABCDEFGHIJLMNOPRSTUVZ"
LETTERS_PER_COLUMN = 5

Colors = Sequence[str]


# --- rules: (manual text, applies(...), result) ---------------------------------------------------
def _count(colors: Colors, c: str) -> int:
    return sum(1 for x in colors if x == c)


def _last_of(colors: Colors, c: str) -> int:
    return max(i for i, x in enumerate(colors) if x == c)


def last_digit_odd(serial: str) -> bool:
    return int(serial[-1]) % 2 == 1


def has_vowel(serial: str) -> bool:
    return any(ch in VOWELS for ch in serial)


WireRule = Tuple[str, Callable[[Colors, str], bool], Callable[[Colors], int]]
ALWAYS = lambda *_: True  # noqa: E731

WIRE_RULES: Dict[int, List[WireRule]] = {
    3: [
        ("Si el primer cable es negro, corta el tercero.", lambda c, s: c[0] == "negro", lambda c: 2),
        ("Si no, si hay exactamente un cable amarillo, corta el cable amarillo.",
         lambda c, s: _count(c, "amarillo") == 1, lambda c: c.index("amarillo")),
        ("Si no, si el último dígito del número de serie es par, corta el primero.",
         lambda c, s: not last_digit_odd(s), lambda c: 0),
        ("Si no, corta el segundo.", ALWAYS, lambda c: 1),
    ],
    4: [
        ("Si hay más de un cable rojo y el último dígito del número de serie es impar, corta el último cable rojo.",
         lambda c, s: _count(c, "rojo") > 1 and last_digit_odd(s), lambda c: _last_of(c, "rojo")),
        ("Si no, si no hay ningún cable azul, corta el tercero.", lambda c, s: "azul" not in c, lambda c: 2),
        ("Si no, si el último cable es blanco, corta el primero.", lambda c, s: c[-1] == "blanco", lambda c: 0),
        ("Si no, corta el último.", ALWAYS, lambda c: len(c) - 1),
    ],
    5: [
        ("Si el último cable es negro y el número de serie tiene una vocal, corta el cuarto.",
         lambda c, s: c[-1] == "negro" and has_vowel(s), lambda c: 3),
        ("Si no, si hay exactamente un cable rojo y más de un cable amarillo, corta el primero.",
         lambda c, s: _count(c, "rojo") == 1 and _count(c, "amarillo") > 1, lambda c: 0),
        ("Si no, si no hay ningún cable negro, corta el segundo.", lambda c, s: "negro" not in c, lambda c: 1),
        ("Si no, corta el tercero.", ALWAYS, lambda c: 2),
    ],
    6: [
        ("Si no hay ningún cable amarillo y el último dígito del número de serie es impar, corta el tercero.",
         lambda c, s: "amarillo" not in c and last_digit_odd(s), lambda c: 2),
        ("Si no, si hay exactamente un cable amarillo y más de un cable blanco, corta el cuarto.",
         lambda c, s: _count(c, "amarillo") == 1 and _count(c, "blanco") > 1, lambda c: 3),
        ("Si no, si no hay ningún cable rojo, corta el último.", lambda c, s: "rojo" not in c, lambda c: 5),
        ("Si no, corta el cuarto.", ALWAYS, lambda c: 3),
    ],
}

ButtonRule = Tuple[str, Callable[[str, str, int, str], bool], str]  # (color, label, batteries, serial)
BUTTON_RULES: List[ButtonRule] = [
    ("Si el botón es azul y pone «ABORTAR», mantenlo pulsado.", lambda c, l, b, s: c == "azul" and l == "ABORTAR", HOLD),
    ("Si no, si hay más de una pila y el botón pone «DETONAR», pulsa y suelta enseguida.",
     lambda c, l, b, s: b > 1 and l == "DETONAR", TAP),
    ("Si no, si el botón es blanco y el número de serie tiene una vocal, mantenlo pulsado.",
     lambda c, l, b, s: c == "blanco" and has_vowel(s), HOLD),
    ("Si no, si hay más de dos pilas y el botón pone «TUNG», pulsa y suelta enseguida.",
     lambda c, l, b, s: b > 2 and l == "TUNG", TAP),
    ("Si no, si el botón es amarillo, mantenlo pulsado.", lambda c, l, b, s: c == "amarillo", HOLD),
    ("Si no, si el botón es rojo y pone «MANTENER», pulsa y suelta enseguida.",
     lambda c, l, b, s: c == "rojo" and l == "MANTENER", TAP),
    ("Si no, pulsa y suelta enseguida.", ALWAYS, TAP),
]


def wire_to_cut(colors: Colors, serial: str) -> int:
    for _, applies, target in WIRE_RULES[len(colors)]:
        if applies(colors, serial):
            return target(colors)
    raise AssertionError("the last wire rule always applies")


def button_action(color: str, label: str, batteries: int, serial: str) -> str:
    for _, applies, action in BUTTON_RULES:
        if applies(color, label, batteries, serial):
            return action
    raise AssertionError("the last button rule always applies")


def clock_text(seconds: int) -> str:
    seconds = max(0, seconds)
    return f"{seconds // 60}:{seconds % 60:02d}"


def release_ok(strip: str, remaining_ms: int) -> bool:
    """The strip digit must show on the clock (or on what it showed RELEASE_GRACE_MS ago)."""
    digit = str(STRIP_DIGIT[strip])
    shown = {clock_text(math.ceil(remaining_ms / 1000)), clock_text(math.ceil((remaining_ms + RELEASE_GRACE_MS) / 1000))}
    return any(digit in t for t in shown)


def password_matches(columns: Sequence[Sequence[str]]) -> List[str]:
    return [w for w in PASSWORD_WORDS if all(w[i] in columns[i] for i in range(len(columns)))]


# --- the manual --------------------------------------------------------------------------------------
def _password_lists() -> List[List[str]]:
    words = sorted(PASSWORD_WORDS)
    size = math.ceil(len(words) / PASSWORD_LISTS)
    return [words[i:i + size] for i in range(0, len(words), size)]


def manual_pages() -> List[dict]:
    """Every page of the manual, in reading order: {id, module, title, lines[, symbols][, words]}."""
    pages: List[dict] = []
    for n in sorted(WIRE_RULES):
        pages.append({
            "id": f"wires-{n}", "module": "wires", "title": f"Cables · si hay {n} cables",
            "lines": ["Los cables se cuentan de arriba abajo."] + [text for text, _, _ in WIRE_RULES[n]],
        })
    pages.append({
        "id": "button-press", "module": "button", "title": "Botón · ¿pulsar o mantener?",
        "lines": ["«Pulsa y suelta enseguida» es soltarlo antes de un segundo."] + [text for text, _, _ in BUTTON_RULES],
    })
    pages.append({
        "id": "button-strip", "module": "button", "title": "Botón · si lo mantienes pulsado",
        "lines": ["Al mantenerlo pulsado se enciende una tira de color. Suéltalo cuando el temporizador muestre "
                  "esta cifra en cualquier posición:"]
                 + [f"Tira {STRIP_NAMES[color]}: un {digit}." for color, digit in STRIP_DIGIT.items()]
                 + ["Si tocaba mantenerlo y lo sueltas antes de que salga la tira, cuenta como error."],
    })
    for i, col in enumerate(KEYPAD_COLUMNS):
        pages.append({
            "id": f"keypad-{i + 1}", "module": "keypad", "title": f"Símbolos · columna {i + 1}",
            "lines": ["Si los cuatro símbolos de la bomba están en esta columna, se pulsan en este orden, "
                      "de arriba abajo:"],
            "symbols": list(col),
        })
    lists = _password_lists()
    for i, words in enumerate(lists):
        pages.append({
            "id": f"password-{i + 1}", "module": "password", "title": f"Contraseña · lista {i + 1} de {len(lists)}",
            "lines": ["La contraseña es la única palabra de todas las listas que se puede formar con las letras "
                      "de la bomba. Luego, «Enviar»."],
            "words": words,
        })
    return pages


MANUAL: List[dict] = manual_pages()
PAGE_IDS: List[str] = [p["id"] for p in MANUAL]
_PAGE_BY_ID = {p["id"]: p for p in MANUAL}


def deal_pages(experts: List[str], order: List[str]) -> Dict[str, List[str]]:
    """Round-robin over `order`. Every page has a holder whenever there is at least one expert."""
    out: Dict[str, List[str]] = {pid: [] for pid in experts}
    for i, page in enumerate(order):
        if experts:
            out[experts[i % len(experts)]].append(page)
    return out


# --- bomb generation -------------------------------------------------------------------------------------
def make_serial(rng: Random) -> str:
    letter = lambda: rng.choice(SERIAL_LETTERS)  # noqa: E731
    digit = lambda: str(rng.randrange(10))  # noqa: E731
    return letter() + letter() + digit() + letter() + digit() + digit()  # always ends in a digit


def make_keypad(rng: Random) -> Tuple[List[str], List[int]]:
    """(4 symbols in display order, display indices in the order they must be pressed)."""
    col = KEYPAD_COLUMNS[rng.randrange(len(KEYPAD_COLUMNS))]
    symbols = rng.sample(list(col), 4)
    return symbols, sorted(range(4), key=lambda i: col.index(symbols[i]))


def make_password(rng: Random) -> Tuple[str, List[List[str]], List[int]]:
    """(word, letter columns, starting positions). Exactly one word of the lists fits the columns."""
    for _ in range(500):
        word = rng.choice(PASSWORD_WORDS)
        columns = []
        for ch in word:
            letters = {ch}
            while len(letters) < LETTERS_PER_COLUMN:
                letters.add(rng.choice(PASSWORD_ALPHABET))
            col = sorted(letters)
            rng.shuffle(col)
            columns.append(col)
        if password_matches(columns) == [word]:
            pos = [rng.randrange(LETTERS_PER_COLUMN) for _ in columns]
            if "".join(c[p] for c, p in zip(columns, pos)) == word:
                pos[0] = (pos[0] + 1) % LETTERS_PER_COLUMN
            return word, columns, pos
    raise AssertionError("could not build a password with a single answer")


@dataclass
class BombState:
    names: Dict[str, str] = field(default_factory=dict)
    connected: List[str] = field(default_factory=list)  # as of the last presence check, join order
    roster: List[str] = field(default_factory=list)  # fallback crew when nobody is connected (debug jumps)
    bombs: int = 0  # bombs handed out so far: picks the next artificiero
    defuser: Optional[str] = None
    phase: str = PHASE_ARMED
    since_ms: int = 0  # start of the BOOM
    ends_ms: int = 0
    left: int = BOMB_MS // 1000
    strikes: int = 0
    serial: str = "AA0A00"
    batteries: int = 0
    wires: List[str] = field(default_factory=list)
    cut: List[bool] = field(default_factory=list)
    button: Dict[str, str] = field(default_factory=dict)  # color, label, strip
    hold_since: Optional[int] = None
    strip_on: bool = False
    keypad: List[str] = field(default_factory=list)
    keypad_order: List[int] = field(default_factory=list)
    pressed: List[int] = field(default_factory=list)
    word: str = ""
    columns: List[List[str]] = field(default_factory=list)
    pos: List[int] = field(default_factory=list)
    solved: List[str] = field(default_factory=list)
    pages: List[str] = field(default_factory=list)  # page order for this bomb (dealt round-robin)
    penalty_total: float = 0.0
    epoch: int = 0


class BombDefusal:
    id = "bomb_defusal"
    title = "Desactivad la bomba"
    min_players = 1

    # --- helpers ---------------------------------------------------------------------
    @staticmethod
    def _sync(ctx: PuzzleCtx, s: BombState) -> None:
        for p in ctx.players:
            s.names[p.id] = p.name
        s.connected = [p.id for p in ctx.players if p.connected]

    @staticmethod
    def _crew(s: BombState) -> List[str]:
        return s.connected or s.roster

    def _experts(self, s: BombState) -> List[str]:
        return [pid for pid in self._crew(s) if pid != s.defuser]

    def _new_bomb(self, ctx: PuzzleCtx, s: BombState) -> None:
        rng = ctx.rng
        crew = self._crew(s)
        s.defuser = crew[s.bombs % len(crew)] if crew else None
        s.serial = make_serial(rng)
        s.batteries = rng.randint(0, 4)
        s.wires = [rng.choice(WIRE_COLORS) for _ in range(rng.randint(3, 6))]
        s.cut = [False] * len(s.wires)
        s.button = {"color": rng.choice(BUTTON_COLORS), "label": rng.choice(BUTTON_LABELS),
                    "strip": rng.choice(list(STRIP_DIGIT))}
        s.hold_since, s.strip_on = None, False
        s.keypad, s.keypad_order = make_keypad(rng)
        s.pressed = []
        s.word, s.columns, s.pos = make_password(rng)
        s.solved, s.strikes = [], 0
        s.pages = rng.sample(PAGE_IDS, len(PAGE_IDS))
        s.phase, s.since_ms = PHASE_ARMED, ctx.clock.now_ms()
        s.ends_ms = ctx.clock.now_ms() + BOMB_MS
        s.left = BOMB_MS // 1000
        s.epoch += 1

    def _penalty(self, s: BombState, amount: float, reason: str) -> List[Effect]:
        amount = brainrot.capped(s.penalty_total, amount, brainrot.ROOM_PENALTY_CAP)
        s.penalty_total += amount
        return [AddBrainrot(amount, reason)] if amount > 0 else []

    def _boom(self, ctx: PuzzleCtx, s: BombState) -> List[Effect]:
        s.phase, s.since_ms = PHASE_BOOM, ctx.clock.now_ms()
        s.hold_since, s.strip_on, s.left = None, False, max(0, s.left)
        fx = self._penalty(s, brainrot.BOMB_BOOM_PENALTY, "bomb_boom")
        amount = fx[0].amount if fx else 0.0
        return [
            Touch(),
            Emit("round_failed", {"penalty": amount, "title": "¡BUM!",
                                  "text": "La bomba ha explotado. Bombardiro ya trae otra..."}, "all"),
            *fx,
        ]

    def _strike(self, ctx: PuzzleCtx, s: BombState, module: str) -> List[Effect]:
        s.strikes += 1
        s.ends_ms -= STRIKE_MS
        now = ctx.clock.now_ms()
        if s.strikes >= MAX_STRIKES or s.ends_ms <= now:
            return self._boom(ctx, s)
        s.left = math.ceil((s.ends_ms - now) / 1000)
        text = f"¡Fallo en {MODULE_TITLES[module].lower()}! El reloj pierde {STRIKE_MS // 1000} s."
        return [Touch(), Emit("toast", {"text": text}, "all"), *self._penalty(s, brainrot.BOMB_STRIKE_PENALTY, "bomb_strike")]

    def _defuse(self, s: BombState, module: str) -> List[Effect]:
        s.solved.append(module)
        if all(m in s.solved for m in MODULES):
            return [Emit("toast", {"text": "¡Bomba desactivada!"}, "all"), Complete()]
        return [Touch(), Emit("toast", {"text": f"Módulo desactivado: {MODULE_TITLES[module]}."}, "all")]

    @staticmethod
    def _int(action: dict, key: str, lo: int, hi: int) -> int:
        v = action.get(key)
        if not isinstance(v, int) or isinstance(v, bool) or not lo <= v < hi:
            raise ActionRejected("bad_action", f"{key} fuera de rango")
        return v

    # --- Puzzle protocol ---------------------------------------------------------------
    def start(self, ctx: PuzzleCtx, player_ids: List[str]) -> BombState:
        s = BombState(roster=list(player_ids))
        self._sync(ctx, s)
        self._new_bomb(ctx, s)
        return s

    def handle(self, ctx: PuzzleCtx, s: BombState, pid: str, action: dict) -> List[Effect]:
        kind = action.get("type")
        if kind not in ("cut", "button", "key", "letter", "submit"):
            raise ActionRejected("bad_action", "acción desconocida")
        if s.phase != PHASE_ARMED:
            raise ActionRejected("wrong_phase", "la bomba ya ha explotado")
        if pid != s.defuser:
            raise ActionRejected("not_defuser", "solo el artificiero puede tocar la bomba")
        now = ctx.clock.now_ms()

        if kind == "cut":
            wire = self._int(action, "wire", 0, len(s.wires))
            if "wires" in s.solved or s.cut[wire]:
                return []
            s.cut[wire] = True
            if wire == wire_to_cut(s.wires, s.serial):
                return self._defuse(s, "wires")
            return self._strike(ctx, s, "wires")

        if kind == "button":
            down = action.get("down")
            if not isinstance(down, bool):
                raise ActionRejected("bad_action", "se esperaba {type: button, down: bool}")
            if "button" in s.solved:
                return []
            if down:
                if s.hold_since is not None:
                    return []
                s.hold_since, s.strip_on = now, False
                return [Touch()]
            if s.hold_since is None:
                return []
            held = now - s.hold_since
            s.hold_since, s.strip_on = None, False
            rule = button_action(s.button["color"], s.button["label"], s.batteries, s.serial)
            if rule == TAP:
                ok = held < HOLD_MS
            else:
                ok = held >= HOLD_MS and release_ok(s.button["strip"], s.ends_ms - now)
            return self._defuse(s, "button") if ok else self._strike(ctx, s, "button")

        if kind == "key":
            sym = self._int(action, "symbol", 0, len(s.keypad))
            if "keypad" in s.solved or sym in s.pressed:
                return []
            if sym != s.keypad_order[len(s.pressed)]:
                return self._strike(ctx, s, "keypad")
            s.pressed.append(sym)
            return self._defuse(s, "keypad") if len(s.pressed) == len(s.keypad) else [Touch()]

        if "password" in s.solved:
            return []
        if kind == "letter":
            col = self._int(action, "col", 0, len(s.columns))
            step = action.get("dir")
            if isinstance(step, bool) or step not in (1, -1):
                raise ActionRejected("bad_action", "dir debe ser 1 o -1")
            s.pos[col] = (s.pos[col] + step) % len(s.columns[col])
            return [Touch()]
        # submit
        if "".join(c[p] for c, p in zip(s.columns, s.pos)) == s.word:
            return self._defuse(s, "password")
        return self._strike(ctx, s, "password")

    def on_presence(self, ctx: PuzzleCtx, s: BombState) -> List[Effect]:
        before = (list(s.connected), s.defuser, dict(s.names))
        self._sync(ctx, s)
        if s.connected and s.defuser not in s.connected:
            # the artificiero left: the next connected player (join order) takes the bomb as it is
            order = [p.id for p in ctx.players]
            start = order.index(s.defuser) + 1 if s.defuser in order else 0
            s.defuser = next(pid for pid in order[start:] + order[:start] if pid in s.connected)
            s.hold_since, s.strip_on = None, False
        return [Touch()] if (s.connected, s.defuser, s.names) != before else []

    def tick(self, ctx: PuzzleCtx, s: BombState) -> List[Effect]:
        now = ctx.clock.now_ms()
        if s.phase == PHASE_BOOM:
            if now - s.since_ms < BOOM_MS:
                return []
            s.bombs += 1
            self._sync(ctx, s)
            self._new_bomb(ctx, s)
            return [Touch()]
        if now >= s.ends_ms:
            s.left = 0
            return self._boom(ctx, s)
        changed = False
        left = math.ceil((s.ends_ms - now) / 1000)
        if left != s.left:
            s.left, changed = left, True
        if s.hold_since is not None and not s.strip_on and now - s.hold_since >= HOLD_MS:
            s.strip_on, changed = True, True
        return [Touch()] if changed else []

    # --- views -----------------------------------------------------------------------------
    def _common(self, s: BombState) -> dict:
        return {
            "kind": self.id,
            "phase": s.phase,
            "left": s.left,
            "clock": clock_text(s.left),
            "strikes": s.strikes,
            "max_strikes": MAX_STRIKES,
            "strike_s": STRIKE_MS // 1000,
            "modules": [{"id": m, "title": MODULE_TITLES[m], "solved": m in s.solved} for m in MODULES],
            "defuser": s.names.get(s.defuser or "", ""),
            "epoch": s.epoch,
        }

    def view_tv(self, s: BombState) -> dict:
        view = self._common(s)  # never the bomb itself: only the artificiero's phone has it
        dealt = deal_pages(self._experts(s), s.pages)
        view["experts"] = [{"name": s.names.get(pid, ""), "pages": len(dealt[pid])} for pid in self._experts(s)]
        return view

    def _bomb_view(self, s: BombState) -> dict:
        return {
            "serial": f"{s.serial[:3]}-{s.serial[3:]}",
            "batteries": s.batteries,
            "wires": [{"color": c, "cut": cut} for c, cut in zip(s.wires, s.cut)],
            "button": {
                "color": s.button["color"],
                "label": s.button["label"],
                "held": s.hold_since is not None,
                "strip": s.button["strip"] if s.strip_on else None,
            },
            "keypad": {"symbols": list(s.keypad), "pressed": list(s.pressed)},
            "password": {"letters": [c[p] for c, p in zip(s.columns, s.pos)]},
        }

    def view_player(self, s: BombState, pid: str) -> dict:
        view = self._common(s)
        defuser = pid == s.defuser
        experts = self._experts(s)
        view["role"] = "defuser" if defuser else "expert"
        view["bomb"] = self._bomb_view(s) if defuser else None
        if defuser and experts:
            mine: List[str] = []
        elif defuser:
            mine = list(PAGE_IDS)  # alone with the bomb: the whole manual
        else:
            mine = deal_pages(experts, s.pages).get(pid, [])
        view["manual"] = [dict(_PAGE_BY_ID[p]) for p in PAGE_IDS if p in mine]  # reading order
        view["experts"] = len(experts)
        return view

    def debug_peek(self, s: BombState) -> str:
        rule = button_action(s.button["color"], s.button["label"], s.batteries, s.serial)
        button = "pulsar y soltar" if rule == TAP else f"mantener, soltar con un {STRIP_DIGIT[s.button['strip']]}"
        keys = " ".join(s.keypad[i] for i in s.keypad_order)
        return (f"Cables: corta el {wire_to_cut(s.wires, s.serial) + 1}.º · Botón: {button} · "
                f"Símbolos: {keys} · Contraseña: {s.word}")

    # --- persistence --------------------------------------------------------------------------
    def serialize(self, s: BombState) -> dict:
        return {
            "v": 1,
            "names": dict(s.names),
            "connected": list(s.connected),
            "roster": list(s.roster),
            "bombs": s.bombs,
            "defuser": s.defuser,
            "phase": s.phase,
            "since_ms": s.since_ms,
            "ends_ms": s.ends_ms,
            "left": s.left,
            "strikes": s.strikes,
            "serial": s.serial,
            "batteries": s.batteries,
            "wires": list(s.wires),
            "cut": list(s.cut),
            "button": dict(s.button),
            "hold_since": s.hold_since,
            "strip_on": s.strip_on,
            "keypad": list(s.keypad),
            "keypad_order": list(s.keypad_order),
            "pressed": list(s.pressed),
            "word": s.word,
            "columns": [list(c) for c in s.columns],
            "pos": list(s.pos),
            "solved": list(s.solved),
            "pages": list(s.pages),
            "penalty_total": s.penalty_total,
            "epoch": s.epoch,
        }

    def deserialize(self, d: dict) -> BombState:
        wires = [str(c) for c in d["wires"]]
        if not 3 <= len(wires) <= 6 or any(c not in WIRE_COLORS for c in wires):
            raise ValueError("bad wires")
        button = {k: str(d["button"][k]) for k in ("color", "label", "strip")}
        if button["strip"] not in STRIP_DIGIT:
            raise ValueError("bad strip")
        columns = [[str(ch) for ch in col] for col in d["columns"]]
        pos = [int(p) % len(col) for p, col in zip(d["pos"], columns)]
        serial = str(d["serial"])
        if len(columns) != len(d["word"]) or len(pos) != len(columns) or not serial[-1:].isdigit():
            raise ValueError("bad password or serial")
        return BombState(
            names=dict(d.get("names", {})),
            connected=list(d.get("connected", [])),
            roster=list(d.get("roster", [])),
            bombs=int(d.get("bombs", 0)),
            defuser=d.get("defuser"),
            phase=d.get("phase") if d.get("phase") in (PHASE_ARMED, PHASE_BOOM) else PHASE_ARMED,
            since_ms=int(d.get("since_ms", 0)),
            ends_ms=int(d["ends_ms"]),
            left=int(d.get("left", 0)),
            strikes=int(d.get("strikes", 0)),
            serial=serial,
            batteries=int(d.get("batteries", 0)),
            wires=wires,
            cut=[bool(x) for x in d.get("cut", [False] * len(wires))][: len(wires)],
            button=button,
            hold_since=None,  # a hold never survives a restart
            strip_on=False,
            keypad=[str(x) for x in d["keypad"]],
            keypad_order=[int(x) for x in d["keypad_order"]],
            pressed=[int(x) for x in d.get("pressed", [])],
            word=str(d["word"]),
            columns=columns,
            pos=pos,
            solved=[m for m in d.get("solved", []) if m in MODULES],
            pages=[p for p in d.get("pages", []) if p in _PAGE_BY_ID] or list(PAGE_IDS),
            penalty_total=float(d.get("penalty_total", 0.0)),
            epoch=int(d.get("epoch", 0)),
        )
