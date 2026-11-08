import { useState } from "react";
import { useLocation } from "wouter";
import { FileText } from "lucide-react";
import { highlightQuery, searchHitPath } from "@shared/searchSnippet";

export interface SearchRowHit {
  rowId: number;
  sheetId: number;
  sheetTitle: string;
  time: string | null;
  date: string | null;
  snippet: string;
  via: "text" | "cin";
}

const FIRST_SHOWN = 5;

/** The running sheet lines a search found inside one operation: each shows the
 * sheet, the time and the officer's own words with the match picked out, and
 * opens that sheet scrolled to that line. */
export function OperationSearchHits({
  hits,
  total,
  query,
}: {
  hits: SearchRowHit[];
  /** Lines that matched in all (the list may be shorter). */
  total: number;
  query: string;
}) {
  const [, navigate] = useLocation();
  const [all, setAll] = useState(false);
  if (hits.length === 0) return null;
  const shown = all ? hits : hits.slice(0, FIRST_SHOWN);
  return (
    <div
      className="mt-2 overflow-hidden rounded-lg border border-border bg-background"
      data-testid="search-hits"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-foreground/80">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        Running sheet lines
        <span className="ml-auto font-semibold tabular-nums text-muted-foreground">
          {total}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {shown.map(h => (
          <li key={h.rowId}>
            <button
              type="button"
              data-testid="search-hit"
              onClick={e => {
                e.stopPropagation();
                navigate(searchHitPath(h.sheetId, h.rowId));
              }}
              className="grid w-full grid-cols-1 gap-0.5 px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
            >
              <span className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-foreground">
                <span className="[overflow-wrap:anywhere]">{h.sheetTitle}</span>
                <span className="font-mono text-muted-foreground">
                  {h.time ?? "no time"}
                </span>
                {h.via === "cin" && (
                  <span className="rounded-full border border-border bg-muted px-1.5 text-[11px] font-semibold">
                    CIN on this line
                  </span>
                )}
              </span>
              <span className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
                {highlightQuery(h.snippet, query).map((p, i) =>
                  p.hit ? (
                    <mark
                      key={i}
                      className="rounded-sm bg-amber-100 px-0.5 text-foreground dark:bg-amber-500/30"
                    >
                      {p.text}
                    </mark>
                  ) : (
                    <span key={i}>{p.text}</span>
                  )
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {(hits.length > FIRST_SHOWN || total > hits.length) && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          {hits.length > FIRST_SHOWN ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                setAll(v => !v);
              }}
              className="font-medium text-primary hover:underline"
            >
              {all ? "Show fewer" : `Show all ${hits.length}`}
            </button>
          ) : (
            <span />
          )}
          {total > hits.length && (
            <span>
              Showing the first {hits.length} of {total} lines
            </span>
          )}
        </div>
      )}
    </div>
  );
}
