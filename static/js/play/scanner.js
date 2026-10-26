// Phone QR scanner for the "Pistas" phase. Two ways in, one decoder:
// - a live viewfinder (getUserMedia) where the browser lets a page use the camera: HTTPS or localhost;
// - everywhere else (the usual plain-HTTP game on the home Wi-Fi) browsers hide getUserMedia, so the same button
//   opens the phone's camera app for a photo (<input capture>) and the photo is decoded here.
// Decoder: the native BarcodeDetector when it reads QR codes, else the vendored jsQR, loaded on first use.
// The scanner only finds tokens; main.js sends them and hands the server's answer back to showResult().
import { h } from "/static/js/shared/dom.js";
import { vibrate } from "/static/js/shared/audio.js";
import { tokenFrom, scanMessage } from "/static/js/play/qr.js";

const JSQR_SRC = "/static/vendor/jsqr/1.4.0/jsQR.js";
const FRAME_EVERY_MS = 200;
const FRAME_SIDE = 720;           // live frames are downscaled to this before decoding
const PHOTO_SIDES = [1024, 1800]; // photos: a quick pass, then a sharper one for a small, far QR
const SAME_TOKEN_MS = 4000;       // a QR held in view is sent once: again only after this long out of view
const REPLY_TIMEOUT_MS = 6000;    // no answer (socket dropped): scanning goes on anyway
const LIVE_LABEL = "📷 Abrir la cámara";
const PHOTO_LABEL = "📷 Hacer foto al QR";
const AIM = "Apunta al QR: se lee solo.";

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

/** decode(source, w, h, side) -> Promise<string[]>: every QR text found in an image/video/bitmap. */
function getDecoder() {
  if (!decoder) {
    decoder = (async () => {
      const native = await nativeDetector();
      if (native) {
        return async (source) => (await native.detect(source)).map((c) => c.rawValue);
      }
      const jsQR = await loadJsQR();
      const canvas = document.createElement("canvas");
      const g = canvas.getContext("2d", { willReadFrequently: true });
      return async (source, sw, sh, side) => {
        const k = Math.min(1, side / Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw * k)), hh = Math.max(1, Math.round(sh * k));
        canvas.width = w;
        canvas.height = hh;
        g.drawImage(source, 0, 0, w, hh);
        const code = jsQR(g.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: "attemptBoth" });
        return code && code.data ? [code.data] : [];
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
 * @returns {{el: HTMLElement, showResult: (reply: object) => void, resume: () => void, stop: () => void}}
 */
export function createScanner({ onToken }) {
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
  const el = h("section", { class: "panel phone-panel scan-panel" },
    h("p", { class: "muted" }, "Cuando encontréis el QR, escanéalo desde aquí."), view, open, close, status, file);

  const say = (text, tone = "") => {
    status.textContent = text;
    status.className = `scan-status ${tone}`.trim();
  };

  const release = () => { waiting = false; clearTimeout(waitTimer); };

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
    vibrate(30);
    say("Comprobando...");
    waiting = true;
    clearTimeout(waitTimer);
    waitTimer = setTimeout(release, REPLY_TIMEOUT_MS);
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
        try { texts = await decode(video, video.videoWidth, video.videoHeight, FRAME_SIDE); } catch (_) { /* odd frame */ }
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
      for (const side of PHOTO_SIDES) {
        texts = await decode(photo.img, photo.w, photo.h, side);
        if (texts.length) break;
      }
      photo.done();
      if (!found(texts, true)) say("No veo ningún QR en la foto. Acércate un poco y prueba otra vez.", "bad");
    } catch (_) {
      say("No he podido leer la foto. Prueba otra vez.", "bad");
    }
  }

  open.addEventListener("click", () => {
    if (live) startLive();
    else file.click(); // must stay inside the tap: phones only open the camera app on a user gesture
  });
  close.addEventListener("click", () => { stopCamera(); say(""); });
  file.addEventListener("change", readPhoto);

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
