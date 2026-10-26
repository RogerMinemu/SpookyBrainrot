"""HTML pages. Static shells; the data comes over the API / WebSocket."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse

from app.config import ROOT_DIR
from app.content import CAMEOS
from app.core.engine import Scan
from app.core.qr import CHOOSE, NO_GAME, GameRef, resolve_game
from app.web import pages
from app.web.routes_api import COOKIE_NAME

router = APIRouter()
STATIC_DIR: Path = ROOT_DIR / "static"
NO_CACHE = {"Cache-Control": "no-cache"}


def _page(name: str) -> FileResponse:
    return FileResponse(STATIC_DIR / name, media_type="text/html", headers=NO_CACHE)


def scan_cameo(entry: dict) -> Optional[str]:
    """Who a decoy wakes up (the scan answers name it); None for anchors."""
    idx = entry["idx"]
    return CAMEOS[idx - 1] if entry["kind"] == "decoy" and 1 <= idx <= len(CAMEOS) else None


@router.get("/")
async def home() -> FileResponse:
    return _page("index.html")


@router.get("/tv/{game_id}")
async def tv_page(game_id: str, request: Request) -> FileResponse:
    if request.app.state.manager.games.get(game_id) is None:
        raise HTTPException(status_code=404, detail="game not found")
    return _page("tv.html")


@router.get("/play")
async def play_page() -> FileResponse:
    return _page("play.html")


@router.get("/k/{token}")
async def scan(token: str, request: Request, g: Optional[str] = None) -> HTMLResponse:
    """QR landing. Which game: ?g= -> cookie player's game -> sole running game -> list -> none."""
    state = request.app.state
    manager = state.manager
    entry = state.qr_repo.get(token)
    if entry is None:
        return HTMLResponse(pages.unknown_token(), status_code=404, headers=NO_CACHE)

    refs = [
        GameRef(r.id, r.name, r.status, has_tv=state.hub.tv_count(r.id) > 0) for r in manager.list_rows()
    ]
    cookie_game: Optional[str] = None
    cookie_token = request.cookies.get(COOKIE_NAME)
    if cookie_token:
        found = manager.find_by_token(cookie_token)
        cookie_game = found[0].game.id if found else None
    res = resolve_game(g, cookie_game, refs)
    if res.kind == NO_GAME:
        return HTMLResponse(pages.no_game(), headers=NO_CACHE)
    if res.kind == CHOOSE:
        return HTMLResponse(pages.choose_game(res.candidates, token), headers=NO_CACHE)

    rt = manager.get(res.game_id)
    if rt is None:
        return HTMLResponse(pages.no_game(), headers=NO_CACHE)
    out = await rt.apply(Scan(kind=entry["kind"], idx=entry["idx"]))
    return HTMLResponse(pages.scan_page(out.scan_result, scan_cameo(entry)), headers=NO_CACHE)
