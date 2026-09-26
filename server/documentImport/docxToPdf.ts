// Converts a DOCX file's bytes to a PDF via a headless LibreOffice process,
// so the in-app document viewer (client/src/components/DocumentViewerModal.tsx)
// can render it pixel-for-pixel through the same pdf.js path already used
// for real PDF uploads, instead of approximating layout via mammoth.js's
// HTML conversion (which discards Word's own column widths/cell shading —
// see the "Word no good" report this replaced). Deterministic, fully
// offline, no network call — satisfies CLAUDE.md's Golden Rule the same
// way pdfTextReader.ts's pdfjs-dist usage already does.
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

const CONVERT_TIMEOUT_MS = 45_000;

/**
 * Returns the converted PDF's bytes, or null if LibreOffice isn't
 * installed, the file is corrupt, or conversion times out — never throws.
 * Callers should treat null as "no renderable PDF available" and fall
 * back (e.g. keep the original DOCX's own storage URL, or the older
 * mammoth-based viewer for a row that has one but no conversion), not
 * block the save on it — this runs at upload time, not on every view.
 */
export async function convertDocxToPdf(
  docxBytes: Buffer
): Promise<Buffer | null> {
  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "docx2pdf-"));
    const inputPath = path.join(tmpDir, "input.docx");
    await writeFile(inputPath, docxBytes);
    await execFileAsync(
      "soffice",
      [
        "--headless",
        "--norestore",
        // Isolated per-conversion profile — concurrent headless LibreOffice
        // invocations sharing the default user profile can fail with a
        // profile-lock error; scoping it inside our own tmpDir also means
        // it's cleaned up automatically with everything else below.
        `-env:UserInstallation=file://${path.join(tmpDir, "loprofile")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        tmpDir,
        inputPath,
      ],
      { timeout: CONVERT_TIMEOUT_MS }
    );
    return await readFile(path.join(tmpDir, "input.pdf"));
  } catch {
    return null;
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
