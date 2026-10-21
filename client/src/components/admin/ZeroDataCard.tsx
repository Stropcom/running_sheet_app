/**
 * Zero data: empties the operational data (operations, running sheets, photos,
 * targets, intelligence, map, briefings, audit log …) and leaves people, teams,
 * settings and the CTO Roster. At the bottom of Access Management; only the
 * owner sees it (see shared/commandFeatures.ts) and the server refuses anyone
 * else. Rules and lists: server/zeroData.ts, shared/zeroDataAreas.ts.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsFeatureOwner } from "@/lib/commandFeatures";
import { clearAllOfflineData } from "@/lib/offlineStore";
import { rememberDataEpoch } from "@/lib/dataEpoch";
import { FORM_LABEL } from "@/lib/formKit";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import {
  ZERO_CONFIRM_WORD,
  ZERO_KEPT,
  formatBytes,
} from "@shared/zeroDataAreas";

export function ZeroDataCard() {
  const isOwner = useIsFeatureOwner();
  const { data, isLoading, refetch } = trpc.zeroData.preview.useQuery(
    undefined,
    { enabled: isOwner }
  );
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const run = trpc.zeroData.run.useMutation({
    onSuccess: async res => {
      // This device is the one that did it: drop its own drafts now and mark
      // it up to date so it doesn't reload a second time.
      try {
        await clearAllOfflineData();
      } catch {
        // no offline store here
      }
      rememberDataEpoch(res.at);
      setOpen(false);
      setWord("");
      setPassword("");
      setDone(
        `Done. ${res.cleared} tables cleared.${res.filesNote ? ` ${res.filesNote}` : ""} Reload RunLog to see the empty app.`
      );
      void refetch();
    },
    onError: e => toast.error(e.message),
  });

  if (!isOwner) return null;

  const ready =
    word.trim() === ZERO_CONFIRM_WORD && password.length > 0 && !run.isPending;

  return (
    <CollapsibleSection
      id="zero-data"
      title="Zero data"
      status={
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/50 bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <Lock className="h-3 w-3" aria-hidden />
          <span className="sm:hidden">Only you</span>
          <span className="hidden sm:inline">Only you can see this</span>
        </span>
      }
    >
      <p className="mb-3 max-w-[70ch] text-sm text-muted-foreground">
        Empties the working data so every Command starts at zero. People, teams
        and settings stay, and so does the whole CTO Roster.{" "}
        <strong className="text-foreground">
          This cannot be undone — there is no backup.
        </strong>{" "}
        Photos and uploaded documents stored on this server are deleted too.
      </p>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Counting…
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-t-4 border-t-red-600 bg-muted/70 px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
              Will be cleared
            </div>
            {data.areas.map(a => (
              <div
                key={a.label}
                className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm"
              >
                <span>{a.label}</span>
                <span className="font-bold tabular-nums">{a.rows}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-sm">
              <span>
                {data.remoteStorage
                  ? "Photos and documents (remote storage)"
                  : "Photo and document files"}
              </span>
              <span className="font-bold tabular-nums">
                {data.remoteStorage
                  ? "kept"
                  : `${data.files.files} · ${formatBytes(data.files.bytes)}`}
              </span>
            </div>
            {data.remoteStorage && (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                These are in remote storage, which can't be deleted from here.
                Nothing refers to them after a zero.
              </p>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-t-4 border-t-emerald-600 bg-muted/70 px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
              Stays as it is
            </div>
            {ZERO_KEPT.map(k => (
              <div
                key={k}
                className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm"
              >
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
                {k}
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.unclassified.length > 0 && (
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Can't run yet: the database has tables this feature doesn't know about
          ({data.unclassified.join(", ")}).
        </p>
      )}

      {done && (
        <p
          className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-emerald-700"
          aria-live="polite"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            {done}
          </span>
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload RunLog
          </Button>
        </p>
      )}

      <div className="mt-3.5 flex justify-end">
        <Button
          variant="destructive"
          className="min-w-40"
          disabled={!data || data.unclassified.length > 0}
          onClick={() => {
            setDone(null);
            setOpen(true);
          }}
        >
          Zero all data…
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={v => {
          if (!run.isPending) setOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              Zero all data?
            </DialogTitle>
            <DialogDescription>
              {data ? `${data.total} records` : "All operational records"}
              {data && !data.remoteStorage
                ? ` and ${data.files.files} photo and document files`
                : ""}{" "}
              will be erased for every Command. This cannot be undone. Make sure
              nobody else is using RunLog.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={FORM_LABEL}>
                Type {ZERO_CONFIRM_WORD} to confirm
              </span>
              <Input
                value={word}
                onChange={e => setWord(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={FORM_LABEL}>Your password</span>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          </div>
          <DialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
            <Button
              variant="outline"
              disabled={run.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!ready}
              onClick={() => run.mutate({ confirm: word, password })}
            >
              {run.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Zero all data"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleSection>
  );
}
