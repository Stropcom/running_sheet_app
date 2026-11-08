// A device's copy of "when the data was last zeroed" (server/dataEpoch.ts).
// When the server's number differs from the one this device last saw, its
// unsent offline drafts refer to records that no longer exist, so they are
// dropped and the page reloads once.
import { clearAllOfflineData } from "./offlineStore";

const KEY = "runlog_data_epoch";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "0";
  } catch {
    return "0";
  }
}

/** True once the number is saved, so a reload can't loop. */
function write(epoch: number): boolean {
  try {
    localStorage.setItem(KEY, String(epoch));
    return localStorage.getItem(KEY) === String(epoch);
  } catch {
    return false;
  }
}

/** Resolves true when the drafts were dropped and the page is reloading (so
 *  nothing should be sent from this page load). */
export async function applyDataEpoch(serverEpoch: number): Promise<boolean> {
  if (!serverEpoch || read() === String(serverEpoch)) return false;
  // If this device can't remember the number, do nothing rather than reload
  // on every visit.
  if (!write(serverEpoch)) return false;
  try {
    await clearAllOfflineData();
  } catch {
    // no offline store on this device: nothing to drop
  }
  window.location.reload();
  return true;
}

/** Marks this device as up to date (the person who did the zero). */
export function rememberDataEpoch(epoch: number) {
  write(epoch);
}
