// Phone QR scanner for the "Pistas" phase. Two ways in, one decoder, plus a typed fallback:
// - a live viewfinder (getUserMedia) where the browser lets a page use the camera: HTTPS or localhost;
// - everywhere else (the usual plain-HTTP game on the home Wi-Fi) browsers hide getUserMedia, so the same button
//   opens the phone's camera app for a photo (<input capture>) and the photo is decoded here;
// - the 4 letters printed under every QR, typed in when no camera manages to read it.
// Decoder: the native BarcodeDetector when it reads QR codes (only on HTTPS), with the vendored jsQR, loaded on
// first use, as the fallback. A photo gets several jsQR passes (whole photo and its middle, at growing sizes): a single
// downscale often loses a QR that is small, far or a little blurry.
// The scanner only finds tokens/codes; main.js sends them and hands the server's answer back to showResult().
import { h } from "/static/js/shared/dom.js";
import { vibrate } from "/static/js/shared/audio.js";
import { tokenFrom, scanMessage, normalizeCode, CODE_LEN } from "/static/js/play/qr.js";

const JSQR_SRC = "/static/vendor/jsqr/1.4.0/jsQR.js";
const FRAME_EVERY_MS = 200;
const FRAME_SIDE = 720;           // live frames are downscaled to this before decoding
// photo passes, cheapest first: [part of the photo, longest side in px]. "mid" = the central 60%, where people aim.
const PHOTO_PASSES = [["whole", 1024], ["mid", 1000], ["whole", 1700], ["mid", 1600], ["whole", 2600]];
const SAME_TOKEN_MS = 4000;       // a QR held in view is sent once: again only after this long out of view
const REPLY_TIMEOUT_MS = 6000;    // no answer (socket dropped): scanning goes on anyway
const LIVE_LABEL = "📷 Abrir la cámara";
const PHOTO_LABEL = "📷 Hacer foto al QR";
const AIM = "Apunta al QR: se lee solo.";
const NO_QR = "No veo ningún QR en la foto. Acércate, que el QR llene la foto, o escribe las 4 letras de debajo.";

let decoder = null;

function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = JSQR_SRC;
    s.onload = () => (window.jsQR ? resolve(window.jsQR) : reject(new Error("jsQR missing")));
    s.onerror = () => reject(new Error("jsQR failed to load"));
    document.head.append(s);
  });
}

async function nativeDetector() {
  if (!("BarcodeDetector" in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return formats.includes("qr_code") ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
  } catch (_) {
    return null;
  }
}

const yieldToPaint = () => new Promise((resolve) => setTimeout(resolve, 0));

/** { frame(source, w, h), photo(source, w, h) } -> Promise<string[]>: every QR text found in a video frame / photo. */
function getDecoder() {
  if (!decoder) {
    decoder = (async () => {
      const native = await nativeDetector();
      let jsQR = null;
      try { jsQR = await loadJsQR(); } catch (e) { if (!native) throw e; }
      const canvas = document.createElement("canvas");
      const g = canvas.getContext("2d", { willReadFrequently: true });
      const byNative = async (source) => {
        if (!native) return [];
        try { return (await native.detect(source)).map((c) => c.rawValue); } catch (_) { return []; }
      };
      // jsQR on one part of the source, scaled so that its longest side is at most `side` px
      const byJsQR = (source, part, side) => {
        if (!jsQR) return [];
        const k = Math.min(1, side / Math.max(part.w, part.h));
        const w = Math.max(1, Math.round(part.w * k)), hh = Math.max(1, Math.round(part.h * k));
        canvas.width = w;
        canvas.height = hh;
        g.drawImage(source, part.x, part.y, part.w, part.h, 0, 0, w, hh);
        const code = jsQR(g.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: "dontInvert" }); // printed dark on light
        return code && code.data ? [code.data] : [];
      };
      return {
        async frame(source, sw, sh) {
          const texts = await byNative(source);
          return texts.length ? texts : byJsQR(source, { x: 0, y: 0, w: sw, h: sh }, FRAME_SIDE);
        },
        async photo(source, sw, sh) {
          const texts = await byNative(source);
          if (texts.length) return texts;
          const parts = { whole: { x: 0, y: 0, w: sw, h: sh }, mid: { x: sw * 0.2, y: sh * 0.2, w: sw * 0.6, h: sh * 0.6 } };
          for (const [part, side] of PHOTO_PASSES) {
            const found = byJsQR(source, parts[part], side);
            if (found.length) return found;
            await yieldToPaint(); // a pass can take a while on an old phone: keep the page responsive
          }
          return [];
        },
      };
    })();
    decoder.catch(() => { decoder = null; });
  }
  return decoder;
}

async function loadPhoto(file) {
  if (window.createImageBitmap) {
    try {
      const b = await createImageBitmap(file);
      return { img: b, w: b.width, h: b.height, done: () => b.close() };
    } catch (_) { /* old Safari: fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

/**
 * @param {object} o
 * @param {(token: string) => boolean} o.onToken  sends the token; false when it could not be sent
 * @param {(code: string) => boolean} o.onCode    sends the typed 4-letter code; false when it could not be sent
 * @returns {{el: HTMLElement, showResult: (reply: object) => void, resume: () => void, stop: () => void}}
 */
export function createScanner({ onToken, onCode }) {
  let live = !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let stream = null, timer = null, waitTimer = null, stopped = false, waiting = false;
  let lastToken = null, lastAt = 0;

  const video = h("video", { class: "scan-video", playsinline: true, muted: true, autoplay: true });
  video.muted = true; // the attribute alone does not set the property everywhere (autoplay needs it)
  const view = h("div", { class: "scan-view hidden", "aria-label": "Visor de la cámara" }, video,
    h("div", { class: "scan-aim", "aria-hidden": "true" }));
  const status = h("p", { class: "scan-status", role: "status" }, "");
  const file = h("input", { type: "file", accept: "image/*", capture: "environment", class: "hidden", tabindex: "-1", "aria-hidden": "true" });
  const open = h("button", { type: "button", class: "btn scan-open" }, live ? LIVE_LABEL : PHOTO_LABEL);
  const close = h("button", { type: "button", class: "btn scan-close hidden" }, "Cerrar la cámara");
  const codeInput = h("input", {
    type: "text", class: "scan-code-input", maxlength: String(CODE_LEN + 4), autocomplete: "off", autocorrect: "off",
    autocapitalize: "characters", spellcheck: "false", enterkeyhint: "go", placeholder: "ABCD", "aria-label": "Código de 4 letras",
  });
  const codeForm = h("form", { class: "scan-code", autocomplete: "off" },
    h("p", { class: "muted" }, "¿La cámara no lo lee? Escribe las 4 letras que hay debajo del QR:"),
    h("div", { class: "scan-code-row" }, codeInput, h("button", { type: "submit", class: "btn scan-code-go" }, "Probar")));
  const el = h("section", { class: "panel phone-panel scan-panel" },
    h("p", { class: "muted" }, "Cuando encontréis el QR, escanéalo desde aquí."), view, open, close, status, codeForm, file);

  const say = (text, tone = "") => {
    status.textContent = text;
    status.className = `scan-status ${tone}`.trim();
  };

  const release = () => { waiting = false; clearTimeout(waitTimer); };
  const expectReply = () => {
    vibrate(30);
    say("Comprobando...");
    waiting = true;
    clearTimeout(waitTimer);
    waitTimer = setTimeout(release, REPLY_TIMEOUT_MS);
  };

  /** Texts decoded from one frame or photo. True when a QR was there (ours or not). */
  function found(texts, fromPhoto) {
    if (!texts.length) return false;
    const token = texts.map(tokenFrom).find(Boolean);
    if (!token) { say("Ese QR no es del juego.", "bad"); return true; }
    const now = Date.now();
    const held = !fromPhoto && token === lastToken && now - lastAt < SAME_TOKEN_MS;
    lastToken = token;
    lastAt = now;
    if (held) return true;
    if (onToken(token) === false) {
      say("Sin conexión con la partida. Prueba otra vez en un momento.", "bad");
      lastToken = null;
      return true;
    }
    expectReply();
    return true;
  }

  function stopCamera() {
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    view.classList.add("hidden");
    close.classList.add("hidden");
    open.classList.remove("hidden");
  }

  function usePhotos(text) {
    live = false;
    stopCamera();
    open.textContent = PHOTO_LABEL;
    say(text, "bad");
  }

  function tick(decode) {
    timer = setTimeout(async () => {
      if (!stream || stopped) return;
      if (!waiting && video.readyState >= 2 && video.videoWidth) {
        let texts = [];
        try { texts = await decode.frame(video, video.videoWidth, video.videoHeight); } catch (_) { /* odd frame */ }
        if (stream && !stopped) found(texts, false);
      }
      if (stream && !stopped) tick(decode);
    }, FRAME_EVERY_MS);
  }

  async function startLive() {
    say("Abriendo la cámara...");
    let decode;
    try {
      decode = await getDecoder();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (_) {
      // permission denied, no camera, or the decoder did not load: the photo path still works
      usePhotos("No puedo abrir la cámara aquí. Hazle una foto al QR.");
      return;
    }
    if (stopped) { stopCamera(); return; }
    video.srcObject = stream;
    view.classList.remove("hidden");
    open.classList.add("hidden");
    close.classList.remove("hidden");
    try { await video.play(); } catch (_) { /* autoplay retried by resume() */ }
    say(AIM);
    tick(decode);
  }

  async function readPhoto() {
    const f = file.files && file.files[0];
    file.value = ""; // the same photo can be picked again
    if (!f) return;
    say("Buscando el QR en la foto...");
    try {
      const decode = await getDecoder();
      const photo = await loadPhoto(f);
      let texts = [];
      try { texts = await decode.photo(photo.img, photo.w, photo.h); } finally { photo.done(); }
      if (!found(texts, true)) say(NO_QR, "bad");
    } catch (_) {
      say("No he podido leer la foto. Prueba otra vez o escribe las 4 letras de debajo del QR.", "bad");
    }
  }

  function sendCode() {
    const code = normalizeCode(codeInput.value);
    if (code.length !== CODE_LEN) { say(`Son ${CODE_LEN} letras: las que hay debajo del QR.`, "bad"); return; }
    if (onCode(code) === false) { say("Sin conexión con la partida. Prueba otra vez en un momento.", "bad"); return; }
    codeInput.value = "";
    codeInput.blur(); // closes the keyboard so the answer is visible
    expectReply();
  }

  open.addEventListener("click", () => {
    if (live) startLive();
    else file.click(); // must stay inside the tap: phones only open the camera app on a user gesture
  });
  close.addEventListener("click", () => { stopCamera(); say(""); });
  file.addEventListener("change", readPhoto);
  codeInput.addEventListener("input", () => {
    const code = normalizeCode(codeInput.value);
    if (codeInput.value !== code) codeInput.value = code; // shown as typed on the sheet: upper-case letters only
  });
  codeForm.addEventListener("submit", (e) => { e.preventDefault(); sendCode(); });

  return {
    el,
    showResult(reply) {
      release();
      const m = scanMessage(reply);
      say(m.text, m.tone);
      if (m.tone === "bad") vibrate([60, 40, 60]);
    },
    // main.js re-renders the phase on every state: moving the <video> may pause it on some browsers
    resume() { if (stream && video.paused) video.play().catch(() => {}); },
    stop() {
      stopped = true;
      release();
      stopCamera();
    },
  };
}
