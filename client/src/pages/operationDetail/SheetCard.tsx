// Part of the operation page (client/src/pages/OperationDetail.tsx): a running sheet's card in the folder (list) view.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight, Target, LockKeyhole } from "lucide-react";
import { CopyPlus } from "lucide-react";
import { format } from "date-fns";
import type { CinEntry } from "./types";

/** Individual sheet card — fetches cert status and highlights green when all CINs certified */
export function SheetCard({
  sheet,
  cinNames,
  cinEntries,
  isAdmin,
  targetName,
  onNavigate,
  onDelete,
  onCopyMove,
}: {
  sheet: {
    id: number;
    title: string;
    createdAt: Date;
    sheetCins?: string | null;
    closedAt?: number | null;
    closedByCIN?: string | null;
  };
  cinNames: string[];
  cinEntries?: CinEntry[];
  isAdmin: boolean;
  targetName?: string | null;
  onNavigate: () => void;
  onDelete: () => void;
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
      className={`group relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-150 cursor-pointer ${
        isClosed
          ? "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 opacity-70"
          : allCertified
            ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-500/80"
            : "border-border bg-card hover:bg-accent/20 hover:border-primary/30"
      }`}
      onClick={onNavigate}
    >
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
            className={`w-5 h-5 ${
              allCertified
                ? "text-black dark:text-emerald-400"
                : "text-blue-700"
            }`}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-semibold break-words sm:truncate ${
              isClosed
                ? "text-slate-700 dark:text-slate-400"
                : allCertified
                  ? "text-black dark:text-emerald-300"
                  : "text-foreground"
            }`}
          >
            {sheet.title}
          </span>
          {isClosed && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-500/40 bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-400 font-medium shrink-0">
              <LockKeyhole className="w-2.5 h-2.5" />
              CLOSED
            </span>
          )}
        </div>
        {cinNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {cinNames.map(cin => {
              const certified =
                certStatus?.find(s => s.cin === cin)?.certified ?? false;
              const entry = cinEntries?.find(e => e.cin === cin);
              return (
                <span
                  key={cin}
                  className={`inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full border font-mono ${
                    certified
                      ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 text-black dark:text-emerald-400"
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
                  {cin}
                </span>
              );
            })}
          </div>
        )}
        {targetName && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
            <Target className="w-3 h-3 shrink-0" />
            <span className="truncate">{targetName}</span>
          </div>
        )}
        {isClosed && sheet.closedByCIN && sheet.closedAt && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-700 dark:text-slate-500">
            <LockKeyhole className="w-3 h-3 shrink-0" />
            <span>
              Closed by{" "}
              <span className="font-mono font-semibold">
                {sheet.closedByCIN}
              </span>{" "}
              on {format(new Date(sheet.closedAt), "d MMM yyyy, HH:mm")}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <>
            {/* Copy/Move always available — even when closed */}
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8 text-sky-700 dark:text-sky-300 hover:text-sky-400 hover:bg-sky-500/10"
              title="Copy or Move sheet"
              onClick={e => {
                e.stopPropagation();
                onCopyMove();
              }}
            >
              <CopyPlus className="w-4 h-4" />
            </Button>
            {/* Delete button removed from RS panel — delete is only in the RS Edit dialog */}
          </>
        )}
        <ChevronRight
          className={`w-4 h-4 transition-colors ${
            isClosed
              ? "text-slate-700 dark:text-slate-300"
              : allCertified
                ? "text-black dark:text-emerald-400"
                : "text-muted-foreground group-hover:text-foreground"
          }`}
        />
      </div>
    </div>
  );
}
