/**
 * "Insert Map Snapshot" flow for a SMEAC briefing — two ways to bring a
 * marked-up section of the map into the document:
 *   - Upload a screenshot the officer already took (their own OS/device
 *     screenshot) — most reliable, works on every device, inserted as-is.
 *   - Capture the live map via the browser's own screen-capture API
 *     (getDisplayMedia) — an exact pixel match of whatever's on screen
 *     (custom icons, shapes, labels and all), then cropped down to just
 *     the relevant area before it's attached. Desktop/laptop browsers
 *     only — most phones and some tablets don't support getDisplayMedia,
 *     so "Upload" is the fallback that always works.
 *
 * DOM-to-canvas screenshotting (html2canvas) was tried for the map
 * elsewhere in this app and abandoned — Google Maps' tiles are
 * cross-origin, so the browser refuses to let JS read their pixels via
 * canvas (see todo.md). getDisplayMedia sidesteps that entirely: it
 * captures real screen pixels through the browser's own screen-sharing
 * permission, not a DOM read, so it isn't subject to that restriction.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { compressAttachmentImage } from "@/lib/imageCompress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, MonitorUp, Loader2 } from "lucide-react";

// Matches imageCompress.ts's ATTACHMENT_MAX_DIMENSION — a captured frame
// can be very large (a 4K or Retina display), so the cropped result is
// downscaled the same way an uploaded photo already is.
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
const MIN_CROP_FRACTION = 0.1;

type CropRect = { x: number; y: number; w: number; h: number };
type Handle = "nw" | "ne" | "sw" | "se";
type DragState =
  | {
      mode: "move";
      startX: number;
      startY: number;
      orig: CropRect;
      stageW: number;
      stageH: number;
    }
  | {
      mode: "resize";
      handle: Handle;
      startX: number;
      startY: number;
      orig: CropRect;
      stageW: number;
      stageH: number;
    };

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function readFileAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(blob);
  });
}

/** Crops a source canvas down to `rect` (fractional, 0-1) and re-encodes
 * it as a downscaled JPEG blob. */
function cropCanvasToJpeg(
  source: HTMLCanvasElement,
  rect: CropRect
): Promise<Blob | null> {
  const sx = rect.x * source.width;
  const sy = rect.y * source.height;
  const sw = rect.w * source.width;
  const sh = rect.h * source.height;
  let outW = sw;
  let outH = sh;
  if (outW > MAX_DIMENSION || outH > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(outW, outH);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  return new Promise(resolve =>
    out.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
}

export function MapSnapshotDialog({
  open,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (result: { url: string; source: "upload" | "capture" }) => void;
}) {
  const [view, setView] = useState<"choice" | "capture-intro" | "cropping">(
    "choice"
  );
  const [busy, setBusy] = useState(false);
  const [captureCanvas, setCaptureCanvas] = useState<HTMLCanvasElement | null>(
    null
  );
  const [cropRect, setCropRect] = useState<CropRect>({
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const uploadMut = trpc.smeacBriefing.uploadMapSnapshot.useMutation();

  // Reset to the choice screen every time the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setView("choice");
      setCaptureCanvas(null);
      setCropRect({ x: 0, y: 0, w: 1, h: 1 });
      setBusy(false);
    }
  }, [open]);

  // This form's own tab never has the map on it — the whole SPA shares one
  // static <title> (see index.html), so an officer's second tab of this
  // same app looks identical to this one in the browser's screen-share
  // picker, with nothing to tell them apart by name. Opening it here (with
  // ?forCapture=1, which IntelligenceMapping.tsx uses to give that one tab
  // a distinct title — see the effect there) guarantees the right tab
  // actually exists before the picker opens, and gives the officer
  // something to look for in it.
  const openMapTab = () => {
    window.open("/intelligence/mapping?forCapture=1", "_blank");
  };

  const uploadBlob = async (
    blob: Blob,
    mimeType: string,
    source: "upload" | "capture"
  ) => {
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(blob);
      const dataBase64 = dataUrl.split(",")[1] ?? "";
      const { url } = await uploadMut.mutateAsync({ dataBase64, mimeType });
      onInsert({ url, source });
      onOpenChange(false);
      toast.success("Map snapshot added to the briefing");
    } catch {
      toast.error("Couldn't upload that image — try again.");
    } finally {
      setBusy(false);
    }
  };

  // ── Upload a screenshot ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressAttachmentImage(file);
      const blob = compressed?.blob ?? file;
      const mimeType = compressed?.mimeType ?? file.type;
      await uploadBlob(blob, mimeType, "upload");
    } catch {
      toast.error("Couldn't process that image — try again.");
      setBusy(false);
    }
  };

  // ── Capture the live map ──
  const startCapture = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error(
        "Screen capture isn't supported in this browser — use Upload a screenshot instead."
      );
      return;
    }
    let stream: MediaStream;
    try {
      // No preferCurrentTab hint — this form never has the map on it (see
      // the class doc comment above), so pre-selecting "this tab" would
      // pre-select the wrong one. The officer needs the browser's normal
      // picker so they can choose whichever other tab/window actually has
      // the map open.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      // Permission denied, or the officer cancelled the picker — not an
      // error worth surfacing as one.
      return;
    }
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      // First frame or two can be blank while the capture spins up.
      await new Promise(r => setTimeout(r, 150));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0) {
        toast.error("Couldn't capture that — try again.");
        return;
      }
      ctx.drawImage(video, 0, 0);
      setCaptureCanvas(canvas);
      setCropRect({ x: 0, y: 0, w: 1, h: 1 });
      setView("cropping");
    } finally {
      stream.getTracks().forEach(t => t.stop());
    }
  };

  // ── Crop box drag/resize (pointer events; fractional 0-1 coordinates,
  //    so the math is independent of the captured image's actual
  //    resolution or how large the stage renders on screen). ──
  const onBoxPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // a handle's own listener applies
    const stage = stageRef.current;
    if (!stage) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = stage.getBoundingClientRect();
    dragStateRef.current = {
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      orig: cropRect,
      stageW: rect.width,
      stageH: rect.height,
    };
  };
  const onHandlePointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const stage = stageRef.current;
    if (!stage) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = stage.getBoundingClientRect();
    dragStateRef.current = {
      mode: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: cropRect,
      stageW: rect.width,
      stageH: rect.height,
    };
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / drag.stageW;
    const dy = (e.clientY - drag.startY) / drag.stageH;
    if (drag.mode === "move") {
      const o = drag.orig;
      setCropRect({
        x: clamp(o.x + dx, 0, 1 - o.w),
        y: clamp(o.y + dy, 0, 1 - o.h),
        w: o.w,
        h: o.h,
      });
      return;
    }
    const o = drag.orig;
    let left = o.x,
      top = o.y,
      right = o.x + o.w,
      bottom = o.y + o.h;
    if (drag.handle === "se") {
      right = o.x + o.w + dx;
      bottom = o.y + o.h + dy;
    } else if (drag.handle === "sw") {
      left = o.x + dx;
      bottom = o.y + o.h + dy;
    } else if (drag.handle === "ne") {
      right = o.x + o.w + dx;
      top = o.y + dy;
    } else if (drag.handle === "nw") {
      left = o.x + dx;
      top = o.y + dy;
    }
    left = clamp(left, 0, right - MIN_CROP_FRACTION);
    top = clamp(top, 0, bottom - MIN_CROP_FRACTION);
    right = clamp(right, left + MIN_CROP_FRACTION, 1);
    bottom = clamp(bottom, top + MIN_CROP_FRACTION, 1);
    setCropRect({ x: left, y: top, w: right - left, h: bottom - top });
  };
  const onStagePointerUp = () => {
    dragStateRef.current = null;
  };

  const useThisArea = async () => {
    if (!captureCanvas) return;
    const blob = await cropCanvasToJpeg(captureCanvas, cropRect);
    if (!blob) {
      toast.error("Couldn't process that capture — try again.");
      return;
    }
    await uploadBlob(blob, "image/jpeg", "capture");
  };

  return (
    <Dialog open={open} onOpenChange={v => !busy && onOpenChange(v)}>
      <DialogContent className={view === "cropping" ? "sm:max-w-xl" : ""}>
        <DialogHeader>
          <DialogTitle>
            {view === "choice"
              ? "Insert Map Snapshot"
              : view === "capture-intro"
                ? "Capture Map Area"
                : "Frame the area"}
          </DialogTitle>
        </DialogHeader>

        {view === "choice" && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground -mt-1 mb-1">
              Choose how to bring the marked-up area into this briefing.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-start gap-3 text-left rounded-lg border border-border bg-muted/30 hover:border-primary p-3 disabled:opacity-50"
            >
              <Upload className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">
                  Upload a screenshot
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Take your own screenshot of the marked-up map and drop it in —
                  an exact match of what's on screen, works on any device.
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setView("capture-intro")}
              className="flex items-start gap-3 text-left rounded-lg border border-border bg-muted/30 hover:border-primary p-3 disabled:opacity-50"
            >
              <MonitorUp className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>
                <span className="block text-sm font-semibold">
                  Capture map area
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Grabs the live map straight from your screen, then crop it
                  down. Laptop/desktop browsers only.
                </span>
              </span>
            </button>
            {busy && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </div>
            )}
          </div>
        )}

        {view === "capture-intro" && (
          <div className="flex flex-col gap-3">
            <ol className="text-sm space-y-2.5 list-decimal list-inside marker:text-muted-foreground marker:font-semibold">
              <li>
                Click <b>Open Map in New Tab</b> below.
              </li>
              <li>
                In that tab, mark up whatever the briefing needs, then switch
                back to this tab.
              </li>
              <li>
                Click <b>Continue</b> — your browser will ask which tab to
                share. Choose the one titled{" "}
                <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">
                  RunLog — Map (select this tab)
                </span>
                .
              </li>
            </ol>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openMapTab}
              className="self-start gap-1.5"
            >
              <MonitorUp className="h-3.5 w-3.5" /> Open Map in New Tab
            </Button>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setView("choice")}
              >
                Back
              </Button>
              <Button disabled={busy} onClick={startCapture}>
                {busy && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {view === "cropping" && captureCanvas && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground -mt-1">
              Drag the box, or its corners, down to just the part that matters
              for this briefing.
            </p>
            <div
              ref={stageRef}
              className="relative w-full overflow-hidden rounded-lg border border-border touch-none select-none"
              style={{
                aspectRatio: `${captureCanvas.width} / ${captureCanvas.height}`,
              }}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
              onPointerCancel={onStagePointerUp}
            >
              <img
                src={captureCanvas.toDataURL("image/jpeg", 0.7)}
                alt="Captured map"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                draggable={false}
              />
              <div
                onPointerDown={onBoxPointerDown}
                className="absolute border-2 border-white cursor-move"
                style={{
                  left: `${cropRect.x * 100}%`,
                  top: `${cropRect.y * 100}%`,
                  width: `${cropRect.w * 100}%`,
                  height: `${cropRect.h * 100}%`,
                  boxShadow: "0 0 0 2000px rgba(6,10,20,.55)",
                }}
              >
                {(["nw", "ne", "sw", "se"] as const).map(h => (
                  <div
                    key={h}
                    onPointerDown={onHandlePointerDown(h)}
                    className="absolute h-4 w-4 rounded-full bg-white border-2 border-primary"
                    style={{
                      top: h[0] === "n" ? 0 : "100%",
                      left: h[1] === "w" ? 0 : "100%",
                      transform: "translate(-50%, -50%)",
                      cursor:
                        h === "nw" || h === "se"
                          ? "nwse-resize"
                          : "nesw-resize",
                    }}
                  />
                ))}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setView("choice")}
              >
                Cancel
              </Button>
              <Button disabled={busy} onClick={useThisArea}>
                {busy && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Use This Area
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
