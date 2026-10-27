"""Connection registry and per-connection view targeting (implements Notifier)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import WebSocket

from app.web import protocol
from app.web.realtime import FX_KIND, InputRelay, clean_mask


@dataclass(eq=False)
class Conn:
    ws: WebSocket
    game_id: str
    role: str  # "tv" | "player"
    pid: Optional[str] = None
    buckets: dict = field(default_factory=dict)  # realtime rate limiters, created lazily


@dataclass
class Hub:
    conns: Dict[str, List[Conn]] = field(default_factory=dict)  # game_id -> connections
    relay: InputRelay = field(default_factory=InputRelay)

    # --- registry ----------------------------------------------------------
    async def register(self, conn: Conn) -> None:
        """Add a connection; a second TV / same player's old socket gets closed (4001)."""
        existing = self.conns.setdefault(conn.game_id, [])
        stale = [
            c for c in existing
            if (conn.role == "tv" and c.role == "tv") or (conn.role == "player" and c.pid == conn.pid)
        ]
        for c in stale:
            existing.remove(c)
        existing.append(conn)
        for c in stale:
            await self._close(c, protocol.CLOSE_REPLACED, "replaced")

    def unregister(self, conn: Conn) -> None:
        lst = self.conns.get(conn.game_id)
        if lst and conn in lst:
            lst.remove(conn)
            if not lst:
                self.conns.pop(conn.game_id, None)

    def player_connected(self, game_id: str, pid: str) -> bool:
        return any(c.pid == pid for c in self.conns.get(game_id, []))

    def tv_count(self, game_id: str) -> int:
        return sum(1 for c in self.conns.get(game_id, []) if c.role == "tv")

    # --- sending -------------------------------------------------------------
    async def _send(self, conn: Conn, text: str) -> None:
        try:
            await conn.ws.send_text(text)
        except Exception:
            pass  # dead socket: the receive loop will clean it up

    async def _close(self, conn: Conn, code: int, reason: str) -> None:
        try:
            await conn.ws.close(code=code, reason=reason)
        except Exception:
            pass

    async def send_state(self, rt, conn: Conn) -> None:
        payload = rt.state_payload(conn.role, conn.pid)
        await self._send(conn, protocol.envelope("state", payload, rt.game.seq))

    # --- realtime lane (lock-free, never persisted) ---------------------------
    def _tvs(self, game_id: str) -> List[Conn]:
        return [c for c in self.conns.get(game_id, []) if c.role == "tv"]

    async def relay_input(self, conn: Conn, payload: dict) -> None:
        """Phone -> TV. The pid is stamped from the authenticated socket; the client's own is ignored."""
        if conn.role != "player" or conn.pid is None:
            return
        mask = clean_mask(payload.get("mask"))
        if mask is None or not self.relay.bucket(conn.buckets, "input").allow():
            return
        self.relay.set(conn.game_id, conn.pid, mask)
        await self._to_tvs(conn.game_id, {"pid": conn.pid, "mask": mask})

    async def _to_tvs(self, game_id: str, data: dict) -> None:
        await self.to_tvs(game_id, "input", data)

    async def to_tvs(self, game_id: str, t: str, data: dict) -> None:
        text = protocol.envelope(t, data)
        for tv in self._tvs(game_id):
            await self._send(tv, text)

    async def zero_input(self, game_id: str, pid: str) -> None:
        """Player gone: forget the held mask and tell the TV {pid, 0}."""
        if self.relay.zero(game_id, pid):
            await self._to_tvs(game_id, {"pid": pid, "mask": 0})

    async def replay_inputs(self, conn: Conn) -> None:
        """A (re)connected TV gets the last known masks of the players that are connected."""
        connected = [c.pid for c in self.conns.get(conn.game_id, []) if c.pid]
        for pid, mask in self.relay.replay(conn.game_id, connected):
            await self._send(conn, protocol.envelope("input", {"pid": pid, "mask": mask}))

    async def relay_fx(self, conn: Conn, payload: dict) -> None:
        """TV -> phones: {to: pid|"all", kind, data?}."""
        if conn.role != "tv" or not self.relay.bucket(conn.buckets, "fx").allow():
            return
        kind, to, data = payload.get("kind"), payload.get("to", "all"), payload.get("data")
        if not isinstance(kind, str) or not FX_KIND.match(kind) or not isinstance(to, str):
            return
        out = {"kind": kind}
        if data is not None:
            out["data"] = data
        text = protocol.envelope("fx", out)
        for c in list(self.conns.get(conn.game_id, [])):
            if c.role == "player" and (to == "all" or c.pid == to):
                await self._send(c, text)

    async def relay_story(self, conn: Conn, payload: dict) -> None:
        """Phone -> TV: the reader pressed "Siguiente" for {key, scene, beat}. The pid comes from the socket; the TV
        checks it is the reader of the line it shows (anything stale or from somebody else is ignored there)."""
        if conn.role != "player" or conn.pid is None or not self.relay.bucket(conn.buckets, "story").allow():
            return
        key, scene, beat = payload.get("key"), payload.get("scene"), payload.get("beat")
        if not isinstance(key, str) or not isinstance(scene, str) or isinstance(beat, bool) or not isinstance(beat, int):
            return
        await self.to_tvs(conn.game_id, "story", {"pid": conn.pid, "key": key[:64], "scene": scene[:64], "beat": beat})

    def sim_allowed(self, conn: Conn) -> bool:
        """Role + rate gate for TV sim reports (the action itself goes through the runtime)."""
        return conn.role == "tv" and self.relay.bucket(conn.buckets, "sim").allow()

    # --- Notifier port ---------------------------------------------------------
    async def broadcast_state(self, rt) -> None:
        for conn in list(self.conns.get(rt.game.id, [])):
            await self.send_state(rt, conn)

    async def send_event(self, rt, name: str, data: dict, to: str) -> None:
        text = protocol.envelope("event", {"name": name, "data": data}, rt.game.seq)
        for conn in list(self.conns.get(rt.game.id, [])):
            if to == "all" or (to == "tv" and conn.role == "tv") or conn.pid == to:
                await self._send(conn, text)

    async def game_deleted(self, game_id: str) -> None:
        self.relay.drop_game(game_id)
        for conn in list(self.conns.pop(game_id, [])):
            await self._send(conn, protocol.envelope("event", {"name": "game_deleted", "data": {}}))
            await self._close(conn, protocol.CLOSE_GAME_DELETED, "game_deleted")
