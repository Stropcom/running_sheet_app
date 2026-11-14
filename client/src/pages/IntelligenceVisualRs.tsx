// Visual RS — a report in the Intelligence folder: one running sheet in time
// order, with a map or satellite picture of where the target is at every flag
// change (the flag drawn exactly as on the Map page) and every other
// observation kept as a plain text entry between the pictures. The rules that
// decide the frames are shared/visualRs.ts; nothing here is generated or
// guessed — the text is each row's own observation.
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileDown, ImageOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FORM_LABEL } from "@/lib/formKit";
import {
  SECTION_BAND,
  SECTION_CARD,
  SECTION_COUNT,
  SECTION_TITLE,
} from "@/lib/pageKit";
import type {
  VisualRsEntry,
  VisualRsFlag,
  VisualRsPlacedFrame,
} from "@shared/visualRs";
import {
  VisualRsPicture,
  viewOfFrame,
  type PictureMode,
} from "@/pages/visualRs/VisualRsPicture";

const KIND_TONE: Record<string, string> = {
  commenced: "border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  inside: "border-blue-600/50 bg-blue-600/10 text-blue-800 dark:text-blue-300",
  vehicle:
    "border-violet-600/50 bg-violet-600/10 text-violet-800 dark:text-violet-300",
  moving:
    "border-violet-600/50 bg-violet-600/10 text-violet-800 dark:text-violet-300",
  walking:
    "border-orange-600/50 bg-orange-600/10 text-orange-800 dark:text-orange-300",
  ceased: "border-rose-600/50 bg-rose-600/10 text-rose-800 dark:text-rose-300",
};
const toneOf = (flag: VisualRsFlag) =>
  KIND_TONE[flag.kind] ??
  "border-slate-500/50 bg-slate-500/10 text-slate-800 dark:text-slate-300";

function FlagChip({ flag }: { flag: VisualRsFlag }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneOf(flag)}`}
    >
      {flag.label}
    </span>
  );
}

function Observation({
  rowNumber,
  time,
  text,
}: {
  rowNumber: number | null;
  time: string | null;
  text: string;
}) {
  return (
    <p className="m-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
      <span className="mb-0.5 block font-mono text-xs text-muted-foreground">
        Running sheet observation
        {rowNumber != null ? ` · Row ${rowNumber}` : ""}
        {time ? ` · ${time}` : ""}
      </span>
      {text}
    </p>
  );
}

function Why({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="vrs-noprint self-start text-xs text-primary underline underline-offset-2"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {label}
      </button>
      {open && (
        <p className="vrs-noprint m-0 rounded-r-md border-l-[3px] border-primary bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          {text}
        </p>
      )}
    </>
  );
}

function Frame({
  frame,
  mode,
}: {
  frame: VisualRsPlacedFrame;
  mode: PictureMode;
}) {
  const { row, flag } = frame;
  return (
    <article className="vrs-item grid grid-cols-1 gap-1 @lg:grid-cols-[4.5rem_minmax(0,1fr)] @lg:gap-3">
      <div className="flex items-baseline gap-2 @lg:block @lg:pt-2.5 @lg:text-right">
        <div className="font-mono text-[15px] font-semibold tabular-nums">
          {row.time ?? "—"}
        </div>
        <div className="text-xs text-muted-foreground">
          {frame.dwellMinutes != null
            ? `for ${frame.dwellMinutes} min`
            : "to the end"}
        </div>
      </div>
      <div className="vrs-card grid min-w-0 grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm @2xl:grid-cols-[minmax(0,22.5rem)_minmax(0,1fr)]">
        <div className="border-b border-border bg-muted/30 @2xl:border-b-0 @2xl:border-r">
          <VisualRsPicture frame={frame} mode={mode} />
        </div>
        <div className="flex min-w-0 flex-col gap-2 p-3.5">
          <div>
            <FlagChip flag={flag} />
          </div>
          <h3 className="m-0 text-base font-semibold leading-tight text-foreground">
            {flag.place ?? "Place not named"}
          </h3>
          {(frame.placeFrom || frame.flagFrom) && (
            <p className="m-0 text-xs text-muted-foreground">
              {frame.placeFrom && (
                <>
                  <b className="text-foreground">Place:</b> {frame.placeFrom} →{" "}
                  {flag.place}
                </>
              )}
              {frame.placeFrom && frame.flagFrom && " · "}
              {frame.flagFrom && (
                <>
                  <b className="text-foreground">Flag:</b> {frame.flagFrom} →{" "}
                  {flag.label}
                </>
              )}
            </p>
          )}
          {flag.rego && (
            <p className="m-0 text-xs text-muted-foreground">
              <b className="text-foreground">Vehicle {flag.rego}</b>{" "}
              {frame.vehicle
                ? viewOfFrame(frame, mode)?.vehicleShown
                  ? "is shown: it has a marker on the map."
                  : "has a marker on the map, but it is too far from this place to fit in the picture."
                : "is not shown: no marker in this operation has its registration in its label, so it is not placed."}
            </p>
          )}
          <Observation
            rowNumber={row.rowNumber}
            time={row.time}
            text={row.observation}
          />
          <Why text={frame.why} label="Why this frame?" />
        </div>
      </div>
    </article>
  );
}

function Entry({ entry }: { entry: VisualRsEntry }) {
  const { row } = entry;
  return (
    <article className="vrs-item grid grid-cols-1 gap-1 @lg:grid-cols-[4.5rem_minmax(0,1fr)] @lg:gap-3">
      <div className="font-mono text-[13px] tabular-nums text-muted-foreground @lg:pt-2 @lg:text-right">
        {row.time ?? "—"}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-dashed border-border bg-card px-3 py-2">
        <Observation
          rowNumber={row.rowNumber}
          time={row.time}
          text={row.observation}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5">
            No flag change, no picture
          </span>
          {entry.flag && (
            <span>
              Flag stays {entry.flag.label}
              {entry.flag.place ? ` at ${entry.flag.place}` : ""}
            </span>
          )}
          <Why text={entry.why} label="Why no picture?" />
        </div>
      </div>
    </article>
  );
}

export default function IntelligenceVisualRs() {
  const [operationId, setOperationId] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [mode, setMode] = useState<PictureMode>("map");
  const [showEntries, setShowEntries] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  const { data: operations } = trpc.operation.list.useQuery();
  const { data: sheets } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId! },
    { enabled: operationId != null }
  );
  const { data: nearmap } = trpc.intelligence.nearmapAvailable.useQuery();
  useEffect(() => setSheetId(null), [operationId]);
  useEffect(() => {
    if (nearmap && !nearmap.configured && mode === "sat") setMode("map");
  }, [nearmap, mode]);

  const query = trpc.intelligence.visualRs.useQuery(
    { sheetId: sheetId! },
    { enabled: sheetId != null, staleTime: 60_000, retry: false }
  );
  const report = query.data;
  const items = useMemo(
    () => (report?.items ?? []).filter(i => showEntries || i.kind === "frame"),
    [report, showEntries]
  );
  const frames = (report?.items ?? []).filter(i => i.kind === "frame").length;
  const entries = (report?.items.length ?? 0) - frames;

  // Print / save as PDF: the report body in its own window with this page's
  // styles (light), so the layout is the same and nothing is clipped by the
  // app's scrolling panels.
  function exportPdf() {
    const node = reportRef.current;
    if (!node || !report) return;
    const clone = node.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".vrs-noprint").forEach(n => n.remove());
    const styles = Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style')
    )
      .map(n => n.outerHTML)
      .join("\n");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>Visual RS — ${report.sheet.title.replace(/[<&]/g, "")}</title>${styles}<style>
        body{background:#fff;color:#14181d;padding:16px}
        .vrs-item{break-inside:avoid;margin-bottom:10px;grid-template-columns:4.6rem minmax(0,1fr)!important;gap:.6rem!important}
        .vrs-item>div:first-child{display:block!important;text-align:right!important;padding-top:.5rem!important;white-space:nowrap}
        /* on paper: the picture takes half the width, the text the other half */
        .vrs-card{grid-template-columns:1fr 1fr!important}
        .vrs-card>div:first-child{border-bottom:0!important;border-right:1px solid #d3dce4!important}
        @page{size:A4;margin:12mm}
      </style></head><body><div class="vrs-print-notice" style="font-size:11px;color:#55677a;border-top:1px solid #c8d1d9;margin-top:12px;padding-top:6px">Not a certified evidentiary document. Pictures show the place from the source stated; they are not photographs of the event. Observations are taken from the running sheet. Generated from the running sheet by the Target Logger rules · no AI used.</div></body></html>`
    );
    win.document.body.insertBefore(
      win.document.importNode(clone, true),
      win.document.body.firstChild
    );
    win.document.close();
    setTimeout(() => win.print(), 1200);
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <section className={`${SECTION_CARD} vrs-noprint`}>
        <div className={`${SECTION_BAND} flex-wrap`}>
          <Eye className="h-4 w-4 text-muted-foreground" />
          <h2 className={`${SECTION_TITLE} whitespace-nowrap`}>Visual RS</h2>
          {report && (
            <span className={`${SECTION_COUNT} whitespace-nowrap`}>
              {frames} picture{frames === 1 ? "" : "s"} · {entries} text-only
              {entries === 1 ? " entry" : " entries"}
            </span>
          )}
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={exportPdf}
              disabled={!report || items.length === 0}
            >
              <FileDown className="mr-1.5 h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
        <p className="mb-3 text-sm text-foreground/70">
          The running sheet in order, with a picture of where the target is at
          every flag change. Observations that do not change the flag stay in
          place as text.
        </p>
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <div className="min-w-0">
            <span className={FORM_LABEL}>Operation</span>
            <Select
              value={operationId != null ? String(operationId) : undefined}
              onValueChange={v => setOperationId(Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an operation…" />
              </SelectTrigger>
              <SelectContent>
                {(operations ?? []).map(op => (
                  <SelectItem key={op.id} value={String(op.id)}>
                    {op.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <span className={FORM_LABEL}>Running sheet</span>
            <Select
              value={sheetId != null ? String(sheetId) : undefined}
              onValueChange={v => setSheetId(Number(v))}
              disabled={operationId == null}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a running sheet…" />
              </SelectTrigger>
              <SelectContent>
                {(sheets ?? []).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <span className={FORM_LABEL}>Picture</span>
            <div
              className="grid grid-cols-2 overflow-hidden rounded-md border border-border"
              role="group"
              aria-label="Picture"
            >
              {(
                [
                  ["map", "Map"],
                  ["sat", "Satellite"],
                ] as const
              ).map(([value, label]) => {
                const off = value === "sat" && nearmap?.configured === false;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    disabled={off}
                    title={
                      off ? "Satellite is not set up on this server" : undefined
                    }
                    onClick={() => setMode(value)}
                    className={`h-9 text-sm ${mode === value ? "bg-primary font-semibold text-primary-foreground" : "bg-background text-foreground"} ${value === "map" ? "border-r border-border" : ""} disabled:opacity-50`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-0">
            <span className={FORM_LABEL}>Include</span>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showEntries}
                onChange={e => setShowEntries(e.target.checked)}
              />
              Observations with no flag change
            </label>
          </div>
        </div>
      </section>

      {sheetId == null ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <Eye className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Select an operation and a running sheet to see it as a picture log.
          </p>
        </div>
      ) : query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError || !report ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This running sheet could not be loaded.
          </p>
        </div>
      ) : (
        <div ref={reportRef} className="@container flex flex-col gap-3">
          <header>
            <h2 className="m-0 text-lg font-bold text-foreground">
              Visual RS — {report.sheet.title}
            </h2>
            <p className="m-0 text-sm text-muted-foreground">
              {report.sheet.operationName}
              {report.sheet.sheetDate
                ? ` · Sheet ${report.sheet.sheetDate}`
                : ""}
              {report.target.code ? ` · Target ${report.target.code}` : ""} ·{" "}
              {mode === "sat" ? "Satellite pictures" : "Map pictures"}
            </p>
          </header>
          {frames === 0 && (
            <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
              {report.target.kind === "person" ||
              report.target.kind === "vehicle"
                ? "No row places the target yet, so there are no pictures. Observations are listed below as text."
                : "This running sheet has no person or vehicle target, so there is nothing to place. Observations are listed below as text."}
            </p>
          )}
          <div className="flex flex-col gap-2.5">
            {items.map(item =>
              item.kind === "frame" ? (
                <Frame key={item.row.rowId} frame={item} mode={mode} />
              ) : (
                <Entry key={item.row.rowId} entry={item} />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
