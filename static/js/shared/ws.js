// Resilient game socket: backoff, instant retry on wake, heartbeat, stale-seq drop.
const BACKOFF_MS = [250, 500, 1000, 2000];
const PING_EVERY_MS = 15000;
const DEAD_AFTER_MS = 35000;
const NO_RETRY = new Set([4004, 4010, 4001]);

export class GameSocket {
  /**
   * @param {object} o
   * @param {() => object} o.hello       payload for the hello message (called per attempt)
   * @param {(msg) => void} o.onState    {game, view, seq}
   * @param {(msg) => void} [o.onEvent]  {name, data}
   * @param {(err) => void} [o.onError]  {code, message} sent to this socket only
   * @param {(msg) => void} [o.onWelcome]
   * @param {(msg) => void} [o.onInput]   {pid, mask} phone input relayed to the TV (realtime lane)
   * @param {(msg) => void} [o.onFx]      {kind, data?} TV effect for this phone
   * @param {(msg) => void} [o.onScan]    {result, cameo?} answer to this phone's in-app QR scan
   * @param {(msg) => void} [o.onAdmin]   {action} sent to the TV by the admin player's phone
   * @param {(online: boolean) => void} [o.onTvOnline] fires when the TV presence flag changes (carried by state)
   * @param {(status: string) => void} [o.onStatus] "connecting" | "open" | "closed"
   * @param {(code: number) => void} [o.onFatal]   close codes that must not retry
   */
  constructor(o) {
    this.o = o;
    this.attempt = 0;
    this.lastSeq = -1;
    this.ws = null;
    this.timer = null;
    this.pingTimer = null;
    this.lastRx = 0;
    this.tvOnline = null;
    this.stopped = false;
    const wake = () => this.retryNow();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
  }

  start() { this.stopped = false; this.connect(); }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.pingTimer);
    if (this.ws) this.ws.close();
  }

  send(t, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ v: 1, t, payload }));
      return true;
    }
    return false;
  }

  // Realtime lane: lock-free on the server, safe to call at any rate (the server drops the excess).
  sendInput(mask) { return this.send("input", { mask }); }
  sendFx(to, kind, data) { return this.send("fx", data === undefined ? { to, kind } : { to, kind, data }); }
  sendSim(report) { return this.send("sim", report); }

  retryNow() {
    if (this.stopped) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && Date.now() - this.lastRx < DEAD_AFTER_MS) return;
    clearTimeout(this.timer);
    if (this.ws) { try { this.ws.close(); } catch (_) {} }
    this.connect();
  }

  connect() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.o.onStatus && this.o.onStatus("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.lastRx = Date.now();
      ws.send(JSON.stringify({ v: 1, t: "hello", payload: this.o.hello() }));
    };
    ws.onmessage = (ev) => {
      this.lastRx = Date.now();
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.t === "welcome") {
        this.attempt = 0;
        this.lastSeq = -1; // a fresh connection always starts from a full snapshot
        this.tvOnline = null; // re-announced by the first state
        this.o.onStatus && this.o.onStatus("open");
        this.o.onWelcome && this.o.onWelcome(m.payload);
        this.startHeartbeat();
      } else if (m.t === "state") {
        if (m.seq < this.lastSeq) return; // older than what we show
        this.lastSeq = m.seq;
        this.o.onState({ ...m.payload, seq: m.seq });
        const online = !!(m.payload.game && m.payload.game.tv_online);
        if (online !== this.tvOnline) {
          this.tvOnline = online;
          this.o.onTvOnline && this.o.onTvOnline(online);
        }
      } else if (m.t === "input") {
        this.o.onInput && this.o.onInput(m.payload);
      } else if (m.t === "fx") {
        this.o.onFx && this.o.onFx(m.payload);
      } else if (m.t === "event") {
        this.o.onEvent && this.o.onEvent(m.payload);
      } else if (m.t === "scan") {
        this.o.onScan && this.o.onScan(m.payload);
      } else if (m.t === "admin") {
        this.o.onAdmin && this.o.onAdmin(m.payload);
      } else if (m.t === "error") {
        this.o.onError && this.o.onError(m.payload);
      }
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      clearInterval(this.pingTimer);
      this.o.onStatus && this.o.onStatus("closed");
      if (ev.code === 4000) { location.reload(); return; }
      if (NO_RETRY.has(ev.code)) { this.stopped = true; this.o.onFatal && this.o.onFatal(ev.code); return; }
      if (this.stopped) return;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
      this.attempt += 1;
      this.timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => {};
  }

  startHeartbeat() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (Date.now() - this.lastRx > DEAD_AFTER_MS) { this.retryNow(); return; }
      this.send("ping");
    }, PING_EVERY_MS);
  }
}
