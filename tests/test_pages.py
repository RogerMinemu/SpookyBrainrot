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
    for room in ("prologue", "backrooms", "poolrooms", "sahur"):
        assert room in plates
    assert "bgSahur" in plates and "wordle" not in plates.lower()


def test_theme_css_has_room_tokens_fonts_and_no_external_urls():
    css = (STATIC / "css" / "theme.css").read_text(encoding="utf-8")
    for room in ("prologue", "backrooms", "poolrooms", "sahur"):
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
    for rel in ("js/play/main.js", "js/play/toast.js", "puzzles/hold_together/tv.js", "puzzles/hold_together/controller.js"):
        src = (STATIC / rel).read_text(encoding="utf-8")
        assert "painter" not in src and "window.p5" not in src and "createCanvas" not in src, rel
    for rel in ("puzzles/hold_together/tv.js", "puzzles/hold_together/controller.js"):
        assert "/static/js/ui/kit.js" in (STATIC / rel).read_text(encoding="utf-8"), rel


def test_hold_dom_hooks_survive_and_wordle_is_gone():
    assert "hold-btn" in (STATIC / "puzzles" / "hold_together" / "controller.js").read_text(encoding="utf-8")
    assert "hold-bar" in (STATIC / "puzzles" / "hold_together" / "tv.js").read_text(encoding="utf-8")
    assert not (STATIC / "puzzles" / "cursed_wordle").exists()


# Player-facing Spanish must carry its orthography (root cause of the "todavia" bug: ASCII-only authoring).
_BAD_SPANISH = [
    "todavia", "Todavia", "emborronaran", "esta estable", "aun duerme", "Codigo", "codigo", "Habeis", "Unete", "Senuelo",
    "ningun ", "sesion", "pagina", "anfitrion", "valido", "valida ", "ultima", "Que partida", "esta a punto",
    "NO esta en", "MANTEN ", "vacia", "Salpicon", "SALPICON", "Ancla encontrada ", "podrido.",
    "tambien", "despues", "telefono", "ultimo",
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
    js = client.get("/static/js/tv/screens.js")
    # module scripts are always decoded as UTF-8 by browsers, whatever the OS mime table says
    assert "Habéis escapado" in js.content.decode("utf-8")
    assert "utf-8" in client.get("/static/css/theme.css").headers["content-type"].lower()


def test_tv_overlays_are_painted_with_a_portrait_slot_and_spanish_copy():
    fx = (STATIC / "js" / "tv" / "effects.js").read_text(encoding="utf-8")
    assert "/static/js/ui/kit.js" in fx and "portrait(" in fx and "painter" not in fx and "createCanvas" not in fx
    for copy in ("¡Salpicón!", "¡Ronda fallida!", "d.title", "d.text", "Ancla encontrada", "os ha encontrado..."):
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


def test_shared_realtime_modules_are_plain_es_modules():
    root = Path(__file__).resolve().parent.parent / "static" / "js" / "shared"
    for name in ("input.js", "audio.js", "ws.js"):
        src = (root / name).read_text(encoding="utf-8")
        assert "<canvas" not in src and "createCanvas" not in src and "painter" not in src
        assert not re.search(r"https?://", src), name  # no CDN, no external URL
    ws = (root / "ws.js").read_text(encoding="utf-8")
    assert all(m in ws for m in ("sendInput", "sendFx", "sendSim", "onInput", "onFx", "onTvOnline"))
    audio = (root / "audio.js").read_text(encoding="utf-8")
    assert "export function unlockAudio" in audio and "export function play" in audio


# ---- skill-rooms batch 3: sim modules are pure, puzzle modules never touch the painter ----
_PURE_SIM = ["js/sim/loop.js", "js/sim/bits.js", "js/sim/aabb.js", "js/sim/colors.js", "puzzles/coop_platformer/sim.js",
             "puzzles/coop_platformer/levels.js", "puzzles/red_light/sim.js"]


def _sim_and_puzzle_modules():
    out = [p for p in (STATIC / "js" / "sim").glob("*.js")]
    out += [p for p in (STATIC / "puzzles").rglob("*.js")]
    return out


def test_sim_and_puzzle_modules_never_touch_the_painter():
    mods = _sim_and_puzzle_modules()
    assert len(mods) >= 10
    for p in mods:
        src = p.read_text(encoding="utf-8")
        for bad in ("painter", "createCanvas", "window.p5"):
            assert bad not in src, (p.name, bad)


def test_sim_files_use_relative_imports_only():
    mods = [STATIC / "js" / "sim" / n for n in ("loop.js", "bits.js", "aabb.js", "colors.js", "host.js")]
    mods += [STATIC / "puzzles" / "coop_platformer" / n for n in ("sim.js", "levels.js")]
    mods.append(STATIC / "puzzles" / "red_light" / "sim.js")
    for p in mods:
        src = p.read_text(encoding="utf-8")
        for spec in re.findall(r"""(?:from|import)\s*\(?\s*["']([^"']+)["']""", src):
            assert spec.startswith("./") or spec.startswith("../"), (p.name, spec)
        assert not re.search(r"https?://", src), p.name


def test_pure_sim_modules_have_no_dom_or_globals():
    for rel in _PURE_SIM:
        src = (STATIC / rel).read_text(encoding="utf-8")
        for bad in ("document.", "window.", "localStorage", "Math.random", "Date.now", "performance.now"):
            assert bad not in src, (rel, bad)


def test_static_html_has_no_canvas_markup():
    for p in STATIC.glob("*.html"):
        assert "<canvas" not in p.read_text(encoding="utf-8"), p.name


def test_platformer_front_end_is_wired():
    base = STATIC / "puzzles" / "coop_platformer"
    for name in ("levels.js", "sim.js", "render.js", "tv.js", "controller.js"):
        assert (base / name).is_file(), name
    tv = (base / "tv.js").read_text(encoding="utf-8")
    assert 'dataset.realtime = "1"' in tv and "createHost" in tv and "export function onInput" in tv
    ctl = (base / "controller.js").read_text(encoding="utf-8")
    assert "mountPad" in ctl and "export function onFx" in ctl and "export function onTvOnline" in ctl and "export function resend" in ctl
    css = (STATIC / "css" / "tv.css").read_text(encoding="utf-8")
    assert ".sim-stage" in css and "object-fit: contain" in css
    theme = (STATIC / "css" / "theme.css").read_text(encoding="utf-8")
    assert 'html[data-realtime="1"]' in theme


# ---- skill-rooms batch 4: red light + Sahur front-ends, sahur theme, generic round_failed ----
def test_red_light_front_end_is_wired():
    base = STATIC / "puzzles" / "red_light"
    for name in ("sim.js", "render.js", "tv.js", "controller.js"):
        assert (base / name).is_file(), name
    tv = (base / "tv.js").read_text(encoding="utf-8")
    assert 'dataset.realtime = "1"' in tv and "createHost" in tv and "export function onInput" in tv
    ctl = (base / "controller.js").read_text(encoding="utf-8")
    assert "mountPad" in ctl and "export function onFx" in ctl and "export function onTvOnline" in ctl and "export function resend" in ctl
    assert "Tralalero" in (base / "render.js").read_text(encoding="utf-8")


def test_sahur_front_end_keeps_the_sequence_on_the_tv():
    base = STATIC / "puzzles" / "sahur_dice"
    tv = (base / "tv.js").read_text(encoding="utf-8")
    ctl = (base / "controller.js").read_text(encoding="utf-8")
    assert "view.seq" in tv and "replay" in tv and "¡Sahur dice" in tv
    assert not re.search(r"seq|\.seq", ctl) and "view.hits" not in ctl and "view.drums" in ctl


def test_sahur_theme_is_mapped_and_tokens_exist():
    theme = (STATIC / "js" / "ui" / "theme.js").read_text(encoding="utf-8")
    assert '7: "sahur"' in theme and '"sahur"]' in theme
    css = (STATIC / "css" / "theme.css").read_text(encoding="utf-8")
    for tok in ("#2A1414", "#5C1F1A", "#E8C07A", "#D9643A", "#E6CFC2"):
        assert tok in css


def test_new_room_copy_has_orthography():
    from app.content import CAMEOS

    assert "Lirilì Larilà" in CAMEOS and "Lirili Larila" not in CAMEOS
    ctl = (STATIC / "puzzles" / "red_light" / "controller.js").read_text(encoding="utf-8")
    assert "Mantén pulsado" in ctl and "Has llegado" not in ctl.replace("¡Has llegado!", "")
    sahur = (STATIC / "puzzles" / "sahur_dice" / "controller.js").read_text(encoding="utf-8")
    assert "¡Habéis fallado!" in sahur and "¡Vuestro turno!" in sahur


# ---- rooms 3, 4 and 6 (room 5 dropped): front-ends, themes ----
def test_new_room_front_ends_are_wired():
    for kind in ("shape_count", "backrooms_trivia", "bomb_defusal"):
        for name in ("tv.js", "controller.js"):
            src = (STATIC / "puzzles" / kind / name).read_text(encoding="utf-8")
            for hook in ("export function mount", "export function update", "export function unmount", "/static/js/ui/kit.js"):
                assert hook in src, (kind, name, hook)
    shapes = (STATIC / "puzzles" / "shape_count" / "controller.js").read_text(encoding="utf-8")
    assert '"adjust"' in shapes and "delta" in shapes and "view.shapes" not in shapes  # two buttons, no field on the phone
    assert '"vote"' in (STATIC / "puzzles" / "backrooms_trivia" / "controller.js").read_text(encoding="utf-8")
    bomb_tv = (STATIC / "puzzles" / "bomb_defusal" / "tv.js").read_text(encoding="utf-8")
    assert "view.bomb" not in bomb_tv and "view.manual" not in bomb_tv  # the TV never draws the bomb nor the manual
    bomb = (STATIC / "puzzles" / "bomb_defusal" / "controller.js").read_text(encoding="utf-8")
    assert "view.bomb" in bomb and "view.manual" in bomb and "setPointerCapture" in bomb


def test_new_room_themes_are_mapped_and_painted():
    theme = (STATIC / "js" / "ui" / "theme.js").read_text(encoding="utf-8")
    for room_no, room in ((3, "mall"), (4, "site19"), (6, "hangar")):
        assert f'{room_no}: "{room}"' in theme
    assert "5:" not in theme  # room 5 was dropped
    css = (STATIC / "css" / "theme.css").read_text(encoding="utf-8")
    plates = (STATIC / "js" / "art" / "plates.js").read_text(encoding="utf-8")
    for room, fn in (("mall", "bgMall"), ("site19", "bgSite19"), ("hangar", "bgHangar")):
        assert f'html[data-room="{room}"]' in css and f"function {fn}(" in plates and f"{room}: {fn}" in plates
