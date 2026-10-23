import hashlib
import json
import re
from pathlib import Path

import pytest

from app.bootstrap import VENDOR_CACHE, is_vendor_path
from app.config import ROOT_DIR

STATIC = ROOT_DIR / "static"
VENDOR = STATIC / "vendor"
META = json.loads((VENDOR / "vendor.json").read_text(encoding="utf-8"))


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def entries():
    yield "p5", META["p5"]
    yield "p5.brush", META["p5.brush"]
    for name, e in META["fonts"].items():
        yield f"font:{name}", e


# ---- R-WE-1 ----
def test_vendor_files_exist_and_non_empty():
    for _name, e in entries():
        assert (VENDOR / e["path"]).stat().st_size > 1000
        assert (VENDOR / e["licenseFile"]).stat().st_size > 100


def test_sha256_matches_recorded_values():
    for name, e in entries():
        assert sha256(VENDOR / e["path"]) == e["sha256"], name


def test_p5_pinned_version_and_unmodified_marker():
    assert META["p5"]["version"] == "2.3.3"
    assert "2.3.3" in META["p5"]["path"]
    assert META["p5.brush"]["version"] == "2.2.3"
    # the npm build has no banner and an internal "2.3.1" constant; the sha256 above is the proof
    head = (VENDOR / META["p5"]["path"]).read_bytes()[:40]
    assert head.startswith(b"var p5=function(){")


def test_licence_notices_name_library_and_licence():
    def lic(rel):
        return (VENDOR / rel).read_text(encoding="utf-8", errors="replace")

    assert "GNU LESSER GENERAL PUBLIC LICENSE" in lic(META["p5"]["licenseFile"])
    assert "Version 2.1" in lic(META["p5"]["licenseFile"])
    assert "MIT License" in lic(META["p5.brush"]["licenseFile"])
    assert "p5.js 2.3.3" in lic("p5/2.3.3/NOTICE") and "github.com/processing/p5.js" in lic("p5/2.3.3/NOTICE")
    assert "MIT License" in lic("claude-animation-base/LICENSE") and "John Heibel" in lic("claude-animation-base/LICENSE")
    # Permanent Marker is Apache-2.0 (NOT OFL); Fredoka is OFL
    assert "Apache License" in lic(META["fonts"]["permanent-marker"]["licenseFile"])
    assert META["fonts"]["permanent-marker"]["license"] == "Apache-2.0"
    assert "SIL Open Font License" in lic(META["fonts"]["fredoka"]["licenseFile"])
    assert META["fonts"]["fredoka"]["license"] == "OFL-1.1"


def test_vendor_md_mirrors_json():
    md = (VENDOR / "VENDOR.md").read_text(encoding="utf-8")
    for needle in ("2.3.3", "2.2.3", "LGPL-2.1", "Apache-2.0", "OFL-1.1", "Permanent Marker", "Fredoka"):
        assert needle in md


def test_fonts_are_woff2():
    for name, e in META["fonts"].items():
        assert (VENDOR / e["path"]).read_bytes()[:4] == b"wOF2", name


def test_no_cdn_urls_under_static():
    pat = re.compile(r"https?://(?:cdn\.|unpkg|fonts\.g|cdnjs|ajax\.googleapis|jsdelivr)", re.I)
    skip = {".png", ".jpg", ".webp", ".woff2", ".gif", ".ico"}
    for p in STATIC.rglob("*"):
        if not p.is_file() or p.suffix.lower() in skip or p.relative_to(STATIC).parts[0] == "vendor":
            continue
        assert not pat.search(p.read_text(encoding="utf-8", errors="ignore")), p


def test_no_minemisongs_files_and_engine_credit():
    names = {p.name.lower() for p in (STATIC / "js").rglob("*.js")}
    assert not names & {"core.js", "clawd.js", "cast.js", "props.js"}
    assert not list(STATIC.rglob("clawd*")) and not list(STATIC.rglob("MinemiSongs*"))
    src = (STATIC / "js" / "art" / "engine.js").read_text(encoding="utf-8")
    head = src[:900]
    assert "ClaudeAnimationBase" in head and "John Heibel" in head and "MIT" in head
    for forbidden in ("camBegin", "makeGlowTex", "devUI", "PROJECT.", "clawd(", "timeline.js", "const W ="):
        assert forbidden not in src, forbidden
    assert "export function createEngine" in src


# ---- R-WE-3 ----
def test_vendor_200_is_immutable(client):
    r = client.get("/static/vendor/p5.brush/2.2.3/LICENSE.md")
    assert r.status_code == 200
    assert r.headers["cache-control"] == VENDOR_CACHE
    assert "immutable" in VENDOR_CACHE and "max-age=31536000" in VENDOR_CACHE


def test_vendor_404_not_immutable(client):
    r = client.get("/static/vendor/p5/9.9.9/nope.js")
    assert r.status_code == 404
    assert "immutable" not in r.headers.get("cache-control", "")


def test_app_static_stays_no_cache(client):
    for path in ("/static/js/home.js", "/static/css/base.css", "/static/index.html", "/static/vendor/vendor.json"):
        r = client.get(path)
        assert r.status_code == 200, path
        assert r.headers["cache-control"] == "no-cache", path


def test_vendor_path_normalises_windows_separators():
    assert is_vendor_path("vendor\\p5\\2.3.3\\p5.min.js")
    assert is_vendor_path("vendor/fonts/fredoka/OFL.txt")
    assert not is_vendor_path("js\\vendor\\x.js")
    assert not is_vendor_path("vendor.json")
    assert not is_vendor_path("css/base.css")


# ---- R-WE-6 S3 ----
def test_fallback_manifest_exists_valid_and_entries_exist():
    m = STATIC / "art" / "fallback" / "manifest.json"
    data = json.loads(m.read_text(encoding="utf-8"))
    assert data["files"] == []  # v1 ships no WebP
    for f in data["files"]:
        assert (m.parent / f).is_file()


# ---- no-vendor-leak (R-WE-2 S2 / R-PS-5) ----
def _art_refs(html: str):
    return re.findall(r"vendor/p5|p5\.min|p5\.brush|/js/art/|<canvas", html)


def test_admin_pages_and_house_have_no_p5(client):
    for path in ("/admin/qr-sheet", "/admin/qr-key"):
        html = client.get(path).text
        assert not _art_refs(html), path
        assert "/static/css/paper.css" in html, path
    house = (STATIC / "house.html").read_text(encoding="utf-8")
    assert not _art_refs(house) and "/static/css/paper.css" in house
    assert "paper.css" in client.get("/k/does-not-exist").text  # scan pages share page()


def test_qr_sheet_stays_white_and_ink_friendly(client):
    html = client.get("/admin/qr-sheet").text
    assert 'class="sheet"' in html and "background:#fff" in html
    css = (STATIC / "css" / "paper.css").read_text(encoding="utf-8")
    sheet = css[css.index("body.sheet {"):]
    assert "background: #fff" in sheet and "color: #000" in sheet
    assert "body:not(.sheet) .card" in css  # the paper .card look must never reach the A4 sheet cards
    assert "gradient" not in sheet and "rgba" not in sheet  # no tints on the printable sheet


def test_font_licence_wording_is_apache_for_permanent_marker():
    md = (VENDOR / "VENDOR.md").read_text(encoding="utf-8")
    readme = (ROOT_DIR / "README.md").read_text(encoding="utf-8")
    for text in (md, readme):
        for line in text.splitlines():
            if "Permanent Marker" in line:
                assert "Apache-2.0" in line, line
    assert "OFL-1.1" in readme


def test_art_export_dev_page_exists():
    html = (STATIC / "dev" / "art-export.html").read_text(encoding="utf-8")
    js = (STATIC / "dev" / "art-export.js").read_text(encoding="utf-8")
    assert "art-export.js" in html and "manifest" in js and "image/webp" not in html
    assert "createPainter" in js and "PLATE_ORDER" in js
