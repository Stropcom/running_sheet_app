// A time limit for the on-device document AI pass in target.registry.parseDocument.
//
// The rules-based reader (PDF/Word text + field mapping) takes well under a
// second. The optional AI re-check runs a 1.5B-parameter model on the server's
// CPU, one greedy generation at a time (up to MAX_AI_CALLS), and the very
// first call also loads about 1.5 GB of weights. On a 2-vCPU droplet that can
// add up to minutes, longer than nginx waits (60 s by default), so the officer
// saw "Unexpected token '<' … is not valid JSON" (nginx's own 504 page) instead
// of the document. The AI pass is additive and display-only (every suggestion
// is re-parsed by deterministic code before anyone sees it), so it is the part
// to cut short: when the budget runs out the rules' own reading is returned,
// exactly as it already is when the model files aren't installed.

/** Total time the AI pass may take for one document. */
export const AI_TIME_BUDGET_MS = 15_000;

/** Model calls that have been started and not yet finished — including ones we
 * stopped waiting for. A generation can't be cancelled, so while one is still
 * running a new document skips the AI pass instead of queueing behind it. */
let inFlight = 0;

export function aiCallsInFlight(): number {
  return inFlight;
}

export type Budgeted<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "budget" | "busy" | "error" };

/**
 * Runs `call` and waits no longer than what is left of the budget.
 * `deadline` is an absolute time (Date.now() based). Never throws: a model
 * error is `{ ok: false, reason: "error" }`, like running out of time.
 */
export async function withinBudget<T>(
  deadline: number,
  call: () => Promise<T>,
  now: () => number = Date.now
): Promise<Budgeted<T>> {
  if (inFlight > 0) return { ok: false, reason: "busy" };
  const left = deadline - now();
  if (left <= 0) return { ok: false, reason: "budget" };

  inFlight++;
  const started = call();
  // Count the call as finished only when it really is, even if we gave up.
  const finished = started.then(
    () => undefined,
    () => undefined
  );
  void finished.then(() => {
    inFlight--;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">(resolve => {
    timer = setTimeout(() => resolve("timeout"), left);
  });
  try {
    const result = await Promise.race([
      started.then(
        value => ({ value }),
        () => "error" as const
      ),
      timeout,
    ]);
    if (result === "timeout") return { ok: false, reason: "budget" };
    if (result === "error") return { ok: false, reason: "error" };
    return { ok: true, value: result.value };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
