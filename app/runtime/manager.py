"""Live game registry: lazy load from SQLite, create/delete, join."""
from __future__ import annotations

import json
import secrets
import uuid
from random import Random
from typing import Dict, List, Mapping, Optional, Tuple

from app.core.clock import Clock
from app.core.engine import Engine, Join
from app.core.game import STATUS_LOBBY, Game, Player, normalize_name
from app.core.puzzle import Puzzle
from app.db.database import Database
from app.db.repos import GameRow, GamesRepo, HouseRepo, PlayersRepo
from app.runtime.runtime import GameRuntime, Notifier, NullNotifier

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"  # no I, L, O
CODE_LEN = 4


class GameManager:
    def __init__(
        self,
        db: Database,
        clock: Clock,
        rng: Random,
        puzzles: Optional[Mapping[str, Puzzle]] = None,
        notifier: Optional[Notifier] = None,
        min_players: int = 2,
    ) -> None:
        self.db = db
        self.games = GamesRepo(db)
        self.players = PlayersRepo(db)
        self.house = HouseRepo(db)
        self.clock = clock
        self.rng = rng
        self.puzzles: Mapping[str, Puzzle] = puzzles or {}
        self.notifier: Notifier = notifier or NullNotifier()
        self.engine = Engine(self.puzzles, clock, rng, min_players=min_players)
        self._live: Dict[str, GameRuntime] = {}

    def live(self) -> List[GameRuntime]:
        return list(self._live.values())

    def _runtime(self, game: Game) -> GameRuntime:
        return GameRuntime(
            game, self.games, self.clock, self.puzzles, self.notifier, self.engine, house=self.house
        )

    # --- lookup ----------------------------------------------------------
    def get(self, game_id: str) -> Optional[GameRuntime]:
        rt = self._live.get(game_id)
        if rt is not None:
            return rt
        row = self.games.get(game_id)
        if row is None:
            return None
        rt = self._load(row)
        self._live[game_id] = rt
        return rt

    def get_by_code(self, code: str) -> Optional[GameRuntime]:
        row = self.games.get_by_code(code.strip().upper())
        return self.get(row.id) if row else None

    def _load(self, row: GameRow) -> GameRuntime:
        players = [Player(p.id, p.name, False) for p in self.players.list_for_game(row.id)]
        game = Game.from_state(
            row.id, row.code, row.name, row.status, json.loads(row.state_json), players, self.puzzles
        )
        return self._runtime(game)

    def list_rows(self) -> List[GameRow]:
        return self.games.list()

    # --- create / delete -------------------------------------------------------
    def _new_code(self) -> str:
        for _ in range(1000):
            code = "".join(self.rng.choice(CODE_ALPHABET) for _ in range(CODE_LEN))
            if not self.games.code_in_use(code):
                return code
        raise RuntimeError("could not allocate a join code")

    def create(self, name: str) -> GameRuntime:
        game = Game(id=uuid.uuid4().hex[:12], code=self._new_code(), name=name)
        state = json.dumps(game.serialize_state(self.puzzles), separators=(",", ":"))
        self.games.create(game.id, game.code, game.name, STATUS_LOBBY, state, self.clock.now_ms())
        rt = self._runtime(game)
        self._live[game.id] = rt
        return rt

    async def delete(self, game_id: str) -> bool:
        if self.games.get(game_id) is None:
            return False
        self.games.delete(game_id)
        self._live.pop(game_id, None)
        await self.notifier.game_deleted(game_id)
        return True

    # --- join -------------------------------------------------------------------
    async def join(self, rt: GameRuntime, raw_name: str) -> Tuple[Player, str]:
        """Create a player in the game, or resume the one with the same name. Returns (player, token).

        A phone that lost its token (new browser, cleared cookies) types its name again and gets its old seat
        back instead of a duplicate; its other screen, if any, is replaced (4001) when this one connects.
        """
        token = secrets.token_urlsafe(24)
        found: List[Tuple[Player, str]] = []

        def mutate(g: Game):
            existing = g.player_named(raw_name)
            row = self.players.get(existing.id) if existing is not None else None
            if row is not None:
                found.append((existing, row.token))
                return False
            name = normalize_name(raw_name)
            pid = "p" + uuid.uuid4().hex[:10]
            self.players.create(pid, g.id, token, name, self.clock.now_ms())
            found.append((g.add_player(pid, name), token))
            return self.engine.apply(g, Join(pid))

        await rt.run(mutate)
        return found[0]

    def find_by_token(self, token: str) -> Optional[Tuple[GameRuntime, Player]]:
        row = self.players.get_by_token(token)
        if row is None:
            return None
        rt = self.get(row.game_id)
        if rt is None:
            return None
        player = rt.game.player(row.id)
        return (rt, player) if player else None


def valid_name(raw: str) -> bool:
    return bool(normalize_name(raw))
