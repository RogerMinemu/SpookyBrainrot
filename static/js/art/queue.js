// Character plate queue runner (pure orchestration, no DOM): paints a list of { id, variant } jobs one at a time,
// waits while something realtime is running (so the 60 Hz sims are never hitched), and stops the moment the
// queue goes stale (a newer room epoch, art fallback). A job that finishes late is the caller's business: the
// plate cache keeps its result, the old queue just does not register it.
//
// deps: { order, alive() -> bool, paused() -> bool, sleep(ms) -> Promise, paint(id, variant) -> Promise<bool> }
// `paint` returns false when the queue must stop (stale or disposed). Resolves true when every job ran.
export async function runCharQueue({ order, alive, paused, sleep, paint }) {
  for (const job of order) {
    while (alive() && paused()) await sleep(300);
    if (!alive()) return false;
    if (!(await paint(job.id, job.variant))) return false;
  }
  return true;
}
