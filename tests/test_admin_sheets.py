import re

from app.content import CAMEOS, KEY_ROOMS


def test_sheet_prints_one_key_per_real_room_in_play_order(client):
    r = client.get("/admin/qr-sheet")
    assert r.status_code == 200
    assert r.text.count("<svg") == len(KEY_ROOMS) == 6  # rooms 1..6: no decoys, no unused anchor
    assert re.findall(r'class="label">([^<]+)<', r.text) == [f"Sala {i}" for i in range(1, 7)]
    names = re.findall(r'class="name">([^<]+)<', r.text)
    assert names[0] == "Nivel 0 · Brr Brr Patapim" and names[-1] == "La salida · Tung Tung Tung Sahur"
    assert "viewBox" in r.text


def test_sheet_codes_open_their_own_room(client):
    from app.core.qr import entry_for_code

    entries = client.app.state.qr_repo.entries()
    codes = re.findall(r"Código: <b>([A-Z]{4})</b>", client.get("/admin/qr-sheet").text)
    found = [entry_for_code(entries, c) for c in codes]
    assert [(e.kind, e.idx) for e in found] == [("anchor", room.anchor) for room in KEY_ROOMS]


def test_sheet_leaks_no_tokens_nor_decoys(client):
    html = client.get("/admin/qr-sheet").text
    low = html.lower().replace("/admin/house", "")
    for word in ("ancla", "senuelo", "señuelo", "decoy", "anchor"):
        assert word not in low
    guardians = " ".join(room.key_name for room in KEY_ROOMS)
    for c in CAMEOS:
        assert c in guardians or c not in html  # a guardian's name is on its room's key; the other cameos never are
    for e in client.app.state.qr_repo.entries():
        assert e.token not in html  # only encoded inside the QR modules
    assert "solo=llaves" not in html  # the old full sheet / keys-only toggle is gone


def test_sheet_flags_missing_riddles_in_non_printed_notice(client):
    # anchor 7 has no room: its missing riddle is not nagged about
    assert "Faltan 6 pistas" in client.get("/admin/qr-sheet").text
    for i in range(1, 7):
        client.put(f"/api/house/{i}", json={"riddle": f"pista {i}"})
    assert "Faltan" not in client.get("/admin/qr-sheet").text


def test_sheet_and_key_work_without_any_game(client):
    assert client.get("/api/games").json() == []
    assert client.get("/admin/qr-sheet").status_code == 200
    assert client.get("/admin/qr-key").status_code == 200


def test_key_lists_15_rows_with_spoiler_banner(client):
    key = client.get("/admin/qr-key").text
    assert key.count("<tr>") == 16  # header + 15
    assert key.count("Ancla ") == 7 and key.count("Señuelo ") == 8
    assert key.count("(no se imprime)") == 8 and "Ancla 7 (sin uso: no se imprime)" in key
    assert "SPOILER" in key


def test_key_maps_labels_to_roles_and_riddles(client):
    client.put("/api/house/2", json={"riddle": "Tras el espejo", "place": "Bano"})
    key = client.get("/admin/qr-key").text
    assert "Tras el espejo" in key and "Bano" in key
    assert key.count("FALTA") == 5  # anchors 1, 3, 4, 5 and 6 (2 is written, 7 is unused)
    assert "Ancla 1: Nivel 0 · Brr Brr Patapim" in key and "Ancla 6: La salida · Tung Tung Tung Sahur (salida)" in key
    for c in CAMEOS:
        assert c in key
    sheet_labels = re.findall(r'class="label">([^<]+)<', client.get("/admin/qr-sheet").text)
    key_labels = re.findall(r"<td><strong>(Sala \d)</strong>", key)
    assert sheet_labels == key_labels
