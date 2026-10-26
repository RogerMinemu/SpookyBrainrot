"""Server-rendered HTML for scan results and admin sheets (Spanish, Spain)."""
from __future__ import annotations

from html import escape
from typing import Dict, Optional, Sequence, Tuple

from app.content import ANCHORS_IN_USE, CAMEOS, RIDDLE_PLACEHOLDER
from app.core.engine import (
    SCAN_ALREADY,
    SCAN_FINISHED,
    SCAN_JUMPSCARE,
    SCAN_LAUGH,
    SCAN_SLEEPING,
    SCAN_UNLOCKED,
)
from app.core.qr import GameRef, QrEntry

_PAPER = ('<link rel="icon" href="data:,"><link rel="stylesheet" href="/static/css/paper.css">')

# colours, fonts and buttons come from paper.css (CSS paper, no scripts); only layout lives here
_STYLE = """
body{margin:0}
main{max-width:560px;margin:0 auto;padding:2rem 1rem;text-align:center}
"""


def page(title: str, body: str, status_style: str = "", extra_head: str = "") -> str:
    return (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(title)}</title>{_PAPER}<style>{_STYLE}{status_style}</style>{extra_head}</head>"
        f"<body><main>{body}</main></body></html>"
    )


def unknown_token() -> str:
    return page("QR desconocido", "<h1>Este código no lleva a ninguna parte</h1>"
                "<p class='muted'>Seguro que no es de esta casa.</p>")


def no_game() -> str:
    return page("Sin partida", "<h1>No hay ninguna partida en marcha</h1>"
                "<p class='muted'>Empezad una partida en la tele y volved a escanear.</p>")


def choose_game(games: Sequence[GameRef], token: str) -> str:
    links = "".join(
        f'<a class="btn" href="/k/{escape(token)}?g={escape(g.id)}">{escape(g.name)}</a>' for g in games
    )
    return page("Elige partida", f"<h1>¿Qué partida es la vuestra?</h1>{links}")


def scan_page(result: Optional[str], cameo: Optional[str] = None) -> str:
    if result in (SCAN_UNLOCKED, SCAN_FINISHED):
        msg = ("<h1>Ancla encontrada</h1><p>La puerta cede...</p>" if result == SCAN_UNLOCKED
               else "<h1>Ancla encontrada</h1><p>Es la última. Mirad la tele.</p>")
        return page("Ancla", msg)
    if result == SCAN_SLEEPING:
        return page("Ancla dormida", "<h1>Esta ancla aún duerme...</h1>"
                    "<p class='muted'>Todavía no es su momento. Volved cuando la tele os lo pida.</p>")
    if result == SCAN_ALREADY:
        return page("Ancla estable", "<h1>Esta ancla ya está estable</h1><p class='muted'>Nada que hacer aquí.</p>")
    if result == SCAN_JUMPSCARE:
        name = escape(cameo or "???")
        return page("Trampa", f"<h1>Has despertado a {name}</h1><p>Mirad la tele... y rezad.</p>",
                    status_style="body{background:#F1CFCB}")
    if result == SCAN_LAUGH:
        return page("Ja", "<h1>Ja, ja, ja...</h1><p class='muted'>Otra vez cayendo en lo mismo.</p>")
    return page("Hmm", "<h1>Algo raro pasa con este código</h1>")


# --- admin ---------------------------------------------------------------------
_SHEET_STYLE = """
@page{size:A4;margin:0}
body{background:#fff;color:#000}
.notice{background:#fff3cd;color:#664d03;padding:.8rem 1rem;margin:0;font-family:system-ui,sans-serif}
.card{width:210mm;height:297mm;display:flex;flex-direction:column;align-items:center;justify-content:center;
 page-break-after:always;break-after:page;box-sizing:border-box}
.card svg{width:15cm;height:15cm}
.card .label{font:700 3rem system-ui,sans-serif;margin-top:1rem}
@media print{.notice{display:none}}
@media screen{.card{border-bottom:2px dashed #999;margin:0 auto}}
"""


def qr_sheet(cards: Sequence[Tuple[str, str]], missing_riddles: int) -> str:
    """cards: (label, svg). Identical cards: nothing reveals anchor vs decoy."""
    notice = ""
    if missing_riddles:
        notice = (f'<p class="notice">Faltan {missing_riddles} pistas por escribir en '
                  '<a href="/admin/house">/admin/house</a> (esta nota no se imprime).</p>')
    body = "".join(f'<section class="card">{svg}<div class="label">{escape(label)}</div></section>'
                   for label, svg in cards)
    return (
        '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de QR</title>'
        f'{_PAPER}<style>{_SHEET_STYLE}</style></head><body class="sheet">{notice}{body}</body></html>'
    )


_KEY_STYLE = """
body{text-align:left}
main{max-width:900px}
.spoiler{padding:1rem;font-weight:700;text-align:center}
table{width:100%;border-collapse:collapse;margin-top:1rem}
td,th{padding:.5rem;text-align:left;vertical-align:top}
"""


def qr_key(rows: Sequence[Tuple[str, QrEntry]], house: Dict[int, dict]) -> str:
    out = []
    for label, e in rows:
        if e.kind == "anchor" and e.idx not in ANCHORS_IN_USE:
            role = f"Ancla {e.idx} (sin uso: no hace falta esconderla)"
            riddle_html = '<span class="muted">-</span>'
            place_html = '<span class="muted">-</span>'
        elif e.kind == "anchor":
            cfg = house.get(e.idx) or {}
            riddle = (cfg.get("riddle") or "").strip()
            place = (cfg.get("spot_id") or "").strip()
            role = f"Ancla {e.idx}" + (" (salida)" if e.idx == 7 else "")
            riddle_html = escape(riddle) if riddle else (
                f'<span class="missing">FALTA</span> <span class="muted">({escape(RIDDLE_PLACEHOLDER)})</span>')
            place_html = escape(place) if place else '<span class="muted">-</span>'
        else:
            cameo = CAMEOS[e.idx - 1] if 1 <= e.idx <= len(CAMEOS) else "?"
            role = f"Señuelo {e.idx}: {cameo}"
            riddle_html = '<span class="muted">-</span>'
            place_html = '<span class="muted">-</span>'
        out.append(f"<tr><td><strong>{escape(label)}</strong></td><td>{escape(role)}</td>"
                   f"<td>{place_html}</td><td>{riddle_html}</td></tr>")
    body = (
        '<div class="spoiler">SPOILER - solo para el anfitrión. No se lo enseñéis a los jugadores.</div>'
        '<p><a href="/admin/house">Casa</a> &middot; <a href="/admin/debug">Modo debug</a></p>'
        "<h1>Clave de QR</h1><table><tr><th>Etiqueta</th><th>Rol</th><th>Escondite</th><th>Pista</th></tr>"
        + "".join(out) + "</table>"
    )
    return page("Clave de QR", body, status_style=_KEY_STYLE)
