import { SHARE_LEVEL_SHORT, type ShareLevel } from "@shared/operationAccess";

const CLASS: Record<ShareLevel, string> = {
  investigator: "border border-purple-500/30 bg-purple-500/15 text-purple-400",
  view: "border border-border bg-muted/40 text-muted-foreground",
  log: "bg-primary/10 text-primary",
  manage: "bg-foreground text-background",
};

export function LevelPill({ level }: { level: ShareLevel }) {
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${CLASS[level]}`}
    >
      {SHARE_LEVEL_SHORT[level]}
    </span>
  );
}
