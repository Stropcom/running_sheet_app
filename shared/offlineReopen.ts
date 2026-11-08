// What the app shows when it is opened with no connection.
//
// Offline, the server cannot say who is signed in, so the normal screens
// cannot load. Rather than a dead "Sign in to continue", a phone that has
// drafts saved for an officer opens straight to those drafts. This is a
// reading aid only: the officer is NOT treated as signed in (nothing is sent
// and no password is kept) — drafts go to the server only after a real
// sign-in, as that officer (see lib/offlineSync.ts).

export type LastOfficer = { id: number; cin: string; name?: string | null };

export type ReopenView =
  /** signed in (or loading), show the app as usual */
  | "normal"
  /** offline, not signed in, on a drafts page: show it */
  | "drafts"
  /** offline, not signed in, on any other page: go to the drafts hub */
  | "go-drafts"
  /** nothing to show: the ordinary sign-in prompt */
  | "sign-in";

/**
 * True when the device cannot reach the server: the browser says it is
 * offline, or the sign-in check failed without any answer from the server (a
 * wifi connection with no internet reports "online" but nothing gets through).
 * A refusal the server sent (it has a code) is not "offline".
 */
export function looksOffline(browserOnline: boolean, authError: unknown) {
  if (!browserOnline) return true;
  if (!authError) return false;
  const data = (authError as { data?: unknown }).data;
  return !data;
}

export function offlineReopenView(args: {
  signedIn: boolean;
  online: boolean;
  lastOfficer: LastOfficer | null;
  path: string;
}): ReopenView {
  if (args.signedIn) return "normal";
  if (args.online || !args.lastOfficer) return "sign-in";
  return args.path === "/draft" || args.path.startsWith("/draft/")
    ? "drafts"
    : "go-drafts";
}

const KEY = "runlog_last_officer";

export function readLastOfficer(): LastOfficer | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastOfficer>;
    return typeof v.id === "number" && typeof v.cin === "string"
      ? { id: v.id, cin: v.cin, name: v.name ?? null }
      : null;
  } catch {
    return null;
  }
}

export function rememberLastOfficer(o: LastOfficer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    // no storage on this device: the offline reopen simply isn't offered
  }
}

/** Signing out on purpose forgets who it was. */
export function forgetLastOfficer(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to forget
  }
}
