"""Runs the node sim tests (tests_js/*.test.mjs) from pytest. Skipped when node is not installed."""
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
JS_TESTS = ROOT / "tests_js"
# explicit list (no globbing at run time): a new .test.mjs must be added here on purpose
NODE_TESTS = [
    "tests_js/demo_bots.test.mjs",
    "tests_js/loop.test.mjs",
    "tests_js/platformer.test.mjs",
    "tests_js/puppet.test.mjs",
    "tests_js/qr.test.mjs",
    "tests_js/red_light.test.mjs",
    "tests_js/sprites.test.mjs",
]


def test_every_node_test_file_is_listed():
    on_disk = sorted(f"tests_js/{p.name}" for p in JS_TESTS.glob("*.test.mjs"))
    assert on_disk == sorted(NODE_TESTS)


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_node_sim_suite_passes():
    res = subprocess.run(
        ["node", "--test", *NODE_TESTS],
        cwd=ROOT, capture_output=True, text=True, timeout=240, encoding="utf-8", errors="replace",
    )
    assert res.returncode == 0, (res.stdout or "")[-4000:] + (res.stderr or "")[-2000:]
