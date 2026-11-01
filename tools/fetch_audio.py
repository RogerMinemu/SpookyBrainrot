"""Download the Mixkit sound effects and ambiences listed in static/audio/mixkit.json.

They are not in the repository: the Mixkit Sound Effects Free License lets the game use them but forbids
redistributing them on their own or with source files. Without them the game still works: every effect falls back
to the synthesized one and the ambience loops stay silent.

    python tools/fetch_audio.py           # download what is missing (or does not match its sha256)
    python tools/fetch_audio.py --check   # only verify, exit 1 if something is missing
    python tools/fetch_audio.py --force   # download everything again
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path
from typing import Callable, List

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "static" / "audio"
MANIFEST = AUDIO_DIR / "mixkit.json"
USER_AGENT = "Mozilla/5.0 (SpookyBrainrot audio fetcher)"


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_valid(path: Path, expected: str) -> bool:
    return path.is_file() and sha256(path.read_bytes()) == expected


def sync(manifest: Path = MANIFEST, audio_dir: Path = AUDIO_DIR, *, fetch: Callable[[str], bytes] = download,
         force: bool = False, check: bool = False, log: Callable[[str], None] = print) -> List[str]:
    """Bring every file of the manifest into audio_dir. Returns the problems (empty list = all good)."""
    files = json.loads(manifest.read_text(encoding="utf-8"))["files"]
    problems: List[str] = []
    for rel, entry in files.items():
        target = audio_dir / rel
        if not force and is_valid(target, entry["sha256"]):
            continue
        if check:
            problems.append(f"{rel}: missing or modified")
            continue
        try:
            data = fetch(entry["url"])
        except Exception as error:  # network, HTTP, timeout: report and go on with the rest
            problems.append(f"{rel}: download failed ({error})")
            continue
        if sha256(data) != entry["sha256"]:
            problems.append(f"{rel}: sha256 mismatch, the file at {entry['url']} has changed")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".part")
        tmp.write_bytes(data)
        tmp.replace(target)
        log(f"ok  {rel}")
    return problems


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="only verify, do not download")
    parser.add_argument("--force", action="store_true", help="download every file again")
    args = parser.parse_args(argv)
    problems = sync(force=args.force, check=args.check)
    total = len(json.loads(MANIFEST.read_text(encoding="utf-8"))["files"])
    if problems:
        for p in problems:
            print(f"ERR {p}", file=sys.stderr)
        print(f"{total - len(problems)}/{total} files ready. The game still works: missing effects use the synth.")
        return 1
    print(f"{total}/{total} Mixkit files ready in {AUDIO_DIR.relative_to(ROOT).as_posix()}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
