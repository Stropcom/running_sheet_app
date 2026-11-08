// What a stored target source document may be, and what it is stored as.
//
// The Import Target screen only offers .docx and .pdf, but the server used to
// store whatever the caller sent, under the caller's file name and type — so a
// crafted request could store an HTML page (which the uploads route then served
// as a web page, running script as whoever opened it) or a name with "../" in
// it. Now the server decides: the file's own first bytes must say PDF or Word
// (.docx), the stored name is chosen here (the caller's name is never used in
// the path), and the type is the one this file really is.

export type StoredDocument =
  | { ok: true; ext: "pdf" | "docx"; mime: string }
  | { ok: false; reason: string };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function startsWith(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i++)
    if (bytes[i] !== text.charCodeAt(i)) return false;
  return true;
}

function contains(bytes: Uint8Array, text: string): boolean {
  const first = text.charCodeAt(0);
  outer: for (let i = 0; i <= bytes.length - text.length; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < text.length; j++)
      if (bytes[i + j] !== text.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/** Decides from the file's contents alone (name and type the caller claims
 * are ignored). A PDF starts "%PDF-" within its first 1 KB; a .docx is a zip
 * ("PK") that holds "word/document.xml". */
export function checkStoredDocument(bytes: Uint8Array): StoredDocument {
  if (bytes.length === 0) return { ok: false, reason: "The file is empty." };
  if (contains(bytes.subarray(0, 1024), "%PDF-"))
    return { ok: true, ext: "pdf", mime: "application/pdf" };
  if (startsWith(bytes, "PK") && contains(bytes, "word/document.xml"))
    return { ok: true, ext: "docx", mime: DOCX_MIME };
  return {
    ok: false,
    reason: "Only PDF and Word (.docx) documents can be stored.",
  };
}

/** Stored files that a browser would run as a page or script if opened. Used
 * by the uploads route to force a download for any such file already stored. */
const RUNNABLE_EXT = /\.(html?|xhtml|svg|xml|xsl|js|mjs|css|swf)$/i;
export function isRunnableWhenOpened(storedPath: string): boolean {
  return RUNNABLE_EXT.test(storedPath);
}
