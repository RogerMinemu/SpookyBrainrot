"""Guards for the story-cast change: roster / puppet purity, names, licence hygiene."""
from pathlib import Path

from app.content import CAMEOS

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
ART = STATIC / "js" / "art"

# pure modules: no DOM, no clock, no RNG, no painter
_PURE = ("roster.js", "puppet.js")
# painting recipes and the queue runner only talk to the engine object they are given: no DOM, clock or RNG
_RECIPE_FILES = ("rigs.js", "cameos.js", "pens.js", "queue.js")
_IMPURE_TOKENS = ("document", "window", "Date.now", "Math.random", "performance.now", "painter", "createCanvas")


def _src(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_roster_and_puppet_are_pure():
    for name in _PURE:
        src = _src(ART / name)
        for tok in _IMPURE_TOKENS:
            assert tok not in src, (name, tok)


def test_roster_names_match_server_cameos():
    src = _src(ART / "roster.js")
    for name in CAMEOS:
        assert f'name: "{name}"' in src, name


def test_roster_has_the_eight_characters():
    src = _src(ART / "roster.js")
    for cid in ("patapim", "tralalero", "sahur", "bombardiro", "ballerina", "lirili", "chimpanzini", "trippi"):
        assert f'id: "{cid}"' in src, cid


def test_cab_credit_present_and_no_copied_files():
    for name in _PURE:
        src = _src(ART / name)
        assert "ClaudeAnimationBase" in src and "MIT" in src, name
    names = {p.name for p in (STATIC / "js").rglob("*") if p.is_file()}
    assert not names & {"core.js", "clawd.js", "cast.js", "props.js"}
    assert not list((STATIC / "js").rglob("clawd*")) and not list((STATIC / "js").rglob("MinemiSongs*"))


def test_no_forbidden_brand_in_new_art_files():
    for name in _PURE:
        assert "Nike" not in _src(ART / name), name


# ---- story-cast batch 2: recipes, sprites, ctx.sprite, guardians, jumpscare -----------------------------------
PUZZLES = STATIC / "puzzles"


def test_recipe_files_are_engine_only_and_brand_free():
    for name in _RECIPE_FILES:
        src = _src(ART / name)
        for tok in ("document", "window", "Date.now", "Math.random", "performance.now", "painter", "createCanvas", "Nike"):
            assert tok not in src, (name, tok)
    assert "Nike" not in _src(ART / "sprites.js")


def test_character_plates_are_global_and_queued_after_the_backgrounds():
    plates = _src(ART / "plates.js")
    assert "global: true" in plates and "CHAR_PLATE" in plates
    painter = _src(ART / "painter.js")
    assert "spec.global" in painter and "timings" in painter
    boot = _src(ART / "boot.js")
    assert "plateQueue(room)" in boot and "runCharQueue" in boot
    assert "root.dataset.realtime" in boot  # the queue pauses while a sim runs
    assert boot.index('await run("bg", { variant, w, h })') < boot.index("plateQueue(room)")
    assert "api.sprite" in boot and "createSprites" in boot


def test_sprites_module_exposes_the_handle_contract():
    src = _src(ART / "sprites.js")
    for token in ("drawAny", "draw(g", "mount(el", "get ready", "silhouetteOps", "poseOps", "createSprites"):
        assert token in src, token
    assert "createCanvas" not in src and "painter" not in src


def test_puzzles_get_characters_only_through_ctx_sprite():
    mods = list(PUZZLES.rglob("*.js"))
    assert len(mods) >= 10
    for p in mods:
        src = _src(p)
        for bad in ("painter", "createCanvas", "window.p5", "/js/art/"):
            assert bad not in src, (p.name, bad)
    assert 'ctx.sprite("tralalero")' in _src(PUZZLES / "red_light" / "tv.js")
    assert 'ctx.sprite("sahur")' in _src(PUZZLES / "sahur_dice" / "tv.js")


def test_tv_injects_ctx_sprite_everywhere_a_character_may_be_drawn():
    main = _src(STATIC / "js" / "tv" / "main.js")
    assert "sprite: (id) => art.sprite(id)" in main
    assert "mod.mount(screen, { gameId, ...ctx })" in main  # puzzles
    assert "screens[kind](screen, state, gameId, ctx)" in main  # screens
    assert "handleEvent(ev, ctx)" in main  # effects (jumpscare)


def test_jumpscare_shows_the_scary_pose_with_a_safe_fallback():
    fx = _src(STATIC / "js" / "tv" / "effects.js")
    assert "byName" in fx and "ctx.sprite" in fx and 'emote: "scary"' in fx and "lungeT" in fx
    assert "os ha encontrado..." in fx and "portrait(" in fx  # an unknown cameo keeps the portrait slot
    assert "painter" not in fx and "createCanvas" not in fx
    assert ".scare-canvas" in _src(STATIC / "css" / "tv.css")


def test_dev_pages_have_no_canvas_markup():
    pages = list((STATIC / "dev").glob("*.html"))
    assert any(p.name == "cast-lab.html" for p in pages)
    for p in pages:
        assert "<canvas" not in _src(p), p.name


def test_red_light_keeps_its_procedural_guardian_as_fallback():
    render = _src(PUZZLES / "red_light" / "render.js")
    assert "sprite.draw(" in render and "procedural fallback" in render
    assert "g.ellipse(0, 0, 105, 150" in render  # the old shark is still there for ?art=off / not ready


def test_new_room_guardians_are_drawn_through_ctx_sprite():
    for kind, cid in (("shape_count", "lirili"), ("backrooms_trivia", "ballerina"), ("bomb_defusal", "bombardiro")):
        assert f'ctx.sprite("{cid}")' in _src(PUZZLES / kind / "tv.js"), kind
