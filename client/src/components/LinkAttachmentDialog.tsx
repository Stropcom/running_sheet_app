import { trpc } from "@/lib/trpc";
import { compressAttachmentImage } from "@/lib/imageCompress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Car,
  User,
  MapPin,
  HelpCircle,
  Search,
  X,
  IdCard,
  ImagePlus,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  TapSelectFace,
  type DetectedFaceBox,
} from "@/components/TapSelectFace";
import {
  PossibleMatchDialog,
  type PendingMatch,
} from "@/components/PossibleMatchDialog";
import {
  SuggestedFaceMatchDialog,
  type FaceMatchSuggestion,
} from "@/components/SuggestedFaceMatchDialog";

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

// Full literal class strings, not string-interpolated colour names, since
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read photo."));
    reader.readAsDataURL(blob);
  });
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
  selected,
  onPick,
}: {
  e: any;
  disabled: boolean;
  selected?: boolean;
  onPick: () => void;
}) {
  const ops = operationNamesFor(e);
  return (
    <button
      disabled={disabled}
      onClick={onPick}
      className={`text-left px-3 py-2 rounded-lg text-sm transition-colors shrink-0 ${
        selected
          ? "bg-emerald-500/15 border border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
          : "bg-background hover:bg-accent/50 border border-transparent"
      }`}
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

// One category + a specific entity within it, chosen but not yet committed —
// only meaningful in upload (staging) mode, where nothing is saved until
// "Confirm upload" is pressed. entityLabel is left undefined for a new
// Unidentified Person pick, since its real label (`Unidentified Person
// #<id>`) can only be built once the upload has issued a real attachmentId.
interface PendingEntityPick {
  category: Category;
  targetId?: number;
  entityLabel?: string;
}

// Tap the face first, then pick who it is: the photo (with any detected
// faces shown as tappable boxes via TapSelectFace) sits at the top of the
// dialog and stays visible the whole time — picking a category or an
// entity below never swaps it out for a different screen.
//
// Two modes, one window, matching the officer's own mental model of "the
// Link photo to entity window" as a single thing:
//   - Existing mode (attachmentId given): the photo is already saved.
//     Picking a candidate links it immediately — no separate save step.
//   - Upload (staging) mode (attachmentId omitted): the photo hasn't been
//     saved yet. Face detection runs on the raw picked bytes
//     (detectFacesFromBytes) so the tap-a-face UI works before there's an
//     attachmentId to hang it on. Operation (required) and Running
//     Sheet/Row (optional) selects appear here too, since a manual upload
//     has no row to infer them from. Picking a category/entity here only
//     stages the choice (highlighted, not yet linked) — "Confirm upload"
//     uploads the photo and, if something was picked, links it in the same
//     action. Leaving nothing picked and confirming mirrors the running
//     sheet's own upload exactly: the photo saves, then the same
//     single-face auto-match popup offers a shortcut if it finds one.
// Single-face selection only for now, matching TapSelectFace — see the
// "Lets just start with one person" spec this was built to.
export function LinkAttachmentDialog({
  attachmentId,
  photoUrl,
  open,
  onOpenChange,
  currentOperationId,
  defaultOperationId,
  rowCins,
}: {
  /** Omit to open in upload (staging) mode instead of linking an existing photo. */
  attachmentId?: number;
  photoUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing mode: the operation this photo itself belongs to, if known —
   * entities already linked to it are surfaced first (see filtered). */
  currentOperationId?: number;
  /** Upload mode: pre-fills the required Operation select, e.g. when
   * opened from inside a specific operation's Images folder. */
  defaultOperationId?: number;
  /** Existing mode only. This photo's row's real CINs (excluding the
   * "__SPACE__" spacer). Only shown as a pickable section (below) when
   * there's more than one — a single-CIN row gets that link made
   * automatically at upload instead, see
   * autoLinkAttachmentToRowMemberIfSingle in db.ts. */
  rowCins?: string[];
}) {
  const isUploadMode = attachmentId == null;

  const [tab, setTab] = useState<Category>("target");
  const [search, setSearch] = useState("");
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(
    null
  );
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[] | null>(
    null
  );
  // Upload mode only — a category+entity picked but not yet linked (see
  // PendingEntityPick), and the single-face auto-match popup for when
  // nothing was picked at all (mirrors the running sheet's own upload).
  const [pendingEntity, setPendingEntity] = useState<PendingEntityPick | null>(
    null
  );
  const [uploadSuggestion, setUploadSuggestion] = useState<{
    id: number;
    url: string;
    match: FaceMatchSuggestion;
  } | null>(null);

  // Upload mode only — the picked-but-not-yet-saved photo and its
  // destination fields.
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadFaces, setUploadFaces] = useState<DetectedFaceBox[]>([]);
  const [uploadFacesLoading, setUploadFacesLoading] = useState(false);
  const [operationId, setOperationId] = useState<number | null>(
    defaultOperationId ?? null
  );
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [rowId, setRowId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Same double-tap guard as the picker this replaces: a mutation's own
  // isPending only flips true once React commits it — async relative to
  // the click itself — so a fast double-tap (common on the touchscreen
  // devices this is used on) can fire twice before any button disables.
  // Set synchronously in each click/submit handler to close that window.
  const submittingRef = useRef(false);

  const { data: entities, isLoading } = trpc.intelligence.getEntities.useQuery(
    undefined,
    { enabled: open }
  );

  const { data: currentLinks } = trpc.attachment.linksFor.useQuery(
    { attachmentId: attachmentId ?? 0 },
    { enabled: open && !isUploadMode }
  );

  const { data: existingFaces, isLoading: existingFacesLoading } =
    trpc.attachment.detectFaces.useQuery(
      { attachmentId: attachmentId ?? 0 },
      { enabled: open && !isUploadMode && !!photoUrl }
    );

  const { data: allOperations } = trpc.operation.list.useQuery(undefined, {
    enabled: open && isUploadMode,
  });
  const operationOptions = (allOperations ?? []) as any[];

  const { data: sheets } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId ?? -1 },
    { enabled: isUploadMode && operationId != null }
  );

  const { data: rows } = trpc.row.list.useQuery(
    { sheetId: sheetId ?? -1 },
    { enabled: isUploadMode && sheetId != null }
  );

  const invalidateLinkViews = (id: number) => {
    utils.attachment.linksFor.invalidate({ attachmentId: id });
    utils.attachment.entityLinkCounts.invalidate();
    // Refresh every place a linked/unlinked badge is shown for this photo
    utils.attachment.listBySheet.invalidate();
    utils.attachment.listByOperation.invalidate();
    utils.row.list.invalidate();
    utils.export.sheetData.invalidate();
  };

  const detectBytes = trpc.attachment.detectFacesFromBytes.useMutation();
  const uploadManual = trpc.attachment.uploadManual.useMutation();
  const confirmEntity = trpc.attachment.confirmEntityFace.useMutation();
  const confirmUnidentified =
    trpc.attachment.confirmUnidentifiedPersonFaces.useMutation();
  const linkToEntity = trpc.attachment.linkToEntity.useMutation();
  const unlinkFromEntity = trpc.attachment.unlinkFromEntity.useMutation({
    onSuccess: () => {
      toast.success("Photo unlinked");
      if (attachmentId != null) invalidateLinkViews(attachmentId);
    },
    onError: e => toast.error(e.message),
  });

  const anyPending =
    uploadManual.isPending ||
    confirmEntity.isPending ||
    confirmUnidentified.isPending ||
    linkToEntity.isPending;

  const resetUpload = () => {
    setFile(null);
    setPreview(null);
    setUploadFaces([]);
    setUploadFacesLoading(false);
    setOperationId(defaultOperationId ?? null);
    setSheetId(null);
    setRowId(null);
    setSelectedFaceIndex(null);
    setPendingEntity(null);
  };

  const faces = isUploadMode ? uploadFaces : ((existingFaces ?? []) as any);
  const facesLoading = isUploadMode ? uploadFacesLoading : existingFacesLoading;
  const tapPhotoUrl = isUploadMode ? preview : photoUrl;

  // Resolves once a link (or upload+link) succeeds — invalidates the usual
  // views, and either shows a possible-match popup or, once that's clear,
  // closes the dialog. Existing mode must defer that close until the popup
  // (if any) is dismissed, since this component is conditionally mounted by
  // its caller ({linking !== null && <LinkAttachmentDialog .../>}) and
  // closing would unmount it — and the popup with it — immediately.
  const finishLink = (id: number, matches: PendingMatch[]) => {
    invalidateLinkViews(id);
    setSelectedFaceIndex(null);
    if (matches.length > 0) setPendingMatches(matches);
    else onOpenChange(false);
  };

  const pickCandidate = async (e: any) => {
    if (isUploadMode) {
      setPendingEntity(prev =>
        prev &&
        prev.category === tab &&
        prev.targetId === e.targetId &&
        prev.entityLabel === e.shortForm
          ? null
          : { category: tab, targetId: e.targetId, entityLabel: e.shortForm }
      );
      return;
    }
    if (submittingRef.current || attachmentId == null) return;
    submittingRef.current = true;
    try {
      if (FACE_CATEGORIES.has(tab) && selectedFaceIndex != null) {
        const data = await confirmEntity.mutateAsync({
          attachmentId,
          faceIndex: selectedFaceIndex,
          category: tab as "target" | "associate",
          targetId: e.targetId,
          entityLabel: e.shortForm,
        });
        toast.success("Photo linked");
        finishLink(
          attachmentId,
          data.matches.map(match => ({
            newLinkId: data.linkId,
            newPhotoUrl: photoUrl!,
            match,
          }))
        );
      } else {
        await linkToEntity.mutateAsync({
          attachmentId,
          category: tab,
          targetId: e.targetId,
          entityLabel: e.shortForm,
        });
        toast.success("Photo linked");
        invalidateLinkViews(attachmentId);
        setSelectedFaceIndex(null);
        if (tab === "target" || tab === "associate") onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong.");
    } finally {
      submittingRef.current = false;
    }
  };

  const tagUnidentified = async () => {
    if (isUploadMode) {
      setPendingEntity(prev =>
        prev && prev.category === "unidentified_person"
          ? null
          : { category: "unidentified_person" }
      );
      return;
    }
    if (submittingRef.current || attachmentId == null) return;
    submittingRef.current = true;
    try {
      if (selectedFaceIndex != null) {
        const data = await confirmUnidentified.mutateAsync({
          attachmentId,
          faceIndices: [selectedFaceIndex],
        });
        toast.success(
          `Tagged ${data.results.length} Unidentified Person entr${data.results.length === 1 ? "y" : "ies"}`
        );
        finishLink(
          attachmentId,
          data.results.flatMap(r =>
            r.matches.map(match => ({
              newLinkId: r.linkId,
              newPhotoUrl: photoUrl!,
              match,
            }))
          )
        );
      } else {
        await linkToEntity.mutateAsync({
          attachmentId,
          category: "unidentified_person",
          entityLabel: `Unidentified Person #${attachmentId}`,
        });
        toast.success("Tagged as Unidentified Person");
        invalidateLinkViews(attachmentId);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong.");
    } finally {
      submittingRef.current = false;
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const compressed = await compressAttachmentImage(f);
      const blob = compressed?.blob ?? f;
      const mimeType = compressed?.mimeType ?? f.type;
      const fileName = compressed?.fileName ?? f.name;
      if (blob.size > 25 * 1024 * 1024) {
        toast.error("Photo must be under 25 MB.");
        return;
      }
      setFile({ blob, mimeType, fileName });
      setSelectedFaceIndex(null);
      setPendingEntity(null);
      const isHeic =
        !compressed &&
        (/^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name));
      if (isHeic) {
        setPreview(null);
        setUploadFaces([]);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(blob);

      setUploadFacesLoading(true);
      try {
        const dataBase64 = await blobToBase64(blob);
        const result = await detectBytes.mutateAsync({ dataBase64, mimeType });
        setUploadFaces(result);
      } catch {
        setUploadFaces([]);
      } finally {
        setUploadFacesLoading(false);
      }
    } catch {
      toast.error(
        "Couldn't process that photo — try again, or use a different photo."
      );
    }
  };

  const canConfirm = !!file && operationId != null && !anyPending;

  const handleConfirmUpload = async () => {
    if (!file || operationId == null || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const dataBase64 = await blobToBase64(file.blob);
      const result = await uploadManual.mutateAsync({
        operationId,
        rowId: rowId ?? undefined,
        dataBase64,
        mimeType: file.mimeType,
        fileName: file.fileName,
      });
      utils.attachment.listByOperation.invalidate({ operationId });
      if (sheetId != null) utils.attachment.listBySheet.invalidate({ sheetId });
      if (rowId != null)
        utils.row.list.invalidate({ sheetId: sheetId ?? undefined });
      toast.success("Photo uploaded");

      // Capture what was picked, then clear the picker/dialog immediately —
      // this component stays mounted either way (see resetUpload), so
      // nothing here needs to wait for a popup to survive.
      const chosenFaceIndex = selectedFaceIndex;
      const chosenEntity = pendingEntity;
      resetUpload();
      onOpenChange(false);

      if (chosenEntity && FACE_CATEGORIES.has(chosenEntity.category)) {
        if (chosenFaceIndex != null) {
          const data = await confirmEntity.mutateAsync({
            attachmentId: result.id,
            faceIndex: chosenFaceIndex,
            category: chosenEntity.category as "target" | "associate",
            targetId: chosenEntity.targetId,
            entityLabel: chosenEntity.entityLabel!,
          });
          toast.success("Photo linked");
          invalidateLinkViews(result.id);
          const matches = data.matches.map(match => ({
            newLinkId: data.linkId,
            newPhotoUrl: result.url,
            match,
          }));
          if (matches.length > 0) setPendingMatches(matches);
        } else {
          await linkToEntity.mutateAsync({
            attachmentId: result.id,
            category: chosenEntity.category,
            targetId: chosenEntity.targetId,
            entityLabel: chosenEntity.entityLabel!,
          });
          toast.success("Photo linked");
          invalidateLinkViews(result.id);
        }
      } else if (
        chosenEntity &&
        chosenEntity.category === "unidentified_person"
      ) {
        if (chosenFaceIndex != null) {
          const data = await confirmUnidentified.mutateAsync({
            attachmentId: result.id,
            faceIndices: [chosenFaceIndex],
          });
          toast.success(
            `Tagged ${data.results.length} Unidentified Person entr${data.results.length === 1 ? "y" : "ies"}`
          );
          invalidateLinkViews(result.id);
          const matches = data.results.flatMap(r =>
            r.matches.map(match => ({
              newLinkId: r.linkId,
              newPhotoUrl: result.url,
              match,
            }))
          );
          if (matches.length > 0) setPendingMatches(matches);
        } else {
          await linkToEntity.mutateAsync({
            attachmentId: result.id,
            category: "unidentified_person",
            entityLabel: `Unidentified Person #${result.id}`,
          });
          toast.success("Tagged as Unidentified Person");
          invalidateLinkViews(result.id);
        }
      } else if (chosenEntity) {
        // Vehicle / Location — no face involved.
        await linkToEntity.mutateAsync({
          attachmentId: result.id,
          category: chosenEntity.category,
          targetId: chosenEntity.targetId,
          entityLabel: chosenEntity.entityLabel!,
        });
        toast.success("Photo linked");
        invalidateLinkViews(result.id);
      } else {
        // Nothing picked — same single-face auto-match safety net the
        // running sheet's own upload has always had.
        const facePreview = await utils.attachment.previewFaceMatch.fetch({
          attachmentId: result.id,
        });
        if (facePreview?.suggestion) {
          setUploadSuggestion({
            id: result.id,
            url: result.url,
            match: facePreview.suggestion,
          });
        }
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed.");
    } finally {
      submittingRef.current = false;
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

  const activeOperationId = isUploadMode ? operationId : currentOperationId;

  // With hundreds of entities across every operation, the entities actually
  // relevant to the running sheet/operation this photo belongs to are what
  // an officer is almost always looking for — split those out to the top
  // instead of leaving them to scroll past everything else alphabetically.
  const { inCurrentOp, otherEntities } = useMemo(() => {
    if (!activeOperationId)
      return { inCurrentOp: [] as any[], otherEntities: filtered };
    const inOp: any[] = [];
    const rest: any[] = [];
    for (const e of filtered) {
      const linked = (e.occurrences ?? []).some(
        (o: any) => o.operationId === activeOperationId
      );
      (linked ? inOp : rest).push(e);
    }
    return { inCurrentOp: inOp, otherEntities: rest };
  }, [filtered, activeOperationId]);

  const isPendingPick = (
    category: Category,
    targetId?: number,
    entityLabel?: string
  ) =>
    !!pendingEntity &&
    pendingEntity.category === category &&
    pendingEntity.targetId === targetId &&
    pendingEntity.entityLabel === entityLabel;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={o => {
          if (!o && isUploadMode) resetUpload();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isUploadMode ? "Upload photo" : "Link photo to entity"}
            </DialogTitle>
          </DialogHeader>

          {isUploadMode ? (
            <div className="rounded-lg border border-l-4 border-border border-l-muted-foreground/40 bg-muted/20 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                Photo
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
              {file ? (
                <div className="flex flex-col gap-2">
                  {preview ? (
                    <TapSelectFace
                      photoUrl={preview}
                      faces={uploadFaces}
                      loading={uploadFacesLoading}
                      selectedIndex={selectedFaceIndex}
                      onSelect={setSelectedFaceIndex}
                    />
                  ) : (
                    <div className="w-full h-56 rounded-lg border border-border bg-background flex items-center justify-center text-xs text-muted-foreground text-center px-2">
                      No preview available for this file type
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {file.fileName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatFileSize(file.blob.size)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => inputRef.current?.click()}
                      className="shrink-0"
                    >
                      Change photo
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed border-border bg-background py-8 px-4 text-center hover:border-muted-foreground/50 hover:bg-muted/30 transition-colors"
                >
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Choose photo</span>
                  <span className="text-[11px] text-muted-foreground">
                    JPEG, PNG or HEIC, up to 25 MB
                  </span>
                </button>
              )}
            </div>
          ) : (
            tapPhotoUrl && (
              <TapSelectFace
                photoUrl={tapPhotoUrl}
                faces={faces}
                loading={facesLoading}
                selectedIndex={selectedFaceIndex}
                onSelect={setSelectedFaceIndex}
              />
            )
          )}

          {isUploadMode && (
            <div className="rounded-lg border border-l-4 border-sky-500/30 border-l-sky-500 bg-sky-500/5 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                Operation
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500 text-white tracking-wider">
                  REQUIRED
                </span>
              </p>
              {operationOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No operations found.
                </p>
              ) : (
                <Select
                  value={operationId != null ? String(operationId) : undefined}
                  onValueChange={v => {
                    setOperationId(Number(v));
                    setSheetId(null);
                    setRowId(null);
                  }}
                >
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select operation…" />
                  </SelectTrigger>
                  <SelectContent>
                    {operationOptions.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {isUploadMode && operationId != null && (
            <div className="rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                Running sheet
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-background border border-border text-muted-foreground tracking-wider">
                  OPTIONAL
                </span>
              </p>
              <Select
                value={sheetId != null ? String(sheetId) : "__none__"}
                onValueChange={v => {
                  setSheetId(v === "__none__" ? null : Number(v));
                  setRowId(null);
                }}
              >
                <SelectTrigger className="h-9 text-sm bg-background">
                  <SelectValue placeholder="Select running sheet…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(sheets ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.title || `Sheet #${s.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {sheetId != null && (
                <Select
                  value={rowId != null ? String(rowId) : "__none__"}
                  onValueChange={v =>
                    setRowId(v === "__none__" ? null : Number(v))
                  }
                >
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Select row…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(rows ?? []).map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {(r.time ?? "—") +
                          " · " +
                          (r.observation
                            ? String(r.observation).slice(0, 60)
                            : "(no observation)")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {!isUploadMode && currentLinks && currentLinks.length > 0 && (
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
                          excludeAttachmentId={attachmentId!}
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
              {isUploadMode
                ? "Link to (optional)"
                : currentLinks && currentLinks.length > 0
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
                  className={`text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                    isUploadMode && isPendingPick("unidentified_person")
                      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                      : "border-border bg-background hover:bg-accent/50"
                  }`}
                >
                  {isUploadMode && isPendingPick("unidentified_person")
                    ? "✓ Will tag as new Unidentified Person"
                    : "+ Tag as new Unidentified Person"}
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
                              selected={
                                isUploadMode &&
                                isPendingPick(tab, e.targetId, e.shortForm)
                              }
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
                          selected={
                            isUploadMode &&
                            isPendingPick(tab, e.targetId, e.shortForm)
                          }
                          onPick={() => pickCandidate(e)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {!isUploadMode && rowCins && rowCins.length > 1 && (
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
                      onClick={async () => {
                        try {
                          await linkToEntity.mutateAsync({
                            attachmentId: attachmentId!,
                            category: "member",
                            entityLabel: cin,
                          });
                          toast.success("Photo linked");
                          invalidateLinkViews(attachmentId!);
                        } catch (err: any) {
                          toast.error(err?.message ?? "Something went wrong.");
                        }
                      }}
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

          {isUploadMode && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  resetUpload();
                  onOpenChange(false);
                }}
              >
                Close
              </Button>
              <Button disabled={!canConfirm} onClick={handleConfirmUpload}>
                {anyPending ? "Uploading…" : "Confirm upload"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {pendingMatches && (
        <PossibleMatchDialog
          matches={pendingMatches}
          onDone={() => {
            setPendingMatches(null);
            if (!isUploadMode) onOpenChange(false);
          }}
        />
      )}

      {uploadSuggestion && (
        <SuggestedFaceMatchDialog
          attachmentId={uploadSuggestion.id}
          photoUrl={uploadSuggestion.url}
          suggestion={uploadSuggestion.match}
          onDone={() => setUploadSuggestion(null)}
        />
      )}
    </>
  );
}
