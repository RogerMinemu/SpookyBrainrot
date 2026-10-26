"""JSON API. Every handler is async (single sqlite connection, event-loop only)."""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from app.content import ANCHORS_IN_USE, RIDDLE_PLACEHOLDER
from app.core.qr import ANCHOR_COUNT
from app.core.game import normalize_name, resolve_room
from app.db.repos import GameRow
from app.web.qr_svg import svg_for_url

router = APIRouter()

MAX_GAME_NAME = 40
COOKIE_NAME = "sb_pt"
COOKIE_MAX_AGE = 7 * 24 * 3600


class CreateGame(BaseModel):
    name: str


class JoinBody(BaseModel):
    code: str
    name: str
    seat: bool = False  # /admin/demo phones: the token lives in the page's seat storage, never in the shared cookie


def _summary(row: GameRow) -> Dict[str, Any]:
    state = json.loads(row.state_json)
    return {
        "id": row.id,
        "name": row.name,
        "status": row.status,
        "room_no": resolve_room(state).room_no,
        "updated_at": row.updated_at,
    }


@router.get("/healthz")
async def healthz() -> Dict[str, str]:
    return {"status": "ok"}


@router.get("/api/games")
async def list_games(request: Request) -> list:
    return [_summary(r) for r in request.app.state.manager.list_rows()]


@router.post("/api/games", status_code=201)
async def create_game(body: CreateGame, request: Request) -> Dict[str, Any]:
    name = normalize_name(body.name) if len(body.name.strip()) <= MAX_GAME_NAME else ""
    if not name:
        raise HTTPException(status_code=422, detail="name must be 1..40 characters")
    rt = request.app.state.manager.create(name)
    row = request.app.state.manager.games.get(rt.game.id)
    out = _summary(row)
    out["code"] = rt.game.code
    return out


@router.delete("/api/games/{game_id}", status_code=204)
async def delete_game(game_id: str, request: Request) -> Response:
    if not await request.app.state.manager.delete(game_id):
        raise HTTPException(status_code=404, detail="game not found")
    return Response(status_code=204)


@router.get("/api/games/{game_id}/join-qr.svg")
async def join_qr(game_id: str, request: Request) -> Response:
    url = (await join_url(game_id, request))["url"]
    return Response(content=svg_for_url(url), media_type="image/svg+xml", headers={"Cache-Control": "no-cache"})


@router.get("/api/games/{game_id}/join-url")
async def join_url(game_id: str, request: Request) -> Dict[str, str]:
    rt = request.app.state.manager.get(game_id)
    if rt is None:
        raise HTTPException(status_code=404, detail="game not found")
    url = f"{request.app.state.settings.public_url}/play?code={rt.game.code}"
    return {"url": url}


@router.post("/api/join")
async def join(body: JoinBody, request: Request, response: Response) -> Dict[str, Any]:
    manager = request.app.state.manager
    name = normalize_name(body.name)
    if not name:
        raise HTTPException(status_code=422, detail="name must not be empty")
    rt = manager.get_by_code(body.code)
    if rt is None:
        raise HTTPException(status_code=404, detail="game not found")
    player, token = await manager.join(rt, name)
    if not body.seat:  # a seat must not overwrite the identity of the browser that hosts the demo
        response.set_cookie(
            COOKIE_NAME, token, max_age=COOKIE_MAX_AGE, samesite="lax", httponly=False, secure=False, path="/"
        )
    return {"player_id": player.id, "name": player.name, "game_id": rt.game.id, "token": token}


# --- house config (R7.7): global, shared by all games -------------------------------
MAX_RIDDLE_LEN = 600
MAX_PLACE_LEN = 80


class HouseBody(BaseModel):
    riddle: str
    place: Optional[str] = None


def _house_view(cfg: Dict[int, dict]) -> Dict[str, Any]:
    anchors = []
    for idx in range(1, ANCHOR_COUNT + 1):
        row = cfg.get(idx) or {}
        riddle = (row.get("riddle") or "").strip()
        anchors.append(
            {
                "idx": idx,
                "riddle": riddle,
                "place": (row.get("spot_id") or "").strip(),
                "configured": bool(riddle),
                "in_use": idx in ANCHORS_IN_USE,  # a dropped room leaves its printed anchor without a job
                "placeholder": RIDDLE_PLACEHOLDER,
            }
        )
    return {"anchors": anchors}


@router.get("/api/house")
async def get_house(request: Request) -> Dict[str, Any]:
    return _house_view(request.app.state.house_repo.all())


@router.put("/api/house/{idx}")
async def put_house(idx: int, body: HouseBody, request: Request) -> Dict[str, Any]:
    if not 1 <= idx <= ANCHOR_COUNT:
        raise HTTPException(status_code=422, detail="anchor must be 1..7")
    riddle = body.riddle.strip()
    if not riddle or len(riddle) > MAX_RIDDLE_LEN:
        raise HTTPException(status_code=422, detail=f"riddle must be 1..{MAX_RIDDLE_LEN} characters")
    place = (body.place or "").strip()[:MAX_PLACE_LEN] or None
    repo = request.app.state.house_repo
    repo.upsert(idx, riddle, place)
    return _house_view(repo.all())
