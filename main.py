"""Entry point: `python main.py`. Port comes from SERVER_PORT, then PORT, then 8000."""
from __future__ import annotations

import logging

import uvicorn

from app.bootstrap import create_app
from app.config import Settings


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    settings = Settings.from_env(load_dotenv_file=True)
    app = create_app(settings, tick_interval=0.25)
    uvicorn.run(app, host=settings.host, port=settings.port, ws_ping_interval=20)


if __name__ == "__main__":
    main()
