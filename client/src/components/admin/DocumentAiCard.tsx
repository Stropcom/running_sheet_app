/**
 * Document AI: the owner's on/off switch for Import Target's on-device AI check,
 * with a short tally of what it has done since the server started — so the owner
 * can try it on and off and see whether it ever adds anything. Owner only (the
 * server refuses anyone else too); renders nothing for everyone else.
 */
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsFeatureOwner } from "@/lib/commandFeatures";
import { FIELD_LABEL, FIELD_VALUE, SECTION_CARD } from "@/lib/pageKit";

const seconds = (ms: number, n: number) =>
  n > 0 ? `${(ms / n / 1000).toFixed(1)} s` : "–";

export function DocumentAiCard() {
  const isOwner = useIsFeatureOwner();
  const utils = trpc.useUtils();
  const { data } = trpc.documentAi.status.useQuery(undefined, {
    enabled: isOwner,
    retry: false,
    refetchInterval: 15_000,
  });
  const set = trpc.documentAi.set.useMutation({
    onSuccess: r => {
      utils.documentAi.status.invalidate();
      toast.success(
        r.enabled
          ? "Document AI is on. Imports use it again."
          : "Document AI is off. Imports use only the rules."
      );
    },
    onError: e => toast.error(e.message),
  });
  const reset = trpc.documentAi.resetStats.useMutation({
    onSuccess: () => utils.documentAi.status.invalidate(),
    onError: e => toast.error(e.message),
  });

  if (!isOwner) return null;
  if (!data) {
    return (
      <div className={SECTION_CARD}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  const { stats: s, enabled, modelStatus } = data;
  const installed = modelStatus === "ready";

  return (
    <CollapsibleSection
      id="document-ai"
      title="Document AI — Import Target"
      status={
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            enabled
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {enabled ? "On" : "Off"}
        </span>
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            On-device AI check when reading a document
          </p>
          <p className="text-sm text-muted-foreground">
            Off: imports use only the rules. On: items the rules weren&apos;t
            sure of are also checked by the AI, for at most {data.budgetSeconds}{" "}
            seconds per document.
          </p>
          <p
            className={
              installed
                ? "text-sm text-emerald-700 mt-1"
                : "text-sm text-amber-700 mt-1"
            }
          >
            {installed
              ? "The AI model is installed on this server."
              : modelStatus === "incomplete"
                ? "The AI model files look incomplete, so the AI check is skipped whatever this switch says."
                : "The AI model isn't installed on this server, so the switch has no effect."}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={set.isPending}
          onCheckedChange={v => set.mutate({ enabled: v })}
          aria-label="Document AI on or off"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Imports" value={s.imports} />
        <Stat label="AI checks made" value={s.calls} />
        <Stat label="Agreed with rules" value={s.confirmed} />
        <Stat label="Offered a reading" value={s.suggested} />
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Since the server last started (
        {new Date(s.since).toLocaleString("en-AU")}
        ): {s.withAi} import{s.withAi === 1 ? "" : "s"} with AI, {s.withoutAi}{" "}
        without. {s.checked} had something for the AI to check; {s.stoppedEarly}{" "}
        hit the time limit. Average import: with AI{" "}
        {seconds(s.totalMsWithAi, s.withAi)}, without AI{" "}
        {seconds(s.totalMsWithoutAi, s.withoutAi)}.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        &ldquo;Offered a reading&rdquo; counts AI answers the app&apos;s own
        parser accepted. If it stays at 0 across your real documents, the AI is
        adding nothing.
      </p>

      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
        >
          Start counts again
        </Button>
      </div>
    </CollapsibleSection>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className={FIELD_LABEL}>{label}</p>
      <p className={`${FIELD_VALUE} tabular-nums text-lg font-semibold`}>
        {value}
      </p>
    </div>
  );
}
