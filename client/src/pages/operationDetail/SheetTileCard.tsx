// Part of the operation page (client/src/pages/OperationDetail.tsx): a running sheet's card in the tile view.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { FileText, Calendar, Target, LockKeyhole } from "lucide-react";
import { CopyPlus } from "lucide-react";
import { format } from "date-fns";
import type { CinEntry } from "./types";

/** Tile view card for a running sheet — with cert status, all CINs, colour coding and role icons */
export function SheetTileCard({
  sheet,
  cinNames,
  cinEntries,
  targetName,
  isAdmin,
  onNavigate,
  onCopyMove,
}: {
  sheet: {
    id: number;
    title: string;
    createdAt: Date;
    sheetDate?: string | null;
    sheetCins?: string | null;
    closedAt?: number | null;
    closedByCIN?: string | null;
  };
  cinNames: string[];
  cinEntries?: CinEntry[];
  targetName?: string | null;
  isAdmin: boolean;
  onNavigate: () => void;
  onCopyMove: () => void;
}) {
  const { data: certStatus } = trpc.sheet.cinCertStatus.useQuery(
    { sheetId: sheet.id, cins: cinNames },
    { enabled: cinNames.length > 0, staleTime: 30_000 }
  );

  const allCertified =
    cinNames.length > 0 &&
    certStatus !== undefined &&
    certStatus.every(s => s.certified);

  const isClosed = !!sheet.closedAt;

  return (
    <div
      onClick={onNavigate}
      className={`group flex flex-col gap-3 p-5 rounded-xl border cursor-pointer hover:-translate-y-0.5 transition-all duration-150 ${
        isClosed
          ? "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 opacity-70"
          : allCertified
            ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-500/80 hover:shadow-md"
            : "border-border bg-card hover:bg-accent/20 hover:border-primary/30 hover:shadow-md"
      }`}
    >
      {/* Header row: icon + CLOSED badge + copy-move button */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={`p-2.5 rounded-lg border shrink-0 ${
            isClosed
              ? "bg-slate-200/60 dark:bg-slate-700/40 border-slate-300 dark:border-slate-600"
              : allCertified
                ? "bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40"
                : "bg-blue-700/10 border-blue-700/20"
          }`}
        >
          {isClosed ? (
            <LockKeyhole className="w-5 h-5 text-slate-700 dark:text-slate-300" />
          ) : (
            <FileText
              className={`w-5 h-5 ${allCertified ? "text-emerald-700 dark:text-emerald-300" : "text-blue-700"}`}
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isClosed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-500/40 bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-400 font-medium">
              <LockKeyhole className="w-2.5 h-2.5" />
              CLOSED
            </span>
          )}
          {allCertified && !isClosed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium">
              ✓ CERTIFIED
            </span>
          )}
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              className="w-7 h-7 text-sky-700 dark:text-sky-300 hover:text-sky-400 hover:bg-sky-500/10"
              onClick={e => {
                e.stopPropagation();
                onCopyMove();
              }}
              title="Copy or Move sheet"
            >
              <CopyPlus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Sheet title */}
      <p
        className={`font-semibold leading-tight line-clamp-2 ${
          isClosed
            ? "text-slate-700 dark:text-slate-400"
            : allCertified
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-foreground"
        }`}
      >
        {sheet.title}
      </p>

      {/* Target */}
      {targetName && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Target className="w-3 h-3 shrink-0" />
          <span className="truncate">{targetName}</span>
        </div>
      )}

      {/* CIN chips — all shown, colour coded, with role icons */}
      {cinNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cinNames.map(cin => {
            const certified =
              certStatus?.find(s => s.cin === cin)?.certified ?? false;
            const entry = cinEntries?.find(e => e.cin === cin);
            return (
              <span
                key={cin}
                className={`inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border font-mono ${
                  certified
                    ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300"
                }`}
              >
                {entry?.isTeamLeader && (
                  <span
                    className="text-yellow-700 dark:text-yellow-300"
                    title="Team Leader"
                  >
                    ★
                  </span>
                )}
                {entry?.isAuthor && (
                  <span
                    className="text-sky-700 dark:text-sky-300"
                    title="Author"
                  >
                    ✏
                  </span>
                )}
                {entry?.hasImages && (
                  <span
                    className="text-violet-700 dark:text-violet-300"
                    title="Has images"
                  >
                    📷
                  </span>
                )}
                {cin}
              </span>
            );
          })}
        </div>
      )}

      {/* Footer: date */}
      <div className="flex items-center gap-1 mt-auto text-xs text-muted-foreground">
        <Calendar className="w-3 h-3" />
        <span>
          {sheet.sheetDate
            ? format(new Date(`${sheet.sheetDate}T00:00:00`), "d MMM yyyy")
            : format(new Date(sheet.createdAt), "d MMM yyyy")}
        </span>
        {sheet.closedAt && sheet.closedByCIN && (
          <span className="ml-2 text-slate-700 dark:text-slate-300">
            · Closed by <span className="font-mono">{sheet.closedByCIN}</span>
          </span>
        )}
      </div>
    </div>
  );
}
