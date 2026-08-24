// Remembers which Operation/Running Sheet a user last had open, purely as a
// client-side convenience for pre-filling the "New SMEAC Briefing" form —
// it is not authoritative operational state, just a starting point the
// creator can change. Per-device (localStorage), not synced server-side.

const STORAGE_KEY = "runlog.lastActiveContext";

export interface LastActiveContext {
  operationId: number;
  sheetId: number | null;
}

export function setLastActiveContext(ctx: LastActiveContext) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    // Private browsing / storage disabled — pre-fill just won't have a default.
  }
}

export function getLastActiveContext(): LastActiveContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.operationId !== "number") return null;
    return {
      operationId: parsed.operationId,
      sheetId: typeof parsed.sheetId === "number" ? parsed.sheetId : null,
    };
  } catch {
    return null;
  }
}
