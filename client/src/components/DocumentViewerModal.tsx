import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, X } from "lucide-react";

// In-app viewer for the original PDF/DOCX a target profile was imported
// from (see targetDocumentImports.sourceFileUrl in schema.ts) — opened from
// the "Original document" box on ImportedDocumentCard. Deliberately never
// downloads or shares the file (that's downloadFile.ts's job for Court
// exports); this only ever displays it inside the app, matching the
// approved "Original Document Viewer" mockup. Rendering is fully
// client-side and deterministic — pdf.js draws the PDF's real pages onto a
// canvas, mammoth.js converts the DOCX's real content to HTML — no server
// round trip beyond fetching the stored bytes, no AI/LLM call anywhere in
// the path (see CLAUDE.md's Golden Rule).
export function DocumentViewerModal({
  url,
  fileName,
  onClose,
}: {
  url: string;
  fileName: string;
  onClose: () => void;
}) {
  const isPdf = /\.pdf$/i.test(fileName);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 dark:bg-black/70 p-0 sm:p-6"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Document viewer"
        className="w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[calc(100vh-3rem)] bg-card border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg border border-slate-500/30 bg-slate-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {fileName}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isPdf ? "PDF document" : "Word document"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-muted/30 p-3 sm:p-5">
          {isPdf ? <PdfPages url={url} /> : <DocxContent url={url} />}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ViewerStatus({ text }: { text: string }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-16">{text}</p>
  );
}

function PdfPages({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const buffer = await (await fetch(url)).arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className =
            "w-full h-auto rounded border border-border shadow-sm bg-white mb-3 last:mb-0";
          await page.render({ canvas, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div>
      {status === "loading" && <ViewerStatus text="Loading document…" />}
      {status === "error" && <ViewerStatus text="Couldn't display this PDF." />}
      <div ref={containerRef} />
    </div>
  );
}

function DocxContent({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const buffer = await (await fetch(url)).arrayBuffer();
        if (cancelled) return;
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (cancelled) return;
        setHtml(result.value);
        setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (status === "loading") return <ViewerStatus text="Loading document…" />;
  if (status === "error" || html === null)
    return <ViewerStatus text="Couldn't display this document." />;

  return (
    <>
      {/* Target-profile source .docx files are built around a dense,
          merged-cell table (NAME/DOB/ALIASES row-labels beside a photo,
          several label+value columns per row, colspan'd section headings)
          designed to look right only with the original file's own column
          widths — which Word stores but mammoth.convertToHtml (deliberately
          scoped to content, not layout) doesn't carry over. Left as browser-
          default table-layout:auto, many now-width-less columns collapse to
          near zero (an empty <td> used purely for visual alignment in Word
          has no intrinsic width to size itself by) while whichever column
          happens to hold the longest paragraph swallows the rest — the
          "everything squeezed into one narrow column" look a real officer
          reported. table-layout:fixed sidesteps that by dividing the table
          evenly across its column count instead of trying to infer widths
          from content — not pixel-identical to the original (that's what
          the PDF path is for), but every field stays legible. */}
      <style>{`
        .doc-viewer-page table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .doc-viewer-page td, .doc-viewer-page th {
          border: 1px solid #cbd5e1;
          padding: 0.3rem 0.4rem;
          vertical-align: top;
          overflow-wrap: break-word;
          font-size: 0.8rem;
        }
        .doc-viewer-page td:empty, .doc-viewer-page th:empty { border-color: transparent; }
        .doc-viewer-page img { max-width: 100%; height: auto; display: block; }
      `}</style>
      <article
        className="doc-viewer-page bg-white text-slate-900 rounded border border-border shadow-sm p-6 [&_p]:my-2 [&_p]:leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:my-2.5 [&_h3]:text-base [&_h3]:font-bold [&_h3]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        // Deterministic, on-device conversion of the officer's own uploaded
        // DOCX bytes (mammoth.convertToHtml above) — not user-authored HTML
        // from an untrusted third party, and the same trust boundary as any
        // other document content already shown elsewhere on this page.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
