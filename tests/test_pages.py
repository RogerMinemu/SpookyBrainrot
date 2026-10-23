def test_home_and_play_pages(client):
    for path in ("/", "/play"):
        r = client.get(path)
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]
        assert r.headers["cache-control"] == "no-cache"


def test_tv_page_known_and_unknown(client):
    gid = client.post("/api/games", json={"name": "G"}).json()["id"]
    r = client.get(f"/tv/{gid}")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert client.get("/tv/unknown").status_code == 404


def test_static_no_cache_header(client):
    r = client.get("/static/js/shared/ws.js")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "no-cache"
    assert client.get("/static/css/base.css").headers["cache-control"] == "no-cache"


def test_static_missing_404(client):
    assert client.get("/static/nope.js").status_code == 404


# ---- watercolor-ui batch 2 (theme + art wiring; no server/protocol change) ----
import re
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "static"


def _tv_html(client):
    gid = client.post("/api/games", json={"name": "G"}).json()["id"]
    return client.get(f"/tv/{gid}").text


def test_painted_pages_link_theme_and_have_art_layer(client):
    for html in (client.get("/").text, _tv_html(client)):
        assert "/static/css/theme.css" in html
        assert 'id="art"' in html
        assert 'data-room="prologue"' in html


def test_painted_pages_are_vendor_free_and_cdn_free(client):
    # p5 is injected by art/boot.js after a WebGL2 probe, never referenced by the page itself
    for html in (client.get("/").text, _tv_html(client)):
        assert "vendor/p5" not in html and "<canvas" not in html
        assert not re.search(r"https?://(?:cdn\.|unpkg|fonts\.g|cdnjs|ajax\.googleapis|jsdelivr)", html, re.I)


def test_composition_roots_start_art_once():
    tv = (STATIC / "js" / "tv" / "main.js").read_text(encoding="utf-8")
    home = (STATIC / "js" / "home.js").read_text(encoding="utf-8")
    assert tv.count("startArt(") == 1 and 'layout: "tv"' in tv and "applyState" in tv
    assert home.count("startArt(") == 1 and 'layout: "flex"' in home
    assert "art/boot.js" in tv and "art/boot.js" in home


def test_screens_never_touch_the_painter():
    for rel in ("js/tv/screens.js", "js/ui/kit.js", "js/ui/theme.js", "js/home.js"):
        src = (STATIC / rel).read_text(encoding="utf-8")
        assert "painter" not in src and "window.p5" not in src and "createCanvas" not in src, rel


def test_art_modules_exist_and_export_contract():
    art = STATIC / "js" / "art"
    for name in ("engine", "painter", "plates", "boot", "paper2d"):
        assert (art / f"{name}.js").is_file(), name
    assert "export const ART_VERSION" in (art / "painter.js").read_text(encoding="utf-8")
    assert "export function startArt" in (art / "boot.js").read_text(encoding="utf-8")
    plates = (art / "plates.js").read_text(encoding="utf-8")
    for room in ("prologue", "backrooms", "poolrooms"):
        assert room in plates


def test_theme_css_has_room_tokens_fonts_and_no_external_urls():
    css = (STATIC / "css" / "theme.css").read_text(encoding="utf-8")
    for room in ("prologue", "backrooms", "poolrooms"):
        assert f'html[data-room="{room}"]' in css
    for tok in ("#1F2550", "#D9C25A", "#3A9C98", "#F3EBDC", "#2B2233", "#FFF5E2", "#B8323A"):
        assert tok in css
    assert css.count("@font-face") == 2 and "font-display: swap" in css
    assert "http://" not in css and "https://" not in css


def test_admin_and_house_do_not_load_art_yet(client):
    house = (STATIC / "house.html").read_text(encoding="utf-8")
    assert "p5" not in house and "/static/js/art" not in house
    r = client.get("/admin/qr-sheet")
    if r.status_code == 200:
        assert "p5" not in r.text and "/static/js/art" not in r.text


# ---- watercolor-ui batch 3 (phone + both puzzles) ----
def test_play_page_links_theme_art_layer_and_is_vendor_free(client):
    html = client.get("/play").text
    assert "/static/css/theme.css" in html and "/static/css/play.css" in html
    assert 'id="art"' in html and 'data-room="prologue"' in html
    assert "vendor/p5" not in html and "<canvas" not in html
    assert not re.search(r"https?://(?:cdn\.|unpkg|fonts\.g|cdnjs|ajax\.googleapis|jsdelivr)", html, re.I)
    for hook in ('id="join"', 'id="join-form"', 'id="code"', 'id="name"', 'id="error"', 'id="game"', 'id="conn"'):
        assert hook in html


def test_play_composition_root_starts_art_once_with_flex_layout():
    src = (STATIC / "js" / "play" / "main.js").read_text(encoding="utf-8")
    assert src.count("startArt(") == 1 and 'layout: "flex"' in src and "applyState" in src
    assert "art/boot.js" in src


def test_phone_and_puzzle_views_use_kit_and_never_touch_the_painter():
    for rel in ("js/play/main.js", "js/play/toast.js", "puzzles/hold_together/tv.js", "puzzles/hold_together/controller.js",
                "puzzles/cursed_wordle/tv.js", "puzzles/cursed_wordle/controller.js", "puzzles/cursed_wordle/grid.js"):
        src = (STATIC / rel).read_text(encoding="utf-8")
        assert "painter" not in src and "window.p5" not in src and "createCanvas" not in src, rel
    for rel in ("puzzles/hold_together/tv.js", "puzzles/hold_together/controller.js",
                "puzzles/cursed_wordle/tv.js", "puzzles/cursed_wordle/controller.js"):
        assert "/static/js/ui/kit.js" in (STATIC / rel).read_text(encoding="utf-8"), rel


def test_wordle_and_hold_dom_hooks_survive():
    grid = (STATIC / "puzzles" / "cursed_wordle" / "grid.js").read_text(encoding="utf-8")
    assert "wcell" in grid and "wrow" in grid
    ctrl = (STATIC / "puzzles" / "cursed_wordle" / "controller.js").read_text(encoding="utf-8")
    assert "wordle-input" in ctrl and "wgrid" in ctrl
    assert "hold-btn" in (STATIC / "puzzles" / "hold_together" / "controller.js").read_text(encoding="utf-8")
    assert "hold-bar" in (STATIC / "puzzles" / "hold_together" / "tv.js").read_text(encoding="utf-8")
    css = (STATIC / "css" / "theme.css").read_text(encoding="utf-8")
    for state in ("correct", "present", "absent", "covered"):
        assert f".wcell.{state}" in css


# Player-facing Spanish must carry its orthography (root cause of the "todavia" bug: ASCII-only authoring).
_BAD_SPANISH = [
    "todavia", "Todavia", "emborronaran", "esta estable", "aun duerme", "Codigo", "codigo", "Habeis", "Unete", "Senuelo",
    "ningun ", "sesion", "pagina", "anfitrion", "valido", "valida ", "ultima", "Que partida", "esta a punto",
    "NO esta en", "MANTEN ", "vacia", "Salpicon", "SALPICON", "Ancla encontrada ", "podrido.",
]


def _player_facing_files():
    out = [p for p in STATIC.rglob("*") if p.suffix in (".js", ".html") and "vendor" not in p.parts and "dev" not in p.parts]
    out += [p for p in (STATIC.parent / "app").rglob("*.py")]
    return out


def test_spanish_orthography_sweep():
    offenders = []
    for p in _player_facing_files():
        txt = p.read_text(encoding="utf-8")
        for bad in _BAD_SPANISH:
            if bad in txt:
                offenders.append((p.name, bad))
    assert not offenders, offenders


def test_accented_strings_survive_in_utf8_responses(client):
    r = client.get("/play")
    assert "utf-8" in r.headers["content-type"].lower() and "Únete a la partida" in r.text
    js = client.get("/static/puzzles/cursed_wordle/tv.js")
    # module scripts are always decoded as UTF-8 by browsers, whatever the OS mime table says
    assert "emborronarán" in js.content.decode("utf-8")
    assert "utf-8" in client.get("/static/css/theme.css").headers["content-type"].lower()


def test_tv_overlays_are_painted_with_a_portrait_slot_and_spanish_copy():
    fx = (STATIC / "js" / "tv" / "effects.js").read_text(encoding="utf-8")
    assert "/static/js/ui/kit.js" in fx and "portrait(" in fx and "painter" not in fx and "createCanvas" not in fx
    for copy in ("¡Salpicón!", "La palabra se ha podrido", "Ancla encontrada", "os ha encontrado..."):
        assert copy in fx
    kit = (STATIC / "js" / "ui" / "kit.js").read_text(encoding="utf-8")
    assert "data-cameo" in kit and "portrait-empty" in kit and "portrait-name" in kit


def test_takeover_and_meter_hooks():
    main = (STATIC / "js" / "tv" / "main.js").read_text(encoding="utf-8")
    assert "data-takeover" in main or "dataset.takeover" in main
    assert "Recuperar control" in main and "Otra pantalla ha tomado el control" in main
    tv = (STATIC / "tv.html").read_text(encoding="utf-8")
    for hook in ('id="meter"', 'id="meter-fill"', 'id="meter-text"'):
        assert hook in tv


def test_degradation_levels_filter_only_art_and_keep_layout():
    css = (STATIC / "css" / "theme.css").read_text(encoding="utf-8")
    tvcss = (STATIC / "css" / "tv.css").read_text(encoding="utf-8")
    for lvl in range(1, 6):
        assert f'html[data-rot="{lvl}"] #art' in css, lvl
    for lvl in range(2, 6):
        assert f'html[data-rot="{lvl}"] {{ --boil-ms:' in css, lvl
    # the old .screen filter is gone: filters live on #art only
    assert not re.search(r"\.screen\s*\{[^}]*filter:", tvcss)
    assert "filter" not in re.sub(r"/\*.*?\*/", "", tvcss.split(".screen {")[1].split("}")[0], flags=re.S)
    ms = [int(m) for m in re.findall(r'html\[data-rot="\d"\] \{ --boil-ms: (\d+); \}', css)]
    assert ms == sorted(ms, reverse=True) and ms[-1] == 42
