/**
 * Command features: on/off switches for each Command, at the bottom of Access
 * Management. Only the owner sees this (see shared/commandFeatures.ts); the
 * server refuses anyone else's changes too.
 */
import { useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsFeatureOwner } from "@/lib/commandFeatures";
import { SECTION_CARD } from "@/lib/pageKit";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import {
  COMMAND_CODES,
  COMMAND_SHORT,
  type CommandCode,
} from "@shared/commands";
import {
  FEATURES,
  type FeatureKey,
  type FeatureMatrix,
} from "@shared/commandFeatures";

// Region colours (see lib/commandStyle.ts): gold, maroon, sky blue, dark blue, red.
const COMMAND_BAR: Record<CommandCode, string> = {
  WESTERN: "#c9a227",
  NORTHERN: "#7a1f2b",
  EASTERN: "#38a3d8",
  SOUTHERN: "#1e3a8a",
  CENTRAL: "#dc2626",
};

const clone = (m: FeatureMatrix): FeatureMatrix =>
  JSON.parse(JSON.stringify(m)) as FeatureMatrix;

function onCount(m: FeatureMatrix, c: CommandCode) {
  return FEATURES.filter(f => m[c][f.key]).length;
}

export function CommandFeaturesCard() {
  const isOwner = useIsFeatureOwner();
  const utils = trpc.useUtils();
  const { data: saved } = trpc.commandFeatures.all.useQuery(undefined, {
    enabled: isOwner,
  });
  const [draft, setDraft] = useState<FeatureMatrix | null>(null);
  useEffect(() => {
    if (saved) setDraft(clone(saved));
  }, [saved]);

  const save = trpc.commandFeatures.set.useMutation({
    onSuccess: () => {
      utils.commandFeatures.all.invalidate();
      // Their own switches arrive with auth.me.
      utils.auth.me.invalidate();
      toast.success("Saved. It takes effect for each Command straight away.");
    },
    onError: e => toast.error(e.message),
  });

  if (!isOwner) return null;
  if (!saved || !draft) {
    return (
      <div className={SECTION_CARD}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  const changes = COMMAND_CODES.flatMap(command =>
    FEATURES.filter(f => draft[command][f.key] !== saved[command][f.key]).map(
      f => ({
        command,
        feature: f.key,
        enabled: draft[command][f.key],
        name: f.name,
      })
    )
  );
  const toggle = (command: CommandCode, feature: FeatureKey, on: boolean) =>
    setDraft(d => {
      if (!d) return d;
      const next = clone(d);
      next[command][feature] = on;
      return next;
    });
  const label = (c: (typeof changes)[number]) =>
    `${c.name} ${c.enabled ? "on" : "off"} for ${COMMAND_SHORT[c.command]}`;

  return (
    <CollapsibleSection
      id="command-features"
      title="Command features"
      status={
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/50 bg-amber-100 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <Lock className="h-3 w-3" aria-hidden />
          <span className="sm:hidden">Only you</span>
          <span className="hidden sm:inline">Only you can see this</span>
        </span>
      }
    >
      <p className="mb-3 max-w-[70ch] text-sm text-muted-foreground">
        Choose which features each Command can use. Everything starts on.
        Switching a feature off hides it from that Command's menu and stops it
        working for them. Nothing is deleted, so switching it back on brings the
        data back.
      </p>

      {/* Laptop and iPad: one column per Command */}
      <div className="hidden overflow-hidden rounded-xl border border-border md:grid md:grid-cols-[minmax(220px,1.6fr)_repeat(5,minmax(84px,1fr))]">
        <div className="flex items-end border-t-4 border-t-border bg-muted/70 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide">
          Feature
        </div>
        {COMMAND_CODES.map(c => (
          <div
            key={c}
            className="flex flex-col items-center justify-center gap-0.5 border-t-4 bg-muted/70 px-2 py-2.5 text-center text-xs font-extrabold uppercase tracking-wide"
            style={{ borderTopColor: COMMAND_BAR[c] }}
          >
            {COMMAND_SHORT[c]}
            <small className="text-xs font-bold normal-case tracking-normal text-muted-foreground tabular-nums">
              {onCount(draft, c)} of {FEATURES.length} on
            </small>
          </div>
        ))}
        {FEATURES.map(f => (
          <FeatureRow
            key={f.key}
            feature={f}
            draft={draft}
            saved={saved}
            toggle={toggle}
          />
        ))}
      </div>

      {/* Phone: one card per Command */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {COMMAND_CODES.map(c => (
          <div
            key={c}
            className="overflow-hidden rounded-xl border border-border bg-card"
          >
            <div
              className="flex items-center justify-between gap-2 border-t-4 bg-muted/70 px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide"
              style={{ borderTopColor: COMMAND_BAR[c] }}
            >
              <span>{COMMAND_SHORT[c]}</span>
              <span className="text-xs font-bold normal-case tracking-normal text-muted-foreground tabular-nums">
                {onCount(draft, c)} of {FEATURES.length} on
              </span>
            </div>
            {FEATURES.map(f => (
              <div
                key={f.key}
                className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.warn ?? f.note}
                  </div>
                </div>
                <FeatureSwitch
                  checked={draft[c][f.key]}
                  changed={draft[c][f.key] !== saved[c][f.key]}
                  label={`${f.name} for ${COMMAND_SHORT[c]} Command`}
                  onChange={on => toggle(c, f.key, on)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <p
          className="max-w-[62ch] text-xs text-muted-foreground"
          aria-live="polite"
        >
          {changes.length === 0
            ? "No changes yet."
            : `${changes.length} unsaved change${changes.length > 1 ? "s" : ""}: ${changes
                .slice(0, 3)
                .map(label)
                .join(", ")}${changes.length > 3 ? "…" : ""}.`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-w-28"
            disabled={changes.length === 0 || save.isPending}
            onClick={() => setDraft(clone(saved))}
          >
            Undo changes
          </Button>
          <Button
            className="min-w-28"
            disabled={changes.length === 0 || save.isPending}
            onClick={() =>
              save.mutate(
                changes.map(({ command, feature, enabled }) => ({
                  command,
                  feature,
                  enabled,
                }))
              )
            }
          >
            {save.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save changes
          </Button>
        </div>
      </div>

      <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <Note title="Import Target">
          Switching it off hides the import button for that Command. Add Target
          by hand still works.
        </Note>
        <Note title="CTO Roster and Weekly Tasking">
          Each Command has its own roster and tasking board. Switching them off
          hides them for that Command and keeps what is in them.
        </Note>
        <Note title="You">
          As an all-region admin you keep every feature, whatever is switched
          off here.
        </Note>
      </div>
    </CollapsibleSection>
  );
}

function FeatureSwitch({
  checked,
  changed,
  label,
  onChange,
}: {
  checked: boolean;
  changed: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className={changed ? "ring-2 ring-primary/50 ring-offset-1" : ""}
    />
  );
}

function FeatureRow({
  feature,
  draft,
  saved,
  toggle,
}: {
  feature: (typeof FEATURES)[number];
  draft: FeatureMatrix;
  saved: FeatureMatrix;
  toggle: (c: CommandCode, f: FeatureKey, on: boolean) => void;
}) {
  return (
    <>
      <div className="flex flex-col justify-center gap-0.5 border-t border-border px-3 py-3">
        <b className="text-sm">{feature.name}</b>
        <span className="max-w-[46ch] text-xs text-muted-foreground">
          {feature.note}
        </span>
        {feature.warn && (
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            {feature.warn}
          </span>
        )}
      </div>
      {COMMAND_CODES.map(c => (
        <div
          key={c}
          className="flex items-center justify-center border-t border-border px-2 py-3"
        >
          <FeatureSwitch
            checked={draft[c][feature.key]}
            changed={draft[c][feature.key] !== saved[c][feature.key]}
            label={`${feature.name} for ${COMMAND_SHORT[c]} Command`}
            onChange={on => toggle(c, feature.key, on)}
          />
        </div>
      ))}
    </>
  );
}

function Note({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
      <b className="mb-0.5 block text-[13px] text-foreground">{title}</b>
      {children}
    </div>
  );
}
