"""tools/fetch_audio.py: the Mixkit files are downloaded and pinned by sha256, never committed."""
import hashlib
import importlib.util
import json
import re
import subprocess

from app.config import ROOT_DIR

spec = importlib.util.spec_from_file_location("fetch_audio", ROOT_DIR / "tools" / "fetch_audio.py")
fetch_audio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch_audio)

AUDIO = ROOT_DIR / "static" / "audio"
MANIFEST = json.loads((AUDIO / "mixkit.json").read_text(encoding="utf-8"))


def _manifest(tmp_path, files):
    path = tmp_path / "mixkit.json"
    path.write_text(json.dumps({"files": files}), encoding="utf-8")
    return path


def _entry(data: bytes, url="https://example.test/a.mp3"):
    return {"url": url, "sha256": hashlib.sha256(data).hexdigest()}


def test_manifest_matches_every_mixkit_row_of_the_credits():
    credits = (AUDIO / "CREDITS.md").read_text(encoding="utf-8")
    rows = dict(re.findall(r"^\| `((?:sfx|ambience)/[\w-]+\.mp3)` \| [^|]+? \| (https://\S+) \|$", credits, re.M))
    assert rows and {k: v["url"] for k, v in MANIFEST["files"].items()} == rows
    for entry in MANIFEST["files"].values():
        assert entry["url"].startswith("https://assets.mixkit.co/") and re.fullmatch(r"[0-9a-f]{64}", entry["sha256"])


def test_mixkit_files_are_never_committed():
    tracked = subprocess.run(["git", "ls-files", "static/audio/sfx", "static/audio/ambience"], cwd=ROOT_DIR,
                             capture_output=True, text=True, check=True).stdout.split()
    assert tracked == []
    ignored = (ROOT_DIR / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert "static/audio/sfx/" in ignored and "static/audio/ambience/" in ignored


def test_sync_downloads_missing_files_and_skips_valid_ones(tmp_path):
    a, b = b"ID3 first", b"ID3 second"
    manifest = _manifest(tmp_path, {"sfx/a.mp3": _entry(a, "u-a"), "ambience/b.mp3": _entry(b, "u-b")})
    (tmp_path / "sfx").mkdir()
    (tmp_path / "sfx" / "a.mp3").write_bytes(a)
    asked = []
    problems = fetch_audio.sync(manifest, tmp_path, fetch=lambda url: asked.append(url) or b, log=lambda _: None)
    assert problems == [] and asked == ["u-b"]
    assert (tmp_path / "ambience" / "b.mp3").read_bytes() == b


def test_sync_rejects_a_download_whose_sha256_changed(tmp_path):
    manifest = _manifest(tmp_path, {"sfx/a.mp3": _entry(b"expected")})
    problems = fetch_audio.sync(manifest, tmp_path, fetch=lambda url: b"something else", log=lambda _: None)
    assert len(problems) == 1 and "sha256 mismatch" in problems[0]
    assert not (tmp_path / "sfx" / "a.mp3").exists()


def test_sync_reports_failed_downloads_and_goes_on(tmp_path):
    ok = b"fine"
    manifest = _manifest(tmp_path, {"sfx/a.mp3": _entry(b"x", "bad"), "sfx/b.mp3": _entry(ok, "good")})

    def fetch(url):
        if url == "bad":
            raise OSError("offline")
        return ok

    problems = fetch_audio.sync(manifest, tmp_path, fetch=fetch, log=lambda _: None)
    assert problems == ["sfx/a.mp3: download failed (offline)"]
    assert (tmp_path / "sfx" / "b.mp3").read_bytes() == ok


def test_check_only_verifies(tmp_path):
    manifest = _manifest(tmp_path, {"sfx/a.mp3": _entry(b"x")})

    def fetch(url):
        raise AssertionError("--check must not download")

    assert fetch_audio.sync(manifest, tmp_path, fetch=fetch, check=True) == ["sfx/a.mp3: missing or modified"]
