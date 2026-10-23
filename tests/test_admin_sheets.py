import re

from app.content import CAMEOS


def test_sheet_has_15_cards_labelled_in_token_order(client):
    r = client.get("/admin/qr-sheet")
    assert r.status_code == 200
    assert r.text.count("<svg") == 15
    assert re.findall(r'class="label">(#\d\d)<', r.text) == [f"#{i:02d}" for i in range(1, 16)]
    assert "viewBox" in r.text


def test_sheet_does_not_distinguish_anchors_from_decoys(client):
    html = client.get("/admin/qr-sheet").text
    low = html.lower().replace("/admin/house", "")
    for word in ("ancla", "senuelo", "decoy", "anchor"):
        assert word not in low
    for c in CAMEOS:
        assert c not in html
    for e in client.app.state.qr_repo.entries():
        assert e.token not in html  # only encoded inside the QR modules


def test_sheet_flags_missing_riddles_in_non_printed_notice(client):
    assert "Faltan 7 pistas" in client.get("/admin/qr-sheet").text
    for i in range(1, 8):
        client.put(f"/api/house/{i}", json={"riddle": f"pista {i}"})
    assert "Faltan" not in client.get("/admin/qr-sheet").text


def test_sheet_and_key_work_without_any_game(client):
    assert client.get("/api/games").json() == []
    assert client.get("/admin/qr-sheet").status_code == 200
    assert client.get("/admin/qr-key").status_code == 200


def test_key_lists_15_rows_with_spoiler_banner(client):
    key = client.get("/admin/qr-key").text
    assert key.count("<tr>") == 16  # header + 15
    assert key.count("Ancla ") == 7 and key.count("Senuelo ") == 8
    assert "SPOILER" in key


def test_key_maps_labels_to_roles_and_riddles(client):
    client.put("/api/house/2", json={"riddle": "Tras el espejo", "place": "Bano"})
    key = client.get("/admin/qr-key").text
    assert "Tras el espejo" in key and "Bano" in key
    assert key.count("FALTA") == 6
    assert "Ancla 7 (salida)" in key
    for c in CAMEOS:
        assert c in key
    sheet_labels = re.findall(r'class="label">(#\d\d)<', client.get("/admin/qr-sheet").text)
    key_labels = re.findall(r"<td><strong>(#\d\d)</strong>", key)
    assert sheet_labels == key_labels
