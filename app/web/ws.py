"""The single /ws endpoint: hello -> welcome + state, ping/pong, presence."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.engine import Advance, PuzzleAction, Scan
from app.web import protocol
from app.web.hub import Conn
from app.web.realtime import MAX_FRAME_BYTES, frame_ok
from app.web.routes_admin import is_admin_player
from app.web.routes_api import COOKIE_NAME
from app.web.routes_pages import scan_cameo

router = APIRouter()
log = logging.getLogger("spooky.ws")

DEFAULT_HELLO_TIMEOUT = 5.0
MAX_TOKEN_LEN = 64
SCAN_UNKNOWN = "unknown"
# What the admin player's phone may ask the TV to do (the game itself goes through the debug API).
TV_ADMIN_ACTIONS = ("story_skip", "tv_refresh")


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
        token = hello.get("player_token")
        if not token and hello.get("seat") is not True:  # demo seats never fall back to the shared cookie
            token = ws.cookies.get(COOKIE_NAME)
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
        welcome.update(player_id=player.id, name=player.name, admin=is_admin_player(app.state.settings, player.name))
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
        if role == "tv":
            await hub.replay_inputs(conn)
        await _receive_loop(ws, rt, conn, hub)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("ws handler crashed")
    finally:
        hub.unregister(conn)
        if manager.get(rt.game.id) is rt:
            try:
                if player and not hub.player_connected(rt.game.id, player.id):
                    await hub.zero_input(rt.game.id, player.id)
                    await rt.set_presence(player.id, False)
                elif role == "tv":
                    await rt.set_tv_presence(hub.tv_count(rt.game.id))
            except Exception:
                log.exception("presence update failed")


async def _receive_loop(ws: WebSocket, rt, conn: Conn, hub) -> None:
    while True:
        raw = await ws.receive_text()
        if len(raw) > MAX_FRAME_BYTES:  # oversize: dropped before parsing, socket kept
            continue
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
        elif t == "scan":  # in-app QR camera: the same outcomes as /k/<token>, answered to this phone only
            if conn.pid is None:
                await ws.send_text(protocol.error_envelope("not_player", "only players scan", rt.game.seq))
                continue
            reply = await _scan(ws.app.state, rt, payload.get("token"))
            await ws.send_text(protocol.envelope("scan", reply, rt.game.seq))
        elif t == "admin":  # admin phone -> TV: skip the cutscene, re-mount the screen
            player = rt.game.player(conn.pid) if conn.pid is not None else None
            if player is None or not is_admin_player(ws.app.state.settings, player.name):
                await ws.send_text(protocol.error_envelope("not_admin", "solo el admin puede hacer esto", rt.game.seq))
                continue
            action = payload.get("action")
            if action not in TV_ADMIN_ACTIONS:
                await ws.send_text(protocol.error_envelope("unknown_action", f"acción desconocida: {action!r}", rt.game.seq))
                continue
            await hub.to_tvs(rt.game.id, "admin", {"action": action})
        elif t == "input":  # realtime lane: no lock, no persist
            if frame_ok(t, raw):
                await hub.relay_input(conn, payload)
        elif t == "fx":
            if frame_ok(t, raw):
                await hub.relay_fx(conn, payload)
        elif t == "sim":  # TV outcome report: epoch-guarded TvAction under the lock
            if frame_ok(t, raw) and hub.sim_allowed(conn):
                out = await rt.tv_action(payload)
                await _reply_error(ws, rt, out)
        else:
            await ws.send_text(protocol.error_envelope("unknown_type", f"unsupported message {t}", rt.game.seq))


async def _scan(state, rt, token) -> dict:
    """The phone already belongs to rt's game, so no game resolution: just the token -> Scan."""
    entry = state.qr_repo.get(token) if isinstance(token, str) and 0 < len(token) <= MAX_TOKEN_LEN else None
    if entry is None:
        return {"result": SCAN_UNKNOWN}
    out = await rt.apply(Scan(kind=entry["kind"], idx=entry["idx"]))
    return {"result": out.scan_result, "cameo": scan_cameo(entry)}


async def _reply_error(ws: WebSocket, rt, out) -> None:
    if out.error is not None:
        code, message = out.error
        await ws.send_text(protocol.error_envelope(code, message, rt.game.seq))
