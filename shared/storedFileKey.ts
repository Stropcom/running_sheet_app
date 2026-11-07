// Which kind of thing a stored photo or document belongs to, read from where
// it was stored. Pure: the server looks the owner up (server/storedFileAccess.ts).
//
//   row-attachments/sheet-12/row-34/…   a photo taken on a running sheet row
//   manual-uploads/operation-5/…        a photo uploaded to an operation
//   target-documents/target-7/…         a registry document (and its PDF copy)
//   smeac-briefings/snapshots/…         a briefing's map picture (not tied to evidence)
//
// Anything else is an older or unknown name: the server tries to find it in
// the photo table, and if it cannot, treats it as having no owner.

export type StoredFileKey =
  | { kind: "sheet"; id: number; key: string }
  | { kind: "operation"; id: number; key: string }
  | { kind: "target"; id: number; key: string }
  | { kind: "open"; key: string }
  | { kind: "other"; key: string };

/** The file's stored key from the part of the address after /local-uploads/ or
 * /manus-storage/, or null when it is not a plain relative path (a ../ segment,
 * a backslash, a NUL byte). */
export function storedFileKey(rawPath: string): string | null {
  let p: string;
  try {
    p = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  p = p.replace(/^\/+/, "");
  if (!p || p.includes("\0") || p.includes("\\")) return null;
  if (p.split("/").some(seg => seg === ".." || seg === ".")) return null;
  return p;
}

export function parseStoredFileKey(key: string): StoredFileKey {
  let m = /^row-attachments\/sheet-(\d+)\//.exec(key);
  if (m) return { kind: "sheet", id: Number(m[1]), key };
  m = /^manual-uploads\/operation-(\d+)\//.exec(key);
  if (m) return { kind: "operation", id: Number(m[1]), key };
  m = /^target-documents\/target-(\d+)\//.exec(key);
  if (m) return { kind: "target", id: Number(m[1]), key };
  if (key.startsWith("smeac-briefings/snapshots/"))
    return { kind: "open", key };
  return { kind: "other", key };
}
