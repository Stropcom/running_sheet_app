import { IndicesBadge } from "@/components/IndicesBadge";
import {
  ProfileDropdownRow,
  type ProfileKind,
} from "@/components/ProfileDropdown";
import { PersonThumb, displayPersonName } from "@/components/ProfileKit";
import { cn } from "@/lib/utils";

type Tone = "target" | "associate" | "resident";

const THUMB_BORDER: Record<Tone, string> = {
  target: "border-blue-600",
  associate: "border-border",
  resident: "border-rose-500",
};
const TAG: Record<Tone, string> = {
  target:
    "border-blue-600 bg-blue-100 text-blue-950 dark:bg-blue-950/50 dark:text-blue-100",
  associate: "border-border bg-card text-foreground/80",
  resident:
    "border-rose-500/60 bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
};
const TAG_TEXT: Record<Tone, string> = {
  target: "Target",
  associate: "Associate",
  resident: "Resident",
};

/**
 * A person on a profile: their photo (or a silhouette), name, one quiet line
 * and a tag. Closed it's a single row; tapped it opens that person's profile
 * in place (a target's, or an associate's). Shared by the Target, Operation,
 * Vehicle and Location profiles.
 */
export function PersonLinkRow({
  kind,
  refId,
  name,
  tone,
  sub,
  isIndicesOnly = false,
  targetId,
  anchorId,
}: {
  kind: Extract<ProfileKind, "target" | "associate">;
  /** targetId for "target", the person's name for "associate". */
  refId: number | string;
  name: string;
  tone: Tone;
  sub?: string | null;
  isIndicesOnly?: boolean;
  /** Where the photo lives, when kind is "target". */
  targetId?: number;
  /** Element id for photoboard tiles to scroll to. */
  anchorId?: string;
}) {
  return (
    <div id={anchorId} className="scroll-mt-20 rounded-lg">
      <ProfileDropdownRow
        kind={kind}
        refId={refId}
        headerClassName="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <PersonThumb
          photo={
            kind === "target"
              ? { category: "target", targetId: targetId ?? Number(refId) }
              : { category: "associate", label: name }
          }
          name={name}
          className={cn(
            "h-16 w-[52px] shrink-0 rounded-md border-2",
            THUMB_BORDER[tone]
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold text-foreground">
            {displayPersonName(name)}
          </span>
          {sub && (
            <span className="block whitespace-pre-line break-words text-xs text-muted-foreground">
              {sub}
            </span>
          )}
          {/* Phones: the tag sits under the name so the name keeps its width. */}
          <span className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
            {isIndicesOnly && <IndicesBadge />}
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide",
                TAG[tone]
              )}
            >
              {TAG_TEXT[tone]}
            </span>
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-2 sm:inline-flex">
          {isIndicesOnly && <IndicesBadge />}
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide",
              TAG[tone]
            )}
          >
            {TAG_TEXT[tone]}
          </span>
        </span>
      </ProfileDropdownRow>
    </div>
  );
}
