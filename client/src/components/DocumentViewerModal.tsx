import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Minus,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import "./documentViewerPdfLayers.css";

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pdfPagesRef = useRef<PdfPagesHandle>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchReady, setSearchReady] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, searchOpen]);

  // Re-run whenever the query changes (debounced) — not on every keystroke
  // immediately, since a 50-page document's search index is cheap but
  // re-running + re-rendering a match list on every single keystroke is
  // still unnecessary churn.
  useEffect(() => {
    if (!searchOpen || !searchReady) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchMatches([]);
      setSearchIndex(0);
      pdfPagesRef.current?.clearHighlight();
      return;
    }
    const timer = setTimeout(() => {
      const matches = pdfPagesRef.current?.search(q) ?? [];
      setSearchMatches(matches);
      setSearchIndex(0);
      if (matches.length > 0) {
        pdfPagesRef.current?.goToMatch(matches[0], q);
      } else {
        pdfPagesRef.current?.clearHighlight();
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, searchReady]);

  const stepMatch = (delta: number) => {
    if (searchMatches.length === 0) return;
    const next =
      (searchIndex + delta + searchMatches.length) % searchMatches.length;
    setSearchIndex(next);
    pdfPagesRef.current?.goToMatch(searchMatches[next], searchQuery.trim());
  };

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
        className="relative w-full h-full sm:h-auto sm:max-w-2xl md:max-w-4xl lg:max-w-6xl sm:max-h-[calc(100vh-3rem)] bg-card border border-border sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
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
          <div className="flex items-center gap-1.5 shrink-0">
            {mode === "pdf" && (
              <button
                onClick={() => setSearchOpen(o => !o)}
                aria-label="Search document"
                aria-pressed={searchOpen}
                className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                  searchOpen
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/20 hover:text-foreground"
                }`}
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {mode === "pdf" && searchOpen && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 bg-muted/20">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") stepMatch(e.shiftKey ? -1 : 1);
              }}
              placeholder={
                searchReady ? "Search in document…" : "Indexing document…"
              }
              disabled={!searchReady}
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            {searchQuery.trim() && (
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                {searchMatches.length > 0
                  ? `Page ${searchMatches[searchIndex]} · ${searchIndex + 1} of ${searchMatches.length}`
                  : "No matches"}
              </span>
            )}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => stepMatch(-1)}
                disabled={searchMatches.length === 0}
                aria-label="Previous match"
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => stepMatch(1)}
                disabled={searchMatches.length === 0}
                aria-label="Next match"
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-accent/20 hover:text-foreground disabled:opacity-30 transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <ZoomScrollArea
          scale={scale}
          setScale={setScale}
          containerRef={scrollContainerRef}
        >
          {mode === "pdf" ? (
            <PdfPages
              ref={pdfPagesRef}
              url={url}
              scrollContainerRef={scrollContainerRef}
              onSearchReady={setSearchReady}
            />
          ) : (
            <DocxContent url={url} />
          )}
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
//
// `containerRef` is accepted rather than created internally so PdfPages
// (a sibling-ish child, rendered via `children`) can use the SAME element
// as its IntersectionObserver root for lazy page rendering — without it,
// the observer would default to the browser viewport, which doesn't know
// this element clips/scrolls its content, and would wrongly treat an
// off-screen (within this scroll area, but still within the outer
// viewport's bounds) page as "visible".
function ZoomScrollArea({
  scale,
  setScale,
  containerRef,
  children,
}: {
  scale: number;
  setScale: SetScale;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
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
  }, [scale, setScale, containerRef]);

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

// One page's own cached state, built once at load time (cheap — text
// extraction, not rendering) and reused both for the whole-document
// search index and later for the actual TextLayer when that page is
// rendered, so the same page's text is never fetched from pdf.js twice.
interface PdfPageEntry {
  pageNum: number;
  wrapper: HTMLDivElement;
  viewport: any; // pdfjs-dist PageViewport, kept to re-derive scaled viewports
  textContent: any; // pdfjs-dist TextContent — fed to TextLayer when rendered
  searchText: string; // lowercased, joined .str of every text item
  rendered: boolean;
  renderPromise: Promise<void> | null;
  textDivs: HTMLElement[] | null; // set once this page's TextLayer renders
  textStrs: string[] | null; // parallel to textDivs
}

export interface PdfPagesHandle {
  /** Returns page numbers (1-indexed, ascending, deduped) containing at
   * least one case-insensitive occurrence of `query`. */
  search: (query: string) => number[];
  /** Renders (if needed), scrolls to, and highlights the first occurrence
   * of `query` on `pageNum`. */
  goToMatch: (pageNum: number, query: string) => void;
  clearHighlight: () => void;
}

const PdfPages = forwardRef<
  PdfPagesHandle,
  {
    url: string;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    onSearchReady: (ready: boolean) => void;
  }
>(function PdfPages({ url, scrollContainerRef, onSearchReady }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  // Surfaced in the error state below — the previous bare "Couldn't
  // display this PDF." with a silently-swallowed error gave no way to
  // tell WHY a load failed on a device this can't be live-tested against
  // (no remote debugger access to an officer's iPad/iPhone in the field),
  // so a screenshot of the error is the only diagnostic channel available.
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const pagesRef = useRef<Map<number, PdfPageEntry>>(new Map());
  const pdfjsRef = useRef<any>(null); // the pdfjs-dist module itself
  const linkServiceRef = useRef<any>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const currentHighlightRef = useRef<HTMLElement[]>([]);

  const scrollPageIntoView = useCallback((pageNum: number) => {
    pagesRef.current.get(pageNum)?.wrapper.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const renderPage = useCallback(async (entry: PdfPageEntry) => {
    if (entry.rendered) return;
    if (entry.renderPromise) return entry.renderPromise;
    const pdfjsLib = pdfjsRef.current;
    const promise = (async () => {
      const { wrapper, viewport, textContent } = entry;
      wrapper.innerHTML = "";

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.className = "absolute inset-0 w-full h-full block bg-white";
      wrapper.appendChild(canvas);
      await (entry as any)._page.render({ canvas, viewport }).promise;

      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "rs-pdf-text-layer";
      wrapper.appendChild(textLayerDiv);
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });
      await textLayer.render();
      entry.textDivs = textLayer.textDivs;
      entry.textStrs = textLayer.textContentItemsStr;

      if (linkServiceRef.current) {
        const annotations = await (entry as any)._page.getAnnotations();
        if (annotations.length > 0) {
          const annotationDiv = document.createElement("div");
          annotationDiv.className = "rs-pdf-annotation-layer";
          wrapper.appendChild(annotationDiv);
          const annotationLayer = new pdfjsLib.AnnotationLayer({
            div: annotationDiv,
            page: (entry as any)._page,
            viewport: viewport.clone({ dontFlip: true }),
            linkService: linkServiceRef.current,
          });
          await annotationLayer.render({ annotations, renderForms: false });
        }
      }
      entry.rendered = true;
    })();
    entry.renderPromise = promise;
    return promise;
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      search(query: string) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const matches: number[] = [];
        for (const entry of Array.from(pagesRef.current.values())) {
          if (entry.searchText.includes(q)) matches.push(entry.pageNum);
        }
        matches.sort((a, b) => a - b);
        return matches;
      },
      goToMatch(pageNum: number, query: string) {
        const entry = pagesRef.current.get(pageNum);
        if (!entry) return;
        (async () => {
          await renderPage(entry);
          scrollPageIntoView(pageNum);
          highlightMatchOnPage(entry, query, currentHighlightRef);
        })();
      },
      clearHighlight() {
        clearHighlight(currentHighlightRef);
      },
    }),
    [renderPage, scrollPageIntoView]
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorDetail(null);
    onSearchReady(false);
    pagesRef.current.clear();
    (async () => {
      try {
        // pdfjs-dist@6.3.289 calls Map.prototype.getOrInsertComputed
        // internally (confirmed via direct testing against a real build of
        // Chromium 141 — a very recent browser, not some old holdout) — a
        // Map method that's a TC39 proposal not yet shipped in ANY current
        // browser engine. Without this, the very first page.render() call
        // throws, which would otherwise make every PDF in the app
        // unviewable, not just the new search/links work here. Applied
        // once per module load; a no-op once browsers actually ship this.
        if (!(Map.prototype as any).getOrInsertComputed) {
          (Map.prototype as any).getOrInsertComputed = function (
            this: Map<unknown, unknown>,
            key: unknown,
            callbackFn: (key: unknown) => unknown
          ) {
            if (this.has(key)) return this.get(key);
            const value = callbackFn(key);
            this.set(key, value);
            return value;
          };
        }
        const pdfjsLib = await import("pdfjs-dist");
        const { EventBus, PDFLinkService } = await import(
          "pdfjs-dist/web/pdf_viewer.mjs"
        );
        // Routed through a thin local wrapper, not pdfjs-dist's worker
        // build directly — the pdf.js Worker itself (a separate global
        // scope) ALSO calls Map.prototype.getOrInsertComputed extensively,
        // and the polyfill above only reaches the main thread. See
        // lib/pdfjsWorkerEntry.ts for the worker-side half of this fix.
        //
        // Imported with the `?worker&url` suffix (Vite's documented
        // pattern for "bundle this file as a worker script and give me its
        // built URL as a string") rather than a bare
        // `new URL("...", import.meta.url)` — that pattern only gets
        // Vite's special worker-bundling treatment when it's the direct
        // argument to a literal `new Worker(...)` call; pdf.js constructs
        // its OWN Worker internally from the URL STRING handed to
        // workerSrc, so Vite's static analysis never saw a Worker
        // constructor here and silently treated it as a generic (and, for
        // a .ts source file, nonsensical) asset reference — confirmed by
        // inspecting a real `vite build` output: the wrapper file never
        // appeared in dist at all, meaning workerSrc would have pointed at
        // a URL that doesn't exist in production. `?worker&url` is
        // resolved by Vite's plugin purely from the import specifier
        // string, so it works the same whether this import is static or
        // (as here) dynamic.
        const pdfjsWorkerUrl = (
          await import("../lib/pdfjsWorkerEntry.ts?worker&url")
        ).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
        pdfjsRef.current = pdfjsLib;
        const buffer = await (await fetch(url)).arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;

        // Clickable internal/external links (see AnnotationLayer below) —
        // a real PDFLinkService, not a hand-rolled stand-in, so named/
        // explicit destination resolution matches what every other PDF
        // viewer does. It only needs ONE thing from "the viewer" it
        // normally drives: scrollPageIntoView(pageNumber) — so instead of
        // the full PDFViewer component (which owns its own scroll/zoom
        // model, incompatible with this modal's existing pinch-zoom
        // CSS-transform approach above), it's handed a minimal object
        // that just does that one thing against this component's own
        // lazily-rendered page wrappers.
        const eventBus = new EventBus();
        const linkService = new PDFLinkService({ eventBus });
        linkService.setDocument(pdf);
        linkService.setViewer({
          scrollPageIntoView: ({ pageNumber }: { pageNumber: number }) => {
            const entry = pagesRef.current.get(pageNumber);
            if (!entry) return;
            void renderPage(entry).then(() => scrollPageIntoView(pageNumber));
          },
        });
        linkServiceRef.current = linkService;

        const root = rootRef.current;
        if (!root) return;
        root.innerHTML = "";

        // Target CSS width for each page — fills the viewer's own current
        // width (minus its p-3/sm:p-5 padding) rather than always being
        // the PDF's native point-size, which only happened to roughly
        // fill the viewer back when the dialog was a fixed ~672px wide.
        // Widening the dialog (sm:max-w-2xl → lg:max-w-6xl) otherwise left
        // a growing blank gutter beside a page that never grew past its
        // own native size. Read once, up front — pages are laid out once
        // per open, with pinch/ctrl+wheel zoom afterwards handled entirely
        // by ZoomScrollArea's CSS transform, not by re-laying-out pages.
        const containerWidth = scrollContainerRef.current?.clientWidth ?? 800;
        const targetPageWidth = Math.max(
          200,
          Math.min(containerWidth - 48, 1400)
        );

        // Pass 1 (cheap): build every page's placeholder + search index up
        // front, so the document's full scroll height is correct from the
        // start (no layout shift as pages lazily render in) and the whole
        // document is searchable immediately, before a single page has
        // actually been drawn.
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          // Render scale derived from this page's own native size so the
          // canvas's actual pixel resolution matches targetPageWidth (the
          // CSS width it's displayed at) at 2x for retina sharpness —
          // the same 2x headroom the previous fixed `scale: 2` gave when
          // displayed at (that viewport's width / 2).
          const baseViewport = page.getViewport({ scale: 1 });
          const renderScale = (targetPageWidth / baseViewport.width) * 2;
          const viewport = page.getViewport({ scale: renderScale });
          const textContent = await page.getTextContent();
          const searchText = (textContent.items as any[])
            .map(it => ("str" in it ? it.str : ""))
            .join(" ")
            .toLowerCase();

          const wrapper = document.createElement("div");
          wrapper.className =
            "relative rounded border border-border shadow-sm bg-white mb-3 last:mb-0 overflow-hidden";
          // An explicit (non-percentage) width, not just w-full — this
          // wrapper sits inside ZoomScrollArea's absolutely-positioned,
          // shrink-to-fit content box (see its own comment: no explicit
          // width, so ResizeObserver can measure the content's OWN natural
          // size for the zoom "sizer"). The old implementation's bare
          // <canvas> worked as w-full there because a canvas is a replaced
          // element with real intrinsic pixel dimensions the shrink-to-fit
          // algorithm can anchor to; a plain <div> has none, so a `w-full`
          // div here (and everything inside it, also w-full) has nothing
          // to resolve its percentage against — confirmed by direct
          // testing: every page rendered at ~2px instead of filling the
          // modal. A real, non-percentage width (capped by max-width so it
          // still shrinks on a narrow phone screen) gives the whole chain
          // something concrete to anchor to again.
          wrapper.style.width = `${targetPageWidth}px`;
          wrapper.style.maxWidth = "100%";
          wrapper.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
          wrapper.dataset.pageNum = String(pageNum);
          root.appendChild(wrapper);

          const entry: PdfPageEntry = {
            pageNum,
            wrapper,
            viewport,
            textContent,
            searchText,
            rendered: false,
            renderPromise: null,
            textDivs: null,
            textStrs: null,
          };
          (entry as any)._page = page;
          pagesRef.current.set(pageNum, entry);
        }
        if (cancelled) return;
        onSearchReady(true);

        // Pass 2: lazily render each page (canvas + text layer + link
        // layer) once its placeholder is near the viewport, instead of
        // rendering all N pages immediately — a 50-page/100-image document
        // rendering eagerly was the original slow/heavy case this whole
        // feature exists to fix.
        const observer = new IntersectionObserver(
          entries => {
            for (const obs of entries) {
              if (!obs.isIntersecting) continue;
              const pageNum = Number(
                (obs.target as HTMLElement).dataset.pageNum
              );
              const entry = pagesRef.current.get(pageNum);
              if (entry) void renderPage(entry);
            }
          },
          {
            root: scrollContainerRef.current,
            // Start rendering a little before a page is actually visible
            // so scrolling doesn't outrun rendering and show a blank gap.
            rootMargin: "600px 0px",
          }
        );
        observerRef.current = observer;
        for (const entry of Array.from(pagesRef.current.values())) {
          observer.observe(entry.wrapper);
        }

        setStatus("done");
      } catch (e) {
        console.error("[DocumentViewerModal] PDF render failed:", e);
        if (!cancelled) {
          const err = e as { name?: string; message?: string } | undefined;
          setErrorDetail(
            err?.name || err?.message
              ? `${err?.name ?? "Error"}: ${err?.message ?? "(no message)"}`
              : String(e)
          );
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div>
      {status === "loading" && <ViewerStatus text="Loading document…" />}
      {status === "error" && (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Couldn't display this PDF.
          </p>
          {errorDetail && (
            <p className="mt-2 px-6 text-[11px] text-muted-foreground/70 font-mono break-words">
              {errorDetail}
            </p>
          )}
        </div>
      )}
      <div ref={rootRef} />
    </div>
  );
});

function clearHighlight(ref: React.MutableRefObject<HTMLElement[]>) {
  for (const el of ref.current) {
    el.classList.remove("rs-pdf-search-match", "rs-pdf-search-match-current");
  }
  ref.current = [];
}

// Finds every text span on this (already-rendered) page whose text
// contains `query` and marks the first one as the "current" match —
// page-level granularity is what search navigation actually needs (jump
// to the right page), this is the extra polish of also showing exactly
// where on that page it is, now that the text layer's real DOM spans are
// available to search within directly.
function highlightMatchOnPage(
  entry: PdfPageEntry,
  query: string,
  ref: React.MutableRefObject<HTMLElement[]>
) {
  clearHighlight(ref);
  if (!entry.textDivs || !entry.textStrs) return;
  const q = query.trim().toLowerCase();
  if (!q) return;
  let markedCurrent = false;
  const matched: HTMLElement[] = [];
  entry.textStrs.forEach((str, i) => {
    if (!str.toLowerCase().includes(q)) return;
    const div = entry.textDivs![i];
    if (!div) return;
    div.classList.add("rs-pdf-search-match");
    if (!markedCurrent) {
      div.classList.add("rs-pdf-search-match-current");
      markedCurrent = true;
    }
    matched.push(div);
  });
  ref.current = matched;
}

function DocxContent({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setErrorDetail(null);
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const buffer = await (await fetch(url)).arrayBuffer();
        if (cancelled) return;
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (cancelled) return;
        setHtml(result.value);
        setStatus("done");
      } catch (e) {
        console.error("[DocumentViewerModal] DOCX render failed:", e);
        if (!cancelled) {
          const err = e as { name?: string; message?: string } | undefined;
          setErrorDetail(
            err?.name || err?.message
              ? `${err?.name ?? "Error"}: ${err?.message ?? "(no message)"}`
              : String(e)
          );
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (status === "loading") return <ViewerStatus text="Loading document…" />;
  if (status === "error" || html === null)
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Couldn't display this document.
        </p>
        {errorDetail && (
          <p className="mt-2 px-6 text-[11px] text-muted-foreground/70 font-mono break-words">
            {errorDetail}
          </p>
        )}
      </div>
    );

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
