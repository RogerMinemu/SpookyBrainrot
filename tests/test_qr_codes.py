"""Typed fallback for the printed QRs: 4 letters under each QR, derived from its token (tokens never change)."""
import string

from app.content import ANCHORS_IN_USE, CAMEOS
from app.core.qr import CODE_LEN, QrEntry, entry_for_code, generate_entries, normalize_code, short_codes
from tests.test_k_route import running_game, tokens
from tests.test_realtime_ws import drain, env, of, phone
from tests.fakes import seeded_rng


def test_codes_are_four_unambiguous_letters_unique_and_stable():
    rng = seeded_rng()
    entries = generate_entries(rng.choice)
    codes = short_codes(entries)
    assert sorted(codes) == sorted(e.token for e in entries)
    assert len(set(codes.values())) == len(entries)
    for code in codes.values():
        assert len(code) == CODE_LEN and set(code) <= set(string.ascii_uppercase) and not set(code) & set("OILB")
    assert short_codes(list(reversed(entries))) == codes  # the order of the registry does not matter
    for e in entries:
        assert codes[e.token] in "".join(c for c in e.token if c.isalpha())  # a run of its own token's letters


def test_colliding_tokens_still_get_distinct_codes():
    same = [QrEntry("ACDE" + "2" * 16, "anchor", 1), QrEntry("ACDE" + "3" * 16, "decoy", 1)]
    codes = short_codes(same)
    assert len(set(codes.values())) == 2 and all(len(c) == CODE_LEN for c in codes.values())


def test_typed_codes_are_normalised():
    entries = generate_entries(seeded_rng().choice)
    token, code = next(iter(short_codes(entries).items()))
    assert normalize_code(f" {code[:2].lower()} {code[2:]} ") == code
    assert entry_for_code(entries, code.lower()).token == token
    assert entry_for_code(entries, code[:3]) is None and entry_for_code(entries, "") is None


def test_the_phone_can_type_the_code_instead_of_scanning(client):
    rt, tok = running_game(client)
    _, decoys = tokens(client)
    codes = short_codes(client.app.state.qr_repo.entries())
    with phone(client, tok) as a:
        drain(a)
        a.send_text(env("scan", {"code": codes[decoys[3]].lower()}))
        assert of(drain(a), "scan")[0]["payload"] == {"result": "jumpscare", "cameo": CAMEOS[2]}
        for bad in ("ZZZZ" if "ZZZZ" not in codes.values() else "YYYY", "AB", "x" * 40):
            a.send_text(env("scan", {"code": bad}))
            assert of(drain(a), "scan")[0]["payload"] == {"result": "unknown"}


def test_the_sheet_prints_the_room_keys_codes_and_the_key_every_code(client):
    entries = client.app.state.qr_repo.entries()
    codes = short_codes(entries)
    sheet = client.get("/admin/qr-sheet").text
    key = client.get("/admin/qr-key").text
    for e in entries:
        code = codes[e.token]
        assert f"<code>{code}</code>" in key
        assert (f"<b>{code}</b>" in sheet) == (e.kind == "anchor" and e.idx in ANCHORS_IN_USE)  # only the room keys
