// Fallback look when WebGL is unavailable/lost or ?art=off: NO GL, no p5.
// Paints a small tiling paper texture (fibres + blotches) on a 2D canvas and publishes it as
// --paper-tile; the room washes themselves are plain CSS gradients (theme.css, html[data-art=fallback]).
const lcg = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

export async function paintPaperTile(size = 512) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d");
  if (!c) return null;
  const rnd = lcg(23);
  c.clearRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size, y = rnd() * size, r = 60 + rnd() * 120, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(160,125,80,${0.05 * rnd() + 0.01})`); g.addColorStop(1, "rgba(160,125,80,0)");
    c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  c.lineWidth = 1;
  for (let i = 0; i < 700; i++) {
    const x = rnd() * size, y = rnd() * size, l = 4 + rnd() * 16, a = rnd() * Math.PI * 2;
    c.strokeStyle = `rgba(90,70,50,${0.05 + rnd() * 0.07})`;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  return blob ? URL.createObjectURL(blob) : null;
}
