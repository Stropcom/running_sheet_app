// Shared by every court-document export page (Statements/Witness List/WIPC)
// to turn a base64 payload from the server into a saved file on the user's
// device.
//
// iOS Safari does not reliably support the classic <a download> + blob: URL
// trick for downloads — the browser reports "Downloaded" but the file lands
// in an internal Safari download area the user can't easily find, with no
// way to choose a destination like OneDrive or iCloud Drive. Where the Web
// Share API's file-sharing is available (iOS Safari 15+, most Android
// browsers), route through the native share sheet instead so the user picks
// where it's saved. Everywhere else (desktop browsers), fall back to the
// existing blob-download approach, which already works correctly there.
export async function downloadBase64File(
  base64: string,
  filename: string,
  mime: string
): Promise<void> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  ) {
    try {
      const file = new File([blob], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (err) {
      // AbortError = user dismissed the share sheet without picking a
      // destination — respect that and don't also trigger a silent download.
      if (err instanceof Error && err.name === "AbortError") return;
      // Any other failure (e.g. share sheet unsupported for this file type
      // on this device) — fall through to the blob-download fallback below.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Plain-text export (JSON/CSV) — same save behaviour as downloadBase64File
// (native share sheet on mobile, blob-download fallback on desktop), just
// starting from a text string instead of a base64 payload. UTF-8 safe.
export async function downloadTextFile(
  text: string,
  filename: string,
  mime: string
): Promise<void> {
  const base64 = btoa(unescape(encodeURIComponent(text)));
  await downloadBase64File(base64, filename, mime);
}
