import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Minus, Plus, RotateCcw, X } from "lucide-react";

// In-app viewer for the original PDF/DOCX a target profile was imported
// from (see targetDocumentImports.sourceFileUrl/renderablePdfUrl in
// schema.ts) — opened from the "Original document" box on
// ImportedDocumentCard. Deliberately never downloads or shares the file
// (that's downloadFile.ts's job for Court exports); this only ever
// displays it inside the app, matching the approved "Original Document
// Viewer" mockup.
//
// `mode: "pdf"` renders `url` pixel-for-pixel via pdf.js — used both for a
// real PDF upload's own storage URL, and (for a DOCX upload) the server-
// side LibreOffice-converted PDF companion (see
// server/documentImport/docxToPdf.ts and routers.ts's
// storeTargetDocumentSourceFile), which reproduces the DOCX's real layout
// — column widths, cell shading — exactly, unlike the mammoth.js HTML
// approximation `mode: "docx-approx"` falls back to for a row that
// predates the PDF-conversion column, or whose conversion failed at
// upload time (LibreOffice unavailable, corrupt file) — best-effort
// rather than showing nothing. `originalFileName` is always the true
// uploaded file's own name/extension, shown in the header regardless of
// which mode actually renders `url`.
export function DocumentViewerModal({
  url,
  originalFileName,
  mode,
  onClose,
}: {
  url: string;
  originalFileName: string;
  mode: "pdf" | "docx-approx";
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);

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
        className="relative w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[calc(100vh-3rem)] bg-card border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg border border-slate-500/30 bg-slate-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {originalFileName}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {/\.pdf$/i.test(originalFileName)
                  ? "PDF document"
                  : "Word document"}
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
        <ZoomScrollArea scale={scale} setScale={setScale}>
          {mode === "pdf" ? <PdfPages url={url} /> : <DocxContent url={url} />}
        </ZoomScrollArea>
        <ZoomControls scale={scale} setScale={setScale} />
      </div>
    </div>,
    document.body
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

type SetScale = React.Dispatch<React.SetStateAction<number>>;

// The scrollable page area — kept as a plain in-flow flex-1 child (exactly
// like before zoom existed) so the modal's own height cascade still works:
// the dialog is sm:h-auto capped by sm:max-h, which only resolves to a
// concrete number because ITS content (this element, containing the
// naturally-tall PDF/DOCX content in normal flow) would otherwise exceed
// that cap — wrapping this in a position:absolute layer breaks that, since
// absolutely-positioned elements don't contribute to an ancestor's
// content-based height, collapsing the whole viewer to just the header.
//
// Panning once zoomed in is native browser scroll (CSS transforms are
// included in an element's scrollable overflow in every modern browser),
// not hand-rolled drag tracking; only the zoom LEVEL is custom, via
// pinch/ctrl+wheel here and the +/- buttons in ZoomControls (a sibling,
// not nested in here, so it can float in the dialog's corner without
// scrolling away with the content or needing this element's height at all
// — see the app's global viewport meta in client/index.html for why
// zoom can't just be the browser's native pinch-zoom: maximum-scale=1 is
// set deliberately elsewhere in the app to stop accidental zoom while
// filling in a form).
//
// Touch pinch needs a real (non-passive) touchmove listener to call
// preventDefault — React's onTouchMove JSX prop is attached passively and
// silently can't prevent the browser's own gesture handling, so this
// attaches native listeners via a ref instead.
function ZoomScrollArea({
  scale,
  setScale,
  children,
}: {
  scale: number;
  setScale: SetScale;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(
    null
  );
  // The content's own natural (unscaled) box — offsetWidth/Height are
  // transform-invariant, so this stays accurate regardless of the current
  // scale. Chromium (and WebKit) do NOT grow an overflow:auto ancestor's
  // scrollable region just because a transformed descendant paints larger
  // than its layout box — confirmed by direct measurement, not assumed —
  // so panning around zoomed-in content needs a real layout-sized "sizer"
  // box (natural size × scale) for the scroll container to actually scroll
  // against; the transform below only paints the (still natural-size)
  // content stretched to visually fill that sizer.
  const [naturalSize, setNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;
    const observer = new ResizeObserver(() => {
      setNaturalSize({
        w: contentEl.offsetWidth,
        h: contentEl.offsetHeight,
      });
    });
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          startDistance: distance(e.touches),
          startScale: scale,
        };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const ratio = distance(e.touches) / pinchRef.current.startDistance;
        setScale(
          Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, pinchRef.current.startScale * ratio)
          )
        );
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    // Trackpad pinch on desktop fires as a wheel event with ctrlKey set —
    // the standard (if slightly odd) way browsers report that gesture.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale(s =>
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s - e.deltaY * 0.01))
      );
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [scale, setScale]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-muted/30"
    >
      {/* Sizer: a real layout box (not just a paint-time transform) whose
          size IS natural-size × scale, so the scroll container above has
          something concrete to scroll against once zoomed in. Deliberately
          NOT `position:relative` — that would make IT the containing block
          for the absolutely-positioned content below, coupling the
          content's own shrink-to-fit width to this already-scaled box and
          compounding on every ResizeObserver tick (confirmed by testing:
          scrollWidth ran away into the millions of pixels within a few
          zoom clicks). `containerRef` above is the positioning context
          instead — its size is fixed by the flex layout, not by anything
          in here, so there's no feedback loop. */}
      <div
        className="min-w-full min-h-full"
        style={
          naturalSize
            ? { width: naturalSize.w * scale, height: naturalSize.h * scale }
            : undefined
        }
      >
        {/* Absolutely positioned (relative to containerRef, not the sizer
            above) with no explicit width/height so it shrink-wraps to its
            own natural content size, keeping the ResizeObserver's
            measurement of it accurate regardless of the current scale. */}
        <div
          ref={contentRef}
          className="absolute top-0 left-0 p-3 sm:p-5 origin-top-left"
          style={{ transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Floating +/-/reset cluster, pinned to the dialog's bottom-right corner
// (the dialog is `relative`) regardless of scroll position or zoom level
// inside ZoomScrollArea — a sibling of it, not nested inside its scrolling
// content, so it never scrolls away.
function ZoomControls({
  scale,
  setScale,
}: {
  scale: number;
  setScale: SetScale;
}) {
  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 backdrop-blur shadow-md p-1">
      <button
        type="button"
        onClick={() => setScale(s => Math.max(MIN_ZOOM, s - 0.25))}
        disabled={scale <= MIN_ZOOM}
        aria-label="Zoom out"
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="text-[11px] font-medium text-muted-foreground w-9 text-center tabular-nums select-none">
        {Math.round(scale * 100)}%
      </span>
      <button
        type="button"
        onClick={() => setScale(s => Math.min(MAX_ZOOM, s + 0.25))}
        disabled={scale >= MAX_ZOOM}
        aria-label="Zoom in"
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground disabled:opacity-30 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {scale !== 1 && (
        <button
          type="button"
          onClick={() => setScale(1)}
          aria-label="Reset zoom"
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
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
          // Rendered above 1:1 so zooming in (see ZoomableArea) still looks
          // crisp — zoom is a CSS transform on the already-rasterized
          // canvas, not a re-render, so the base resolution needs enough
          // headroom to cover the max zoom level without visibly blurring.
          const viewport = page.getViewport({ scale: 2 });
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
