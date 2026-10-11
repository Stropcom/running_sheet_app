import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FORM_HINT, FORM_LABEL, FORM_TONES } from "@/lib/formKit";
import { cn } from "@/lib/utils";
import {
  TARGET_BACKGROUND_MAX,
  normaliseTargetBackground,
} from "@shared/targetBackground";

/**
 * The target's freeform Background — the panel under Associates on the
 * Target Registry card. One per target: it shows on the Target profile and on
 * the Operation profile of every operation the target is linked to. Plain
 * text, line breaks kept. Observers see it read-only.
 */
export function RegistryBackgroundPanel({
  targetId,
  background,
  updatedAt,
  updatedByCIN,
  operationNames,
}: {
  targetId: number;
  background: string | null;
  updatedAt: number | null;
  updatedByCIN: string | null;
  operationNames: string[];
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const canEdit = user?.role === "member" || user?.role === "admin";
  const [draft, setDraft] = useState(background ?? "");
  useEffect(() => setDraft(background ?? ""), [background]);

  const save = trpc.target.registry.setBackground.useMutation({
    onSuccess: () => {
      toast.success("Background saved");
      utils.target.registry.list.invalidate();
      utils.intelligence.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const dirty = (normaliseTargetBackground(draft) ?? "") !== (background ?? "");
  const inputId = `registry-background-${targetId}`;

  return (
    <div className={cn(FORM_TONES.neutral.panel, "p-3 flex flex-col gap-2")}>
      <div className={FORM_TONES.neutral.band}>
        <FileText className="w-3 h-3" /> Background
      </div>
      <label htmlFor={inputId} className={FORM_LABEL}>
        Background (freeform)
      </label>
      {canEdit ? (
        <Textarea
          id={inputId}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={TARGET_BACKGROUND_MAX}
          rows={10}
          spellCheck
          className="min-h-48 text-sm leading-relaxed"
          aria-describedby={`${inputId}-help`}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed text-foreground">
          {background?.trim() ? (
            background
          ) : (
            <span className="italic text-muted-foreground">
              Nothing written yet.
            </span>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p id={`${inputId}-help`} className={FORM_HINT}>
          Plain text. Line breaks are kept. Shown on this target's profile and
          on every operation profile the target is linked to.
        </p>
        <p className={cn(FORM_HINT, "tabular-nums")}>
          {draft.length.toLocaleString()} characters
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/80">
        <span className="font-semibold uppercase tracking-wide">
          Appears on
        </span>
        <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-semibold text-sky-800 dark:text-sky-300">
          Target profile
        </span>
        {operationNames.map(n => (
          <span
            key={n}
            className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-semibold text-sky-800 dark:text-sky-300"
          >
            Operation {n}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={FORM_HINT}>
          {updatedAt
            ? `Last edited by CIN ${updatedByCIN ?? "unknown"} · ${new Date(
                updatedAt
              ).toLocaleString("en-AU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Not written yet"}
        </p>
        <p className={FORM_HINT}>Every change is written to the Audit Log</p>
      </div>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate({ id: targetId, background: draft })}
          >
            {save.isPending ? "Saving…" : "Save background"}
          </Button>
          {dirty && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft(background ?? "")}
            >
              Discard changes
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
