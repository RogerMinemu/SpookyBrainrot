"""Connection registry and per-connection view targeting (implements Notifier)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from fastapi import WebSocket

from app.web import protocol


@dataclass(eq=False)
class Conn:
    ws: WebSocket
    game_id: str
    role: str  # "tv" | "player"
    pid: Optional[str] = None


@dataclass
class Hub:
    conns: Dict[str, List[Conn]] = field(default_factory=dict)  # game_id -> connections

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
        for conn in list(self.conns.pop(game_id, [])):
            await self._send(conn, protocol.envelope("event", {"name": "game_deleted", "data": {}}))
            await self._close(conn, protocol.CLOSE_GAME_DELETED, "game_deleted")
