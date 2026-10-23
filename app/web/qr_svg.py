"""QR rendering as inline SVG (segno, pure Python)."""
from __future__ import annotations

import io
import re

import segno


def svg_for_url(url: str, scale: int = 8, border: int = 2) -> str:
    qr = segno.make(url, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=scale, border=border, xmldecl=False, svgns=True, nl=False, dark="#000", light="#fff")
    return buf.getvalue().decode("utf-8")


_SIZE_RE = re.compile(r'(<svg\b[^>]*?)\swidth="(\d+)"\sheight="(\d+)"')


def svg_scalable(url: str) -> str:
    """Same QR with a viewBox so CSS can size it (print sheet)."""
    svg = svg_for_url(url)
    return _SIZE_RE.sub(lambda m: f'{m.group(1)} viewBox="0 0 {m.group(2)} {m.group(3)}" width="{m.group(2)}" height="{m.group(3)}"', svg, count=1)
