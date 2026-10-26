"""Async per-game shell: lock -> mutate (sync domain) -> persist -> push."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable, Dict, List, Mapping, Optional, Protocol

from random import Random

from app.content import RIDDLE_PLACEHOLDER
from app.core import brainrot
from app.core.clock import Clock
from app.core.engine import Engine, Outcome, Presence, Tick, TvAction, TvPresence
from app.core.game import (
    PHASE_INTRO,
    PHASE_SEARCH,
    PHASE_UNLOCKED,
    STATUS_FINISHED,
    STATUS_LOBBY,
    STATUS_RUNNING,
    Game,
)
from app.core.puzzle import Puzzle
from app.db.repos import GamesRepo, HouseRepo

CLOCK_FLUSH_MS = 10_000


class Notifier(Protocol):
    """Port implemented by the web hub."""

    async def broadcast_state(self, rt: "GameRuntime") -> None: ...

    async def send_event(self, rt: "GameRuntime", name: str, data: dict, to: str) -> None: ...

    async def game_deleted(self, game_id: str) -> None: ...


class NullNotifier:
    async def broadcast_state(self, rt: "GameRuntime") -> None:
        pass

    async def send_event(self, rt: "GameRuntime", name: str, data: dict, to: str) -> None:
        pass

    async def game_deleted(self, game_id: str) -> None:
        pass


async def run_ticker(manager: Any, interval: float) -> None:
    """Background loop: tick every live game (4 Hz by default). Off in tests."""
    log = logging.getLogger("spooky.ticker")
    while True:
        await asyncio.sleep(interval)
        for rt in manager.live():
            if rt.game.status != STATUS_RUNNING:
                continue
            try:
                await rt.tick()
            except Exception:
                log.exception("tick failed for game %s", rt.game.id)


class GameRuntime:
    def __init__(
        self,
        game: Game,
        games_repo: GamesRepo,
        clock: Clock,
        puzzles: Mapping[str, Puzzle],
        notifier: Notifier,
        engine: Optional[Engine] = None,
        house: Optional[HouseRepo] = None,
    ) -> None:
        self.house = house
        self.game = game
        self.games_repo = games_repo
        self.clock = clock
        self.puzzles = puzzles
        self.notifier = notifier
        self.engine = engine or Engine(puzzles, clock, Random())
        self.lock = asyncio.Lock()  # R2.8: one command at a time per game
        self._last_flush_ms = clock.now_ms()

    # --- mutation entry point -------------------------------------------
    async def run(self, mutate: Callable[[Game], Any]) -> Any:
        """Run a sync domain mutation under the lock.

        `mutate(game)` returns either a bool (changed) or an object with
        `.changed` and optionally `.events` as (name, data, to) tuples.
        On change: seq += 1, snapshot persisted, state pushed to everyone.
        """
        async with self.lock:
            result = mutate(self.game)
            changed = bool(getattr(result, "changed", result))
            events: List[tuple] = list(getattr(result, "events", []) or [])
            if changed:
                self.game.seq += 1
                self.persist()  # R3.7: save after every accepted command
            elif getattr(result, "persist", False):
                self.persist()
            if changed or getattr(result, "broadcast", False):
                await self.notifier.broadcast_state(self)  # `broadcast` alone pushes without bumping seq
            for name, data, to in events:
                await self.notifier.send_event(self, name, data, to)
            return result

    def persist(self) -> None:
        g = self.game
        state = json.dumps(g.serialize_state(self.puzzles), separators=(",", ":"))
        self.games_repo.save_state(g.id, g.status, state, self.clock.now_ms())
        self._last_flush_ms = self.clock.now_ms()

    # --- engine commands -----------------------------------------------------
    async def apply(self, cmd: Any) -> Outcome:
        return await self.run(lambda g: self.engine.apply(g, cmd))

    async def tv_action(self, data: dict) -> Outcome:
        """TV-reported sim outcome: same lock -> mutate -> persist -> broadcast path as any command."""
        return await self.apply(TvAction(data))

    async def set_presence(self, pid: str, connected: bool) -> bool:
        out = await self.apply(Presence(pid, connected))
        return out.changed

    async def set_tv_presence(self, count: int) -> bool:
        out = await self.apply(TvPresence(count))
        return out.changed or out.broadcast  # True = the state was already pushed to everyone

    async def tick(self) -> Outcome:
        """Ticker entry point: engine Tick plus a periodic clock flush (R3.4)."""

        def mutate(g: Game) -> Outcome:
            out = self.engine.apply(g, Tick())
            if (
                g.status == STATUS_RUNNING
                and g.tv_connected > 0
                and self.clock.now_ms() - self._last_flush_ms >= CLOCK_FLUSH_MS
            ):
                out.persist = True
            return out

        return await self.run(mutate)

    # --- views -------------------------------------------------------------
    def riddle_for(self, anchor: Optional[int]) -> str:
        """House-config riddle for an anchor, or the placeholder when missing (R7.7)."""
        if self.house is not None and anchor is not None:
            cfg = self.house.all().get(anchor)
            if cfg and (cfg.get("riddle") or "").strip():
                return cfg["riddle"].strip()
        return RIDDLE_PLACEHOLDER

    def state_payload(self, role: str, pid: Optional[str] = None) -> Dict[str, Any]:
        """Per-viewer state. Private data of other players never enters here."""
        g = self.game
        game_part: Dict[str, Any] = {
            "id": g.id,
            "name": g.name,
            "status": g.status,
            "room_no": g.room_no,
            "phase": g.phase,
            "brainrot": g.brainrot,
            "band": brainrot.band(g.brainrot),
            "degradation": brainrot.degradation_level(g.brainrot),
            "clock_ms": g.clock_ms,
            "tv_online": g.tv_connected > 0,
            "players": [{"id": p.id, "name": p.name, "connected": p.connected} for p in g.players],
        }
        if role == "tv":
            game_part["code"] = g.code
        if g.phase == PHASE_SEARCH:
            game_part["riddle"] = self.riddle_for(g.room.anchor)
        if g.ending is not None:
            game_part["ending"] = dict(g.ending)
        view: Dict[str, Any]
        if g.puzzle_id is not None and g.puzzle_state is not None:
            puzzle = self.puzzles[g.puzzle_id]
            view = puzzle.view_tv(g.puzzle_state) if role == "tv" else puzzle.view_player(g.puzzle_state, pid or "")
        elif g.status == STATUS_FINISHED:
            view = {
                "kind": "ending",
                "band": (g.ending or {}).get("band") or brainrot.band(g.brainrot),
                "brainrot": g.brainrot,
                "clock_ms": g.clock_ms,
            }
        elif g.status == STATUS_LOBBY:
            view = {"kind": "lobby"}
        elif g.phase == PHASE_INTRO:
            view = {"kind": "intro", "room_no": g.room_no, "title": g.room.title}
        elif g.phase == PHASE_SEARCH:
            view = {"kind": "search", "anchor": g.room.anchor}
        elif g.phase == PHASE_UNLOCKED:
            view = {"kind": "unlocked", "room_no": g.room_no}
        else:
            view = {"kind": "idle"}
        return {"game": game_part, "view": view}
