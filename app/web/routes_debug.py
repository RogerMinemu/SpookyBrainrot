"""Host debug toggle: jump between rooms/phases, set Brainrot, fire test events.

Everything lives under /admin/*, so the ADMIN_KEY middleware protects it. The routes only translate HTTP
to engine commands (DebugJump & co.); the engine validates and stays the single source of truth.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import ROOT_DIR
from app.content import CAMEOS
from app.core import brainrot
from app.core.engine import (
    DEBUG_EVENTS,
    DEBUG_ROOM_ENDING,
    DEBUG_ROOM_LOBBY,
    DebugComplete,
    DebugEvent,
    DebugJump,
    DebugReset,
    DebugSetBrainrot,
)
from app.core.game import STATUS_FINISHED, STATUS_LOBBY, resolve_room
from app.web.routes_admin import NO_CACHE

router = APIRouter()
PRESETS = [0, 20, 40, 60, 80, 100]


class JumpBody(BaseModel):
    room: Any
    phase: Optional[str] = None
    level: Any = None  # 0-based sub-level (platformer level, Sahur round); the engine validates it


class BrainrotBody(BaseModel):
    value: Any


class EventBody(BaseModel):
    name: str
    cameo: Optional[str] = None


def _room_key(status: str, room_no: int) -> Any:
    if status == STATUS_LOBBY:
        return DEBUG_ROOM_LOBBY
    if status == STATUS_FINISHED:
        return DEBUG_ROOM_ENDING
    return room_no


def _info(rt, hub) -> Dict[str, Any]:
    g = rt.game
    return {
        "id": g.id,
        "name": g.name,
        "code": g.code,
        "status": g.status,
        "room": _room_key(g.status, g.room_no),
        "room_no": g.room_no,
        "phase": g.phase,
        "brainrot": g.brainrot,
        "degradation": brainrot.degradation_level(g.brainrot),
        "seq": g.seq,
        "players": len(g.players),
        "tv": hub.tv_count(g.id) > 0,
    }


def _get(request: Request, game_id: str):
    rt = request.app.state.manager.get(game_id)
    if rt is None:
        raise HTTPException(status_code=404, detail="game not found")
    return rt


async def _run(request: Request, game_id: str, cmd: Any) -> Dict[str, Any]:
    rt = _get(request, game_id)
    out = await rt.apply(cmd)
    if out.error is not None:
        code, message = out.error
        raise HTTPException(status_code=422, detail=message or code)
    return _info(rt, request.app.state.hub)


@router.get("/admin/debug")
async def debug_page() -> FileResponse:
    return FileResponse(ROOT_DIR / "static" / "debug.html", media_type="text/html", headers=NO_CACHE)


@router.get("/admin/demo")
async def demo_page() -> FileResponse:
    return FileResponse(ROOT_DIR / "static" / "demo.html", media_type="text/html", headers=NO_CACHE)


@router.get("/admin/api/anchors")
async def demo_anchors(request: Request) -> Dict[str, Any]:
    """Anchor tokens by level, so the demo bots can hit the real /k/<token> scan route. Host-only (spoiler)."""
    entries = request.app.state.qr_repo.entries()
    return {"anchors": {str(e.idx): e.token for e in entries if e.kind == "anchor"}}


@router.get("/admin/api/games")
async def debug_games(request: Request) -> list:
    state = request.app.state
    live = {rt.game.id for rt in state.manager.live()}
    out = []
    for row in state.manager.list_rows():
        st = json.loads(row.state_json)
        out.append(
            {
                "id": row.id,
                "name": row.name,
                "code": row.code,
                "status": row.status,
                "room": _room_key(row.status, _room_no(st)),
                "phase": st.get("phase"),
                "brainrot": st.get("brainrot", 0.0),
                "live": row.id in live,
                "tv": state.hub.tv_count(row.id) > 0,
                "updated_at": row.updated_at,
            }
        )
    return out


def _room_no(state: Dict[str, Any]) -> int:
    return resolve_room(state).room_no


@router.get("/admin/api/games/{game_id}/debug")
async def debug_info(game_id: str, request: Request) -> Dict[str, Any]:
    rt = _get(request, game_id)
    g = rt.game
    puzzle = rt.puzzles.get(g.puzzle_id) if g.puzzle_id is not None and g.puzzle_state is not None else None
    peek = getattr(puzzle, "debug_peek", None) if puzzle is not None else None
    return {
        "game": _info(rt, request.app.state.hub),
        # What the TV sees (host-only peek: e.g. the Sahur sequence with its traps); None outside a puzzle.
        "tv_view": puzzle.view_tv(g.puzzle_state) if puzzle is not None else None,
        # Spoiler line for puzzles whose answer is on no screen (trivia answer, bomb solution); "" otherwise.
        "peek": peek(g.puzzle_state) if peek is not None else "",
        "rooms": rt.engine.debug_rooms(),
        "cameos": list(CAMEOS),
        "events": list(DEBUG_EVENTS),
        "presets": PRESETS,
    }


@router.post("/admin/api/games/{game_id}/debug/jump")
async def debug_jump(game_id: str, body: JumpBody, request: Request) -> Dict[str, Any]:
    return await _run(request, game_id, DebugJump(room=body.room, phase=body.phase, level=body.level))


@router.post("/admin/api/games/{game_id}/debug/complete")
async def debug_complete(game_id: str, request: Request) -> Dict[str, Any]:
    return await _run(request, game_id, DebugComplete())


@router.post("/admin/api/games/{game_id}/debug/brainrot")
async def debug_brainrot(game_id: str, body: BrainrotBody, request: Request) -> Dict[str, Any]:
    return await _run(request, game_id, DebugSetBrainrot(value=body.value))


@router.post("/admin/api/games/{game_id}/debug/event")
async def debug_event(game_id: str, body: EventBody, request: Request) -> Dict[str, Any]:
    return await _run(request, game_id, DebugEvent(name=body.name, cameo=body.cameo or None))


@router.post("/admin/api/games/{game_id}/debug/reset")
async def debug_reset(game_id: str, request: Request) -> Dict[str, Any]:
    return await _run(request, game_id, DebugReset())
