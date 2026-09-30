import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Users,
  Car,
  User,
  MapPin,
  HelpCircle,
  Search,
  X,
  IdCard,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TapSelectFace } from "@/components/TapSelectFace";
import {
  PossibleMatchDialog,
  type PendingMatch,
} from "@/components/PossibleMatchDialog";

type Category =
  | "target"
  | "vehicle"
  | "associate"
  | "location"
  | "unidentified_person";

const CATEGORY_TABS: { key: Category; label: string; icon: typeof Users }[] = [
  { key: "target", label: "Targets", icon: Users },
  { key: "vehicle", label: "Vehicles", icon: Car },
  { key: "associate", label: "Associates", icon: User },
  { key: "location", label: "Locations", icon: MapPin },
  {
    key: "unidentified_person",
    label: "Unidentified Person",
    icon: HelpCircle,
  },
];

// A face is only meaningful for the two "this is a real/possible person"
// categories — Vehicles/Locations link the whole photo, not a face within
// it, same as before this redesign.
const FACE_CATEGORIES = new Set<Category>(["target", "associate"]);

// Keyed loosely (not Record<Category,...>) since a link's actual category
// can also be "member" — the row-CIN link created by the section at the
// bottom of this dialog / auto-linked at upload — which isn't one of the
// five manual CATEGORY_TABS above.
const CATEGORY_ICON: Record<string, typeof Users> = {
  target: Users,
  vehicle: Car,
  associate: User,
  location: MapPin,
  unidentified_person: HelpCircle,
  member: IdCard,
};

// Same per-category colour convention as UploadImageDialog.tsx's redesign —
// full literal class strings, not string-interpolated colour names, since
// Tailwind's JIT only picks up classes it can see written out in source.
const CATEGORY_STYLES: Record<
  Category,
  { icon: string; activeBorder: string; activeBg: string; activeText: string }
> = {
  target: {
    icon: "text-sky-500",
    activeBorder: "border-sky-500",
    activeBg: "bg-sky-500/10",
    activeText: "text-sky-600 dark:text-sky-400",
  },
  vehicle: {
    icon: "text-amber-500",
    activeBorder: "border-amber-500",
    activeBg: "bg-amber-500/10",
    activeText: "text-amber-600 dark:text-amber-400",
  },
  associate: {
    icon: "text-violet-500",
    activeBorder: "border-violet-500",
    activeBg: "bg-violet-500/10",
    activeText: "text-violet-600 dark:text-violet-400",
  },
  location: {
    icon: "text-emerald-500",
    activeBorder: "border-emerald-500",
    activeBg: "bg-emerald-500/10",
    activeText: "text-emerald-600 dark:text-emerald-400",
  },
  unidentified_person: {
    icon: "text-rose-500",
    activeBorder: "border-rose-500",
    activeBg: "bg-rose-500/10",
    activeText: "text-rose-600 dark:text-rose-400",
  },
};

function categoryForEntity(e: { type: string; isTarget?: boolean }): Category {
  if (e.isTarget) return "target";
  if (e.type === "vehicle") return "vehicle";
  if (e.type === "address" || e.type === "business") return "location";
  return "associate";
}

// Every IntelligenceEntity (including targets, via operation_target_links —
// see getAllIntelligenceEntities) already carries one occurrence per
// operation it's linked to, so which operation(s) an entity belongs to is
// derivable from data already being fetched here — no separate query needed.
function operationNamesFor(
  e: { occurrences?: Array<{ operationName: string }> } | undefined
): string[] {
  if (!e?.occurrences) return [];
  return Array.from(
    new Set(e.occurrences.map(o => o.operationName).filter(Boolean))
  );
}

function findEntityForLink(
  link: { category: string; targetId?: number | null; entityLabel: string },
  entities: any[] | undefined
) {
  if (!entities) return undefined;
  if (link.category === "target") {
    return entities.find(e => e.isTarget && e.targetId === link.targetId);
  }
  if (link.category === "unidentified_person") return undefined;
  return entities.find(
    e =>
      categoryForEntity(e) === link.category && e.shortForm === link.entityLabel
  );
}

// Shown under each "currently linked" pill so an officer can see at a glance
// which other photos are already tied to that same entity. Only rendered for
// Unidentified Person links (see call site) — those otherwise have no
// profile page to check; known entities (targets/associates/etc.) already
// have one, so the thumbnail strip there would just be noise.
function OtherLinkedPhotos({
  category,
  targetId,
  entityLabel,
  excludeAttachmentId,
}: {
  category: Category;
  targetId?: number | null;
  entityLabel: string;
  excludeAttachmentId: number;
}) {
  const { data, isLoading } = trpc.attachment.byEntity.useQuery({
    category,
    targetId: targetId ?? undefined,
    entityLabel,
  });

  const others = (data ?? []).filter((p: any) => p.id !== excludeAttachmentId);

  if (isLoading || others.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 pl-1 pt-0.5 pb-1 overflow-x-auto">
      <span className="text-[10px] text-muted-foreground shrink-0">
        Also in {others.length} other photo{others.length === 1 ? "" : "s"}:
      </span>
      {others.map((p: any) => (
        <img
          key={p.id}
          src={p.url}
          alt="Other photo linked to this entity"
          title="Click to open"
          onClick={() => window.open(p.url, "_blank", "noopener,noreferrer")}
          className="h-8 w-8 rounded object-cover border border-border cursor-pointer shrink-0 hover:opacity-80 transition-opacity"
        />
      ))}
    </div>
  );
}

function EntityCandidateRow({
  e,
  disabled,
  onPick,
}: {
  e: any;
  disabled: boolean;
  onPick: () => void;
}) {
  const ops = operationNamesFor(e);
  return (
    <button
      disabled={disabled}
      onClick={onPick}
      className="text-left px-3 py-2 rounded-lg text-sm bg-background hover:bg-accent/50 transition-colors shrink-0"
    >
      <span className="block truncate">{e.shortForm}</span>
      {ops.length > 0 && (
        <span
          className="block text-[10px] text-muted-foreground truncate"
          title={ops.join(", ")}
        >
          {ops.length === 1 ? "Op: " : "Ops: "}
          {ops.join(", ")}
        </span>
      )}
    </button>
  );
}

// Tap the face first, then pick who it is: the photo (with any detected
// faces shown as tappable boxes via TapSelectFace) sits at the top of the
// dialog and stays visible the whole time — picking a category or an
// entity below never swaps it out for a different screen. Selecting a face
// is optional; a candidate can still be linked with no face chosen (e.g. a
// photo where auto-detection missed the person, or a Vehicle/Location link,
// which has no face at all). Single-select only for now, matching
// TapSelectFace — see the "Lets just start with one person" spec this was
// built to.
export function LinkAttachmentDialog({
  attachmentId,
  photoUrl,
  open,
  onOpenChange,
  currentOperationId,
  rowCins,
}: {
  attachmentId: number;
  photoUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The operation this photo itself belongs to, if known — entities already
   * linked to it are surfaced first in "Link to another" (see filtered). */
  currentOperationId?: number;
  /** This photo's row's real CINs (excluding the "__SPACE__" spacer). Only
   * shown as a pickable section (below) when there's more than one — a
   * single-CIN row gets that link made automatically at upload instead, see
   * autoLinkAttachmentToRowMemberIfSingle in db.ts. */
  rowCins?: string[];
}) {
  const [tab, setTab] = useState<Category>("target");
  const [search, setSearch] = useState("");
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(
    null
  );
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[] | null>(
    null
  );
  const utils = trpc.useUtils();

  // Same double-tap guard as the picker this replaces: confirmPending only
  // flips true once React commits the mutation's isPending state — async
  // relative to the click itself — so a fast double-tap (common on the
  // touchscreen devices this is used on) can fire twice before any button
  // disables. Set synchronously in the click handler to close that window.
  const submittingRef = useRef(false);

  const { data: entities, isLoading } = trpc.intelligence.getEntities.useQuery(
    undefined,
    {
      enabled: open,
    }
  );

  const { data: currentLinks } = trpc.attachment.linksFor.useQuery(
    { attachmentId },
    { enabled: open }
  );

  const { data: faces, isLoading: facesLoading } =
    trpc.attachment.detectFaces.useQuery(
      { attachmentId },
      { enabled: open && !!photoUrl }
    );

  const invalidateLinkViews = () => {
    utils.attachment.linksFor.invalidate({ attachmentId });
    utils.attachment.entityLinkCounts.invalidate();
    // Refresh every place a linked/unlinked badge is shown for this photo
    utils.attachment.listBySheet.invalidate();
    utils.attachment.listByOperation.invalidate();
    utils.row.list.invalidate();
    utils.export.sheetData.invalidate();
  };

  // Target/Associate/Unidentified Person links close this dialog once
  // they're made (whether or not a face was involved) — those are "this
  // photo is of this person" identifications, one-and-done. Vehicle/
  // Location links keep it open, same as before, so an officer can link the
  // same photo to several of those in a row ("Link to another").
  const finishPersonLink = (matches: PendingMatch[]) => {
    invalidateLinkViews();
    setSelectedFaceIndex(null);
    submittingRef.current = false;
    if (matches.length > 0) setPendingMatches(matches);
    else onOpenChange(false);
  };

  const confirmEntity = trpc.attachment.confirmEntityFace.useMutation({
    onSuccess: data => {
      toast.success("Photo linked");
      finishPersonLink(
        data.matches.map(match => ({
          newLinkId: data.linkId,
          newPhotoUrl: photoUrl!,
          match,
        }))
      );
    },
    onError: e => {
      submittingRef.current = false;
      toast.error(e.message);
    },
  });

  const confirmUnidentified =
    trpc.attachment.confirmUnidentifiedPersonFaces.useMutation({
      onSuccess: data => {
        toast.success(
          `Tagged ${data.results.length} Unidentified Person entr${data.results.length === 1 ? "y" : "ies"}`
        );
        finishPersonLink(
          data.results.flatMap(r =>
            r.matches.map(match => ({
              newLinkId: r.linkId,
              newPhotoUrl: photoUrl!,
              match,
            }))
          )
        );
      },
      onError: e => {
        submittingRef.current = false;
        toast.error(e.message);
      },
    });

  const linkToEntity = trpc.attachment.linkToEntity.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(
        variables.category === "unidentified_person"
          ? "Tagged as Unidentified Person"
          : "Photo linked"
      );
      invalidateLinkViews();
      submittingRef.current = false;
      setSelectedFaceIndex(null);
      if (
        variables.category === "target" ||
        variables.category === "associate" ||
        variables.category === "unidentified_person"
      ) {
        onOpenChange(false);
      }
    },
    onError: e => {
      submittingRef.current = false;
      toast.error(e.message);
    },
  });

  const unlinkFromEntity = trpc.attachment.unlinkFromEntity.useMutation({
    onSuccess: () => {
      toast.success("Photo unlinked");
      invalidateLinkViews();
    },
    onError: e => toast.error(e.message),
  });

  const anyPending =
    confirmEntity.isPending ||
    confirmUnidentified.isPending ||
    linkToEntity.isPending;

  const pickCandidate = (e: any) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (FACE_CATEGORIES.has(tab) && selectedFaceIndex != null) {
      confirmEntity.mutate({
        attachmentId,
        faceIndex: selectedFaceIndex,
        category: tab as "target" | "associate",
        targetId: e.targetId,
        entityLabel: e.shortForm,
      });
    } else {
      linkToEntity.mutate({
        attachmentId,
        category: tab,
        targetId: e.targetId,
        entityLabel: e.shortForm,
      });
    }
  };

  const tagUnidentified = () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (selectedFaceIndex != null) {
      confirmUnidentified.mutate({
        attachmentId,
        faceIndices: [selectedFaceIndex],
      });
    } else {
      linkToEntity.mutate({
        attachmentId,
        category: "unidentified_person",
        entityLabel: `Unidentified Person #${attachmentId}`,
      });
    }
  };

  const filtered = useMemo(() => {
    if (!entities) return [];
    const q = search.trim().toLowerCase();
    return (entities as any[])
      .filter(e => categoryForEntity(e) === tab)
      .filter(e => !q || e.shortForm.toLowerCase().includes(q))
      .sort((a, b) => a.shortForm.localeCompare(b.shortForm));
  }, [entities, tab, search]);

  // With hundreds of entities across every operation, the entities actually
  // relevant to the running sheet/operation this photo belongs to are what
  // an officer is almost always looking for — split those out to the top
  // instead of leaving them to scroll past everything else alphabetically.
  const { inCurrentOp, otherEntities } = useMemo(() => {
    if (!currentOperationId)
      return { inCurrentOp: [] as any[], otherEntities: filtered };
    const inOp: any[] = [];
    const rest: any[] = [];
    for (const e of filtered) {
      const linked = (e.occurrences ?? []).some(
        (o: any) => o.operationId === currentOperationId
      );
      (linked ? inOp : rest).push(e);
    }
    return { inCurrentOp: inOp, otherEntities: rest };
  }, [filtered, currentOperationId]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link photo to entity</DialogTitle>
          </DialogHeader>

          {photoUrl && (
            <TapSelectFace
              photoUrl={photoUrl}
              faces={(faces ?? []) as any}
              loading={facesLoading}
              selectedIndex={selectedFaceIndex}
              onSelect={setSelectedFaceIndex}
            />
          )}

          {currentLinks && currentLinks.length > 0 && (
            <div className="rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
                Currently linked
              </p>
              <div className="flex flex-col gap-2">
                {currentLinks.map((link: any) => {
                  const Icon = CATEGORY_ICON[link.category] ?? Users;
                  const linkedOps = operationNamesFor(
                    findEntityForLink(link, entities as any[] | undefined)
                  );
                  return (
                    <div key={link.id} className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-background border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium w-fit max-w-full">
                        <Icon className="h-3 w-3 shrink-0" />
                        <span
                          className="truncate max-w-[260px]"
                          title={link.entityLabel}
                        >
                          {link.entityLabel}
                        </span>
                        <button
                          onClick={() =>
                            unlinkFromEntity.mutate({ linkId: link.id })
                          }
                          disabled={unlinkFromEntity.isPending}
                          title="Unlink"
                          className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-emerald-600/20 transition-colors shrink-0"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                      {linkedOps.length > 0 && (
                        <p
                          className="text-[10px] text-muted-foreground pl-2 truncate"
                          title={linkedOps.join(", ")}
                        >
                          {linkedOps.length === 1 ? "Op: " : "Ops: "}
                          {linkedOps.join(", ")}
                        </p>
                      )}
                      {link.category === "unidentified_person" && (
                        <OtherLinkedPhotos
                          category={link.category as Category}
                          targetId={link.targetId}
                          entityLabel={link.entityLabel}
                          excludeAttachmentId={attachmentId}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-l-4 border-violet-500/30 border-l-violet-500 bg-violet-500/5 p-3 flex flex-col gap-2.5">
            <p className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">
              {currentLinks && currentLinks.length > 0
                ? "Link to another"
                : "Link to"}
            </p>

            <div className="grid grid-cols-5 max-[420px]:grid-cols-3 gap-1.5">
              {CATEGORY_TABS.map(t => {
                const styles = CATEGORY_STYLES[t.key];
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-center text-[10.5px] font-medium leading-tight transition-colors ${
                      active
                        ? `${styles.activeBorder} ${styles.activeBg} ${styles.activeText}`
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <t.icon
                      className={`h-4 w-4 ${active ? "" : styles.icon}`}
                    />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {tab === "unidentified_person" ? (
              <div className="flex flex-col gap-2 py-2">
                <p className="text-sm text-muted-foreground">
                  {selectedFaceIndex != null
                    ? "Tags the selected face as a new, distinct Unidentified Person pool entry."
                    : "Tags this photo as a new, distinct Unidentified Person pool entry. Tap a face above first if you want to mark specifically who."}
                </p>
                <button
                  disabled={anyPending}
                  onClick={tagUnidentified}
                  className="text-left px-3 py-2 rounded-lg text-sm border border-border bg-background hover:bg-accent/50 transition-colors"
                >
                  + Tag as new Unidentified Person
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="pl-8 h-9 text-sm bg-background"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto flex flex-col gap-1">
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      Loading…
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No matches
                    </p>
                  ) : (
                    <>
                      {inCurrentOp.length > 0 && (
                        <>
                          <span className="inline-flex items-center w-fit mx-3 mt-1 mb-0.5 px-2 py-0.5 rounded-full border border-blue-700/50 bg-blue-700/10 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 shrink-0">
                            In this operation
                          </span>
                          {inCurrentOp.map((e, idx) => (
                            <EntityCandidateRow
                              key={`cur-${e.shortForm}-${idx}`}
                              e={e}
                              disabled={anyPending}
                              onPick={() => pickCandidate(e)}
                            />
                          ))}
                          <span className="inline-flex items-center w-fit mx-3 mt-2 mb-0.5 px-2 py-0.5 rounded-full border border-slate-500/50 bg-slate-500/10 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 shrink-0">
                            Other operations
                          </span>
                        </>
                      )}
                      {otherEntities.map((e, idx) => (
                        <EntityCandidateRow
                          key={`other-${e.shortForm}-${idx}`}
                          e={e}
                          disabled={anyPending}
                          onPick={() => pickCandidate(e)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {rowCins && rowCins.length > 1 && (
            <div className="rounded-lg border border-l-4 border-teal-500/30 border-l-teal-500 bg-teal-500/5 p-3 flex flex-col gap-2.5">
              <p className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wide">
                Link to a team member (CIN)
              </p>
              <p className="text-xs text-muted-foreground -mt-1">
                More than one member is on this row — pick who this photo
                belongs to.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {rowCins.map(cin => {
                  const alreadyLinked = (currentLinks ?? []).some(
                    (link: any) =>
                      link.category === "member" && link.entityLabel === cin
                  );
                  return (
                    <button
                      key={cin}
                      disabled={linkToEntity.isPending || alreadyLinked}
                      onClick={() =>
                        linkToEntity.mutate({
                          attachmentId,
                          category: "member",
                          entityLabel: cin,
                        })
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        alreadyLinked
                          ? "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-400"
                          : "border-border bg-background hover:bg-accent/50"
                      }`}
                    >
                      <IdCard className="h-3.5 w-3.5 text-teal-500" />
                      {cin}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pendingMatches && (
        <PossibleMatchDialog
          matches={pendingMatches}
          onDone={() => {
            setPendingMatches(null);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
