# Vendored assets

Everything here is self-hosted (no CDN). Machine-readable pins: `vendor.json` (sha256 checked by `tests/test_vendor.py`).

| Asset | Version | Licence | Notes |
|---|---|---|---|
| p5.js | 2.3.3 | LGPL-2.1 | `p5/2.3.3/p5.min.js`, UNMODIFIED (npm `p5@2.3.3` `lib/p5.min.js`). Source: https://github.com/processing/p5.js. The file has no version banner and its internal constant reads "2.3.1" (upstream quirk); the pinned sha256 is the proof. |
| p5.brush | 2.2.3 | MIT | `p5.brush/2.2.3/p5.brush.js` (npm `p5.brush@2.2.3` `dist/p5.brush.js`), unmodified. |
| jsQR | 1.4.0 | Apache-2.0 | `jsqr/1.4.0/jsQR.js` (npm `jsqr@1.4.0` `dist/jsQR.js`), unmodified. QR decoder for the phone camera (`js/play/scanner.js`), loaded only where the browser has no native `BarcodeDetector`. |
| ClaudeAnimationBase | n/a | MIT, (c) 2026 John Heibel | `static/js/art/engine.js` is an adapted port of `src/core.js`. Licence in `claude-animation-base/LICENSE`. |
| Permanent Marker | v16 latin woff2 | Apache-2.0 | `fonts/permanent-marker/` (google/fonts lists it under apache/, not OFL). |
| Fredoka | v17 latin woff2 (variable) | OFL-1.1 | `fonts/fredoka/`. |

Updating a library: replace the file, update the version dir name, sha256 and `vendor.json`, then run the tests.
- Permanent Marker is Apache-2.0 (earlier notes saying OFL were wrong); Fredoka is OFL-1.1.
