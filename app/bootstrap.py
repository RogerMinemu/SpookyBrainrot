"""Composition root. Tests inject fakes via create_app arguments."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from random import Random
from typing import Optional

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import ROOT_DIR, Settings
from app.core.clock import Clock, SystemClock
from app.core.qr import generate_entries
from app.db.database import Database
from app.db.repos import QrRepo
from app.puzzles import build_registry
from app.runtime.manager import GameManager
from app.runtime.runtime import run_ticker
from app.web import routes_admin, routes_api, routes_pages
from app.web.routes_admin import install_admin_guard
from app.web.hub import Hub
from app.web.ws import router as ws_router

log = logging.getLogger("spooky")


VENDOR_CACHE = "public, max-age=31536000, immutable"


def is_vendor_path(path: str) -> bool:
    """True for paths under vendor/. `path` is relative to the static root; Windows may hand it over with backslashes."""
    parts = path.replace("\\", "/").lstrip("/").split("/")
    return len(parts) >= 3 and parts[0] == "vendor"  # vendor/<lib>/<file>; vendor.json/VENDOR.md stay no-cache


class NoCacheStatic(StaticFiles):
    async def get_response(self, path, scope):  # type: ignore[override]
        response = await super().get_response(path, scope)
        # vendor dirs are versioned (vendor/p5/2.3.3/...), so only successful responses are immutable
        if response.status_code == 200 and is_vendor_path(path):
            response.headers["Cache-Control"] = VENDOR_CACHE
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response


def create_app(
    settings: Optional[Settings] = None,
    clock: Optional[Clock] = None,
    rng: Optional[Random] = None,
    tick_interval: Optional[float] = None,
) -> FastAPI:
    """`tick_interval` None/0 disables the background ticker (tests)."""
    settings = settings or Settings.from_env()
    clock = clock or SystemClock()
    rng = rng or Random()
    if settings.public_url_defaulted:
        log.warning("PUBLIC_URL not set; QR codes will point to %s", settings.public_url)

    settings.ensure_db_dir()
    db = Database(settings.db_path)
    qr_repo = QrRepo(db)
    qr_repo.ensure(generate_entries)  # idempotent: tokens are created ONCE and never regenerated
    hub = Hub()
    manager = GameManager(db, clock, rng, build_registry(), hub, min_players=settings.min_players)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        task = None
        if tick_interval:
            task = asyncio.create_task(run_ticker(manager, tick_interval))
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            for rt in manager.live():  # final clock flush
                try:
                    rt.persist()
                except Exception:
                    log.exception("final persist failed for %s", rt.game.id)

    app = FastAPI(title="SpookyBrainrot", lifespan=lifespan)
    app.state.settings = settings
    app.state.db = db
    app.state.clock = clock
    app.state.rng = rng
    app.state.hub = hub
    app.state.manager = manager
    app.state.tick_interval = tick_interval

    app.state.qr_repo = qr_repo
    app.state.house_repo = manager.house
    install_admin_guard(app)

    app.include_router(routes_admin.router)
    app.include_router(routes_api.router)
    app.include_router(routes_pages.router)
    app.include_router(ws_router)
    app.mount("/static", NoCacheStatic(directory=ROOT_DIR / "static"), name="static")
    return app
