"""Host-only pages (/admin/*) and the optional ADMIN_KEY guard."""
from __future__ import annotations

import hmac
import re

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from app.config import ROOT_DIR, Settings
from app.content import ANCHORS_IN_USE, KEY_ROOMS, key_label
from app.core.game import same_name
from app.core.qr import qr_url, room_keys, short_codes
from app.web import pages
from app.web.qr_svg import svg_scalable

router = APIRouter()
ADMIN_COOKIE = "sb_admin"
ADMIN_COOKIE_MAX_AGE = 30 * 24 * 3600
NO_CACHE = {"Cache-Control": "no-cache"}
PLAYER_TOKEN_HEADER = "X-Player-Token"
# The debug API of one game: the only /admin path the admin player's phone may reach with its own token.
GAME_DEBUG_PATH = re.compile(r"^/admin/api/games/([^/]+)/debug(?:/[a-z]+)?$")


def is_guarded(path: str) -> bool:
    return path == "/admin" or path.startswith("/admin/") or path == "/api/house" or path.startswith("/api/house/")


def is_admin_player(settings: Settings, name: str) -> bool:
    return same_name(name, settings.admin_player)


def admin_player_allowed(request: Request) -> bool:
    """The admin player's phone (X-Player-Token) may drive the debug API of its own game, nothing else."""
    token = request.headers.get(PLAYER_TOKEN_HEADER)
    match = GAME_DEBUG_PATH.match(request.url.path)
    if not token or match is None:
        return False
    found = request.app.state.manager.find_by_token(token)
    if found is None:
        return False
    rt, player = found
    return rt.game.id == match.group(1) and is_admin_player(request.app.state.settings, player.name)


def install_admin_guard(app: FastAPI) -> None:
    """When settings.admin_key is set, /admin/* and /api/house* need ?key= or cookie sb_admin.

    Missing key -> 401, wrong key -> 403. A valid ?key= sets the cookie. Unset -> open.
    The admin player's phone gets its own game's debug API with its player token instead of the key.
    """

    @app.middleware("http")
    async def admin_guard(request: Request, call_next):
        expected = request.app.state.settings.admin_key
        if not expected or not is_guarded(request.url.path):
            return await call_next(request)
        if admin_player_allowed(request):
            return await call_next(request)
        query_key = request.query_params.get("key")
        cookie_key = request.cookies.get(ADMIN_COOKIE)
        given = query_key if query_key is not None else cookie_key
        if given is None:
            return JSONResponse({"detail": "Falta la clave de administrador (?key=...)"}, status_code=401)
        if not hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8")):
            return JSONResponse({"detail": "Clave de administrador incorrecta"}, status_code=403)
        response = await call_next(request)
        if query_key is not None and cookie_key != query_key:
            response.set_cookie(
                ADMIN_COOKIE, query_key, max_age=ADMIN_COOKIE_MAX_AGE, samesite="lax", httponly=True, path="/"
            )
        return response


@router.get("/admin/house")
async def admin_house() -> FileResponse:
    return FileResponse(ROOT_DIR / "static" / "house.html", media_type="text/html", headers=NO_CACHE)


@router.get("/admin/qr-sheet")
async def admin_qr_sheet(request: Request) -> HTMLResponse:
    state = request.app.state
    entries = state.qr_repo.entries()
    codes = short_codes(entries)
    # only the real rooms' keys, in play order: decoys and the unused anchor are not printed
    cards = [(key_label(room), room.key_name, svg_scalable(qr_url(state.settings.public_url, e.token)), codes[e.token])
             for room, e in room_keys(entries, KEY_ROOMS)]
    house = state.house_repo.all()
    missing = sum(1 for i in ANCHORS_IN_USE if not (house.get(i, {}).get("riddle") or "").strip())
    return HTMLResponse(pages.qr_sheet(cards, missing), headers=NO_CACHE)


@router.get("/admin/qr-key")
async def admin_qr_key(request: Request) -> HTMLResponse:
    state = request.app.state
    entries = state.qr_repo.entries()
    return HTMLResponse(pages.qr_key(entries, state.house_repo.all(), short_codes(entries)), headers=NO_CACHE)
