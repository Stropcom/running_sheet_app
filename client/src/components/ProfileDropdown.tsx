import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  IntelPhotoStrip,
  intelEntityChipLook,
  type IntelAssocEntity,
} from "@/components/IntelEntityChip";
import { AssociateProfileContent } from "@/components/AssociateProfileContent";
import { VehicleProfileContent } from "@/components/VehicleProfileContent";
import { LocationProfileContent } from "@/components/LocationProfileContent";
import { TargetProfileContent } from "@/components/TargetProfileContent";
import { OperationProfileContent } from "@/components/OperationProfileContent";

/**
 * A link to another Intelligence profile that opens in place instead of
 * taking you to that profile's page. Closed it's a single row; tapped it
 * shows the same details as the profile page (mounted lazily, so nothing is
 * fetched until it's opened). Any number of rows can stay open at once.
 *
 * Drop-downs stop one level deep: inside an opened profile, the same links
 * are plain links to the profile page, so profiles can't nest forever.
 */
export type ProfileKind =
  | "target"
  | "associate"
  | "vehicle"
  | "location"
  | "operation";

const InsideProfileDropdown = createContext(false);

export function profilePath(kind: ProfileKind, ref: number | string): string {
  switch (kind) {
    case "target":
      return `/intelligence/target/${ref}`;
    case "operation":
      return `/intelligence/operation/${ref}`;
    default:
      return `/intelligence/${kind}/${encodeURIComponent(String(ref))}`;
  }
}

const DEFAULT_HEADER =
  "w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent/10 transition-colors text-left";

export function ProfileDropdownRow({
  kind,
  refId,
  children,
  headerClassName,
  belowHeader,
  title,
}: {
  kind: ProfileKind;
  /** targetId / operationId for those kinds, the entity label otherwise. */
  refId: number | string;
  /** The row's own content (icon, name, tags). */
  children: ReactNode;
  /** Replaces the default row styling (e.g. the rounded chip look). */
  headerClassName?: string;
  /** Shown between the row and its opened profile (e.g. photos). */
  belowHeader?: ReactNode;
  /** Hover text for the row. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const inside = useContext(InsideProfileDropdown);
  const [, navigate] = useLocation();
  const headerClass = headerClassName ?? DEFAULT_HEADER;

  // Already inside an opened profile: a plain link, one level deep only.
  if (inside) {
    return (
      <div className="w-full">
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            navigate(profilePath(kind, refId));
          }}
          title={title}
          className={headerClass}
        >
          {children}
          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground ml-auto" />
        </button>
        {belowHeader}
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        title={title}
        onClick={e => {
          // Some of these rows sit inside cards that are tappable themselves.
          e.stopPropagation();
          setOpen(o => !o);
        }}
        className={`${headerClass} ${open ? "ring-1 ring-primary/50" : ""}`}
      >
        {children}
        <ChevronDown
          className={`w-4 h-4 shrink-0 ml-auto text-muted-foreground transition-transform ${
            open ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>
      {belowHeader}
      {open && (
        <div
          className="mt-2 rounded-lg border border-primary/40 bg-card px-3 pb-3"
          onClick={e => e.stopPropagation()}
        >
          <InsideProfileDropdown.Provider value={true}>
            {kind === "target" && (
              <TargetProfileContent targetId={Number(refId)} embedded />
            )}
            {kind === "operation" && (
              <OperationProfileContent operationId={Number(refId)} embedded />
            )}
            {kind === "associate" && (
              <AssociateProfileContent label={String(refId)} embedded />
            )}
            {kind === "vehicle" && (
              <VehicleProfileContent label={String(refId)} embedded />
            )}
            {kind === "location" && (
              <LocationProfileContent label={String(refId)} embedded />
            )}
          </InsideProfileDropdown.Provider>
        </div>
      )}
    </div>
  );
}

/**
 * An associated person / vehicle / location chip that opens that profile in
 * place — the drop-down version of IntelEntityWithPhotos (chip, with its own
 * photos directly beneath it).
 */
export function IntelEntityDropdown({ item }: { item: IntelAssocEntity }) {
  // A target shows as its target profile (same rule the plain links used).
  const isTargetEntity = item.type === "target" && item.id.includes("target");
  const kind: ProfileKind = isTargetEntity
    ? "target"
    : item.type === "vehicle"
      ? "vehicle"
      : item.type === "address" || item.type === "business"
        ? "location"
        : "associate";
  const refId: number | string = isTargetEntity
    ? Number(item.id.split("::")[1])
    : item.label;
  const { cls, icon, label } = intelEntityChipLook(item);
  return (
    <ProfileDropdownRow
      kind={kind}
      refId={refId}
      headerClassName={`flex w-full items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${cls}`}
      belowHeader={
        (item.photos ?? []).length > 0 ? (
          <div className="pl-1">
            <IntelPhotoStrip photos={item.photos!} size="w-14 h-14" />
          </div>
        ) : null
      }
    >
      {icon}
      <span className="min-w-0 break-words text-left">{label}</span>
      <span className="opacity-60">×{item.rowCount}</span>
      {item.isPrevious && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-black/10 dark:bg-white/15">
          Previous
        </span>
      )}
    </ProfileDropdownRow>
  );
}
