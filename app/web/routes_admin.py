"""Host-only pages (/admin/*) and the optional ADMIN_KEY guard."""
from __future__ import annotations

import hmac

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from app.config import ROOT_DIR
from app.core.qr import ANCHOR_COUNT, ordered_with_labels, qr_url
from app.web import pages
from app.web.qr_svg import svg_scalable

router = APIRouter()
ADMIN_COOKIE = "sb_admin"
ADMIN_COOKIE_MAX_AGE = 30 * 24 * 3600
NO_CACHE = {"Cache-Control": "no-cache"}


def is_guarded(path: str) -> bool:
    return path == "/admin" or path.startswith("/admin/") or path == "/api/house" or path.startswith("/api/house/")


def install_admin_guard(app: FastAPI) -> None:
    """When settings.admin_key is set, /admin/* and /api/house* need ?key= or cookie sb_admin.

    Missing key -> 401, wrong key -> 403. A valid ?key= sets the cookie. Unset -> open.
    """

    @app.middleware("http")
    async def admin_guard(request: Request, call_next):
        expected = request.app.state.settings.admin_key
        if not expected or not is_guarded(request.url.path):
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
    labelled = ordered_with_labels(state.qr_repo.entries())
    cards = [(label, svg_scalable(qr_url(state.settings.public_url, e.token))) for label, e in labelled]
    house = state.house_repo.all()
    missing = sum(1 for i in range(1, ANCHOR_COUNT + 1) if not (house.get(i, {}).get("riddle") or "").strip())
    return HTMLResponse(pages.qr_sheet(cards, missing), headers=NO_CACHE)


@router.get("/admin/qr-key")
async def admin_qr_key(request: Request) -> HTMLResponse:
    state = request.app.state
    rows = ordered_with_labels(state.qr_repo.entries())
    return HTMLResponse(pages.qr_key(rows, state.house_repo.all()), headers=NO_CACHE)
