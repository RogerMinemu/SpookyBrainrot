// Pure helpers for the phone's QR scanner (no DOM): which house token a QR carries and what the phone says back.
// Only the /k/<token> path matters, so a QR printed with an older PUBLIC_URL still scans in-app.
const TOKEN_RE = /\/k\/([A-Za-z0-9_-]{8,64})(?=[/?#]|$)/;

/** The token of a house QR ("<any host>/k/<token>"), or null when the QR is not one of ours. */
export function tokenFrom(text) {
  const m = TOKEN_RE.exec(String(text || "").trim());
  return m ? m[1] : null;
}

// Same outcomes (and wording) as the /k/<token> pages, which the phone camera app still opens.
const RESULTS = {
  unlocked: ["good", () => "¡Era este! La puerta cede..."],
  finished: ["good", () => "¡Era este! Es el último: mirad la tele."],
  sleeping: ["meh", () => "Este QR aún duerme... Todavía no es su momento."],
  already_done: ["meh", () => "Este QR ya está estable. Nada que hacer aquí."],
  jumpscare: ["bad", (cameo) => `Has despertado a ${cameo || "algo"}... Mira la tele y reza.`],
  laugh: ["meh", () => "Ja, ja, ja... Otra vez cayendo en lo mismo."],
  unknown: ["bad", () => "Este código no lleva a ninguna parte. Seguro que no es de esta casa."],
};

/** {tone: "good" | "meh" | "bad", text} for the server's answer to a scan ({result, cameo?}). */
export function scanMessage(reply) {
  const r = RESULTS[reply && reply.result];
  return r ? { tone: r[0], text: r[1](reply.cameo) } : { tone: "bad", text: "Algo raro pasa con este código." };
}
