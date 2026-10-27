import test from "node:test";
import assert from "node:assert/strict";
import { tokenFrom, scanMessage, normalizeCode, CODE_LEN } from "../static/js/play/qr.js";

test("tokenFrom reads the /k/<token> of a house QR, whatever host it was printed with", () => {
  assert.equal(tokenFrom("http://192.168.1.20:8000/k/ACDEFGHJKMNPQRSTUVWX"), "ACDEFGHJKMNPQRSTUVWX");
  assert.equal(tokenFrom("https://juego.example/k/ACDEFGHJKM23456789?g=abc"), "ACDEFGHJKM23456789");
  assert.equal(tokenFrom("  http://x/k/ACDEFGHJKM23456789/  "), "ACDEFGHJKM23456789");
  assert.equal(tokenFrom("/k/ACDEFGHJKM23456789#x"), "ACDEFGHJKM23456789");
});

test("tokenFrom rejects QR codes that are not ours", () => {
  for (const text of ["", null, undefined, "hola", "http://x/play?code=ABCD", "http://x/k/", "http://x/k/SHORT",
    "http://x/k/ACDEFGHJKM23456789extra!", "http://x/kk/ACDEFGHJKM23456789", "WIFI:S:casa;T:WPA;P:secreto;;"]) {
    assert.equal(tokenFrom(text), null, String(text));
  }
});

test("scanMessage covers every scan outcome with Spanish copy", () => {
  const tones = { unlocked: "good", finished: "good", sleeping: "meh", already_done: "meh", jumpscare: "bad", laugh: "meh", unknown: "bad" };
  for (const [result, tone] of Object.entries(tones)) {
    const m = scanMessage({ result, cameo: "Tung Tung Tung Sahur" });
    assert.equal(m.tone, tone, result);
    assert.ok(m.text.length > 10, result);
  }
  assert.match(scanMessage({ result: "jumpscare", cameo: "Tung Tung Tung Sahur" }).text, /Tung Tung Tung Sahur/);
  assert.match(scanMessage({ result: "sleeping" }).text, /aún duerme/);
  assert.equal(scanMessage({ result: "unsupported" }).tone, "bad");
  assert.equal(scanMessage(null).tone, "bad");
});

test("normalizeCode: what the player typed, as the 4-letter code under the QR", () => {
  assert.equal(CODE_LEN, 4);
  assert.equal(normalizeCode(" ab cd "), "ABCD");
  assert.equal(normalizeCode("a-b.c,d"), "ABCD");
  assert.equal(normalizeCode("abcdef"), "ABCD");
  assert.equal(normalizeCode("x1y2"), "XY");
  assert.equal(normalizeCode(null), "");
});
