"""The single /ws endpoint: hello -> welcome + state, ping/pong, presence."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.engine import Advance, PuzzleAction
from app.web import protocol
from app.web.hub import Conn
from app.web.routes_api import COOKIE_NAME

router = APIRouter()
log = logging.getLogger("spooky.ws")

DEFAULT_HELLO_TIMEOUT = 5.0


async def _read_hello(ws: WebSocket, timeout: float) -> Optional[dict]:
    """Wait for a valid hello. Malformed frames get an error but keep the socket open."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while True:
        remaining = deadline - loop.time()
        if remaining <= 0:
            await ws.close(code=protocol.CLOSE_HELLO_TIMEOUT, reason="hello timeout")
            return None
        try:
            raw = await asyncio.wait_for(ws.receive_text(), remaining)
        except asyncio.TimeoutError:
            await ws.close(code=protocol.CLOSE_HELLO_TIMEOUT, reason="hello timeout")
            return None
        try:
            t, payload = protocol.parse(raw)
        except protocol.BadVersion:
            await ws.close(code=protocol.CLOSE_BAD_VERSION, reason="bad version")
            return None
        except protocol.Malformed as e:
            await ws.send_text(protocol.error_envelope("malformed", str(e)))
            continue
        if t != "hello":
            await ws.send_text(protocol.error_envelope("hello_required", "send hello first"))
            continue
        return payload


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    app = ws.app
    manager = app.state.manager
    hub = app.state.hub
    await ws.accept()

    hello = await _read_hello(ws, getattr(app.state, "hello_timeout", DEFAULT_HELLO_TIMEOUT))
    if hello is None:
        return

    role = hello.get("role")
    rt = None
    player = None
    if role == "tv":
        game_id = hello.get("game_id")
        rt = manager.get(game_id) if isinstance(game_id, str) else None
    elif role == "player":
        token = hello.get("player_token") or ws.cookies.get(COOKIE_NAME)
        found = manager.find_by_token(token) if isinstance(token, str) and token else None
        if found:
            rt, player = found
    else:
        await ws.send_text(protocol.error_envelope("bad_role", "role must be tv or player"))
        await ws.close(code=protocol.CLOSE_BAD_VERSION, reason="bad role")
        return
    if rt is None:
        await ws.close(code=protocol.CLOSE_NOT_FOUND, reason="not found")
        return

    conn = Conn(ws=ws, game_id=rt.game.id, role=role, pid=player.id if player else None)
    welcome = {"role": role, "game_id": rt.game.id}
    if player:
        welcome.update(player_id=player.id, name=player.name)
    await ws.send_text(protocol.envelope("welcome", welcome, rt.game.seq))
    await hub.register(conn)

    try:
        changed = False
        if player:
            changed = bool(await rt.set_presence(player.id, True))
        elif role == "tv":
            changed = bool(await rt.set_tv_presence(hub.tv_count(rt.game.id)))
        if not changed:
            await hub.send_state(rt, conn)
        await _receive_loop(ws, rt, conn)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("ws handler crashed")
    finally:
        hub.unregister(conn)
        if manager.get(rt.game.id) is rt:
            try:
                if player and not hub.player_connected(rt.game.id, player.id):
                    await rt.set_presence(player.id, False)
                elif role == "tv":
                    await rt.set_tv_presence(hub.tv_count(rt.game.id))
            except Exception:
                log.exception("presence update failed")


async def _receive_loop(ws: WebSocket, rt, conn: Conn) -> None:
    while True:
        raw = await ws.receive_text()
        try:
            t, payload = protocol.parse(raw)
        except protocol.BadVersion:
            await ws.close(code=protocol.CLOSE_BAD_VERSION, reason="bad version")
            return
        except protocol.Malformed as e:
            await ws.send_text(protocol.error_envelope("malformed", str(e), rt.game.seq))
            continue
        if t == "ping":
            await ws.send_text(protocol.envelope("pong", {}, rt.game.seq))
        elif t == "advance":
            out = await rt.apply(Advance(pid=conn.pid))
            await _reply_error(ws, rt, out)
        elif t == "puzzle":
            if conn.pid is None:  # identity is token-bound; the TV has no puzzle actions
                await ws.send_text(protocol.error_envelope("not_player", "only players act", rt.game.seq))
                continue
            out = await rt.apply(PuzzleAction(pid=conn.pid, data=payload))
            await _reply_error(ws, rt, out)
        else:
            await ws.send_text(protocol.error_envelope("unknown_type", f"unsupported message {t}", rt.game.seq))


async def _reply_error(ws: WebSocket, rt, out) -> None:
    if out.error is not None:
        code, message = out.error
        await ws.send_text(protocol.error_envelope(code, message, rt.game.seq))
