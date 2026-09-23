import { trpc } from "@/lib/trpc";
import { compressAttachmentImage } from "@/lib/imageCompress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  ImagePlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FaceSelectPicker } from "@/components/FaceSelectPicker";

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

// Per-category colour, matching the field-type convention already used by
// Add Target / Import Target (sky/amber/violet/emerald + rose for the one
// category those dialogs don't have) — full literal class strings, not
// string-interpolated colour names, since Tailwind's JIT only picks up
// classes it can see written out in source.
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryForEntity(e: {
  type: string;
  isTarget?: boolean;
}): Exclude<Category, "unidentified_person"> {
  if (e.isTarget) return "target";
  if (e.type === "vehicle") return "vehicle";
  if (e.type === "address" || e.type === "business") return "location";
  return "associate";
}

// Manual upload from the Images folder — independent of any running sheet
// row. Flow: pick a photo → mandatory Operation (dropdown, most-recent-first
// — see getOperations) → optional Running Sheet/row → optionally link to an
// entity (Target/Vehicle/Associate/Location, or a brand-new Unidentified
// Person pool entry). Picking a known entity restricts the Operation choice
// to that entity's own operations (see restrictedOps below) — if the
// officer already chose an Operation before picking the entity and it isn't
// one of those, operationId resets so they re-pick a valid one.
export function UploadImageDialog({
  open,
  onOpenChange,
  defaultOperationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultOperationId?: number;
}) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [entityTab, setEntityTab] = useState<Category | null>(null);
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<{
    targetId?: number;
    entityLabel?: string;
  } | null>(null);

  const [operationId, setOperationId] = useState<number | null>(
    defaultOperationId ?? null
  );
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [rowId, setRowId] = useState<number | null>(null);

  // Set once the upload itself has succeeded and the officer picked
  // Unidentified Person, or a Target/Associate — the dialog then switches to
  // the face-select step instead of closing, since which specific face is
  // the subject still needs a human tap-to-confirm.
  const [faceSelectState, setFaceSelectState] = useState<
    | { id: number; url: string; mode: "unidentified" }
    | {
        id: number;
        url: string;
        mode: "entity";
        category: "target" | "associate";
        targetId?: number;
        entityLabel: string;
      }
    | null
  >(null);

  const knownEntitySelected =
    entityTab && entityTab !== "unidentified_person" && !!selectedEntity;

  const { data: entities } = trpc.intelligence.getEntities.useQuery(undefined, {
    enabled: open && !!entityTab && entityTab !== "unidentified_person",
  });

  const { data: restrictedOps } =
    trpc.attachment.linkedOperationsForEntity.useQuery(
      knownEntitySelected
        ? {
            category: entityTab as Exclude<Category, "unidentified_person">,
            targetId: selectedEntity?.targetId,
            entityLabel: selectedEntity?.entityLabel,
          }
        : { category: "location" },
      { enabled: !!knownEntitySelected }
    );

  const { data: allOperations } = trpc.operation.list.useQuery(undefined, {
    enabled: open,
  });

  const { data: sheets } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId ?? -1 },
    { enabled: operationId != null }
  );

  const { data: rows } = trpc.row.list.useQuery(
    { sheetId: sheetId ?? -1 },
    { enabled: sheetId != null }
  );

  // allOperations (operation.list) is already ordered most-recent-first
  // (getOperations orders by desc(createdAt)) — nothing further to sort here.
  const operationOptions = useMemo(() => {
    return ((knownEntitySelected ? restrictedOps : allOperations) ??
      []) as any[];
  }, [restrictedOps, allOperations, knownEntitySelected]);

  // Picking a known entity restricts the Operation choice to that entity's
  // own operations — but the already-chosen Operation is very often ALREADY
  // one of those (an officer usually picks the entity for the operation
  // they're already working in), so the old behaviour of unconditionally
  // clearing operationId the instant an entity was clicked was wrong: it
  // wiped a perfectly valid Operation, which also hid the Running Sheet
  // section (gated on operationId != null, see below) and greyed out
  // Upload (canSubmit requires operationId), even though nothing was
  // actually invalid. Only reset once restrictedOps has actually loaded
  // for the newly-picked entity AND the current choice isn't in it — a
  // real invalidation, not every entity click.
  useEffect(() => {
    if (!knownEntitySelected || !restrictedOps) return;
    if (
      operationId != null &&
      !restrictedOps.some((o: any) => o.id === operationId)
    ) {
      setOperationId(null);
      setSheetId(null);
      setRowId(null);
    }
  }, [knownEntitySelected, restrictedOps, operationId]);

  const filteredEntities = useMemo(() => {
    if (!entities || !entityTab || entityTab === "unidentified_person")
      return [];
    const q = entitySearch.trim().toLowerCase();
    return (entities as any[])
      .filter(e => categoryForEntity(e) === entityTab)
      .filter(e => !q || e.shortForm.toLowerCase().includes(q));
  }, [entities, entityTab, entitySearch]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setEntityTab(null);
    setEntitySearch("");
    setSelectedEntity(null);
    setOperationId(defaultOperationId ?? null);
    setSheetId(null);
    setRowId(null);
    setFaceSelectState(null);
  };

  const uploadManual = trpc.attachment.uploadManual.useMutation();
  const linkToEntity = trpc.attachment.linkToEntity.useMutation();

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
      const isHeic =
        !compressed &&
        (/^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name));
      if (!isHeic) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(blob);
      } else {
        setPreview(null);
      }
    } catch {
      toast.error(
        "Couldn't process that photo — try again, or use a different photo."
      );
    }
  };

  const canSubmit =
    !!file &&
    operationId != null &&
    !uploadManual.isPending &&
    !linkToEntity.isPending;

  const handleSubmit = async () => {
    if (!file || operationId == null) return;
    const dataBase64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Could not read photo."));
      reader.readAsDataURL(file.blob);
    });

    try {
      const result = await uploadManual.mutateAsync({
        operationId,
        rowId: rowId ?? undefined,
        dataBase64,
        mimeType: file.mimeType,
        fileName: file.fileName,
      });

      if (entityTab === "unidentified_person") {
        // The upload itself is done — hand off to the face-select step so
        // the officer can tap which detected face(s) are the unidentified
        // person(s) rather than tagging the whole photo blindly.
        utils.attachment.listByOperation.invalidate({ operationId });
        if (sheetId != null)
          utils.attachment.listBySheet.invalidate({ sheetId });
        if (rowId != null)
          utils.row.list.invalidate({ sheetId: sheetId ?? undefined });
        setFaceSelectState({
          id: result.id,
          url: result.url,
          mode: "unidentified",
        });
        return;
      } else if (
        (entityTab === "target" || entityTab === "associate") &&
        selectedEntity
      ) {
        // Same hand-off, but the officer already knows the identity — the
        // face-select step just needs to know which face in the photo is
        // that person, so its embedding can feed future match suggestions.
        utils.attachment.listByOperation.invalidate({ operationId });
        if (sheetId != null)
          utils.attachment.listBySheet.invalidate({ sheetId });
        if (rowId != null)
          utils.row.list.invalidate({ sheetId: sheetId ?? undefined });
        setFaceSelectState({
          id: result.id,
          url: result.url,
          mode: "entity",
          category: entityTab,
          targetId: selectedEntity.targetId,
          entityLabel: selectedEntity.entityLabel ?? "",
        });
        return;
      } else if (entityTab && selectedEntity) {
        await linkToEntity.mutateAsync({
          attachmentId: result.id,
          category: entityTab,
          targetId: selectedEntity.targetId,
          entityLabel: selectedEntity.entityLabel ?? "",
        });
      }

      utils.attachment.listByOperation.invalidate({ operationId });
      if (sheetId != null) utils.attachment.listBySheet.invalidate({ sheetId });
      if (rowId != null)
        utils.row.list.invalidate({ sheetId: sheetId ?? undefined });
      toast.success("Photo uploaded");
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {faceSelectState?.mode === "unidentified"
              ? "Tag Unidentified Person"
              : faceSelectState?.mode === "entity"
                ? "Confirm face"
                : "Upload photo"}
          </DialogTitle>
        </DialogHeader>

        {faceSelectState?.mode === "unidentified" ? (
          <FaceSelectPicker
            attachmentId={faceSelectState.id}
            photoUrl={faceSelectState.url}
            onDone={() => {
              toast.success("Photo uploaded");
              onOpenChange(false);
              reset();
            }}
            onCancel={() => {
              toast.success("Photo uploaded");
              onOpenChange(false);
              reset();
            }}
          />
        ) : faceSelectState?.mode === "entity" ? (
          <FaceSelectPicker
            mode="entity"
            attachmentId={faceSelectState.id}
            photoUrl={faceSelectState.url}
            category={faceSelectState.category}
            targetId={faceSelectState.targetId}
            entityLabel={faceSelectState.entityLabel}
            onDone={() => {
              toast.success("Photo uploaded");
              onOpenChange(false);
              reset();
            }}
            onCancel={() => {
              toast.success("Photo uploaded");
              onOpenChange(false);
              reset();
            }}
          />
        ) : (
          <>
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
                    <img
                      src={preview}
                      alt="Selected photograph"
                      className="w-full max-h-80 object-contain rounded-lg border border-border bg-background"
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

            <div className="rounded-lg border border-l-4 border-sky-500/30 border-l-sky-500 bg-sky-500/5 p-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                Operation
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500 text-white tracking-wider">
                  REQUIRED
                </span>
              </p>
              {knownEntitySelected &&
              (!restrictedOps || restrictedOps.length === 0) ? (
                <p className="text-sm text-muted-foreground">
                  This entity isn't linked to any operation yet.
                </p>
              ) : operationOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No operations found.
                </p>
              ) : (
                <Select
                  // Forces Radix to remount instead of showing a stale
                  // cached selection when operationId genuinely gets reset
                  // to null (see the effect above) — its controlled `value`
                  // going back to undefined otherwise falls back to
                  // whatever it last rendered, showing an Operation name
                  // that's no longer actually selected.
                  key={operationId ?? "none"}
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

            {operationId != null && (
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

            <div className="rounded-lg border border-l-4 border-violet-500/30 border-l-violet-500 bg-violet-500/5 p-3 flex flex-col gap-2.5">
              <p className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide flex items-center gap-1.5">
                Link to entity
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-background border border-border text-muted-foreground tracking-wider">
                  OPTIONAL
                </span>
              </p>
              <div className="grid grid-cols-5 max-[420px]:grid-cols-3 gap-1.5">
                {CATEGORY_TABS.map(t => {
                  const styles = CATEGORY_STYLES[t.key];
                  const active = entityTab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => {
                        // Just switching category tabs never restricts which
                        // Operation is valid — knownEntitySelected (and therefore
                        // restrictedOps) requires a specific entity to be picked
                        // from the list below, which always clears selectedEntity
                        // right after this click. Operation only needs to reset
                        // once an actual entity is picked (see onPick below) —
                        // resetting it here too used to silently null out
                        // operationId on every tab click, disabling Upload, while
                        // the Select kept showing the old Operation's name (a
                        // Radix Select quirk: once its controlled `value` goes
                        // back to undefined it falls back to its own stale
                        // cached selection).
                        setEntityTab(prev => (prev === t.key ? null : t.key));
                        setSelectedEntity(null);
                        setEntitySearch("");
                      }}
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

              {entityTab === "unidentified_person" && (
                <p className="text-sm text-muted-foreground px-1">
                  After uploading, you'll be asked to tap which face(s) in the
                  photo are the unidentified person(s).
                </p>
              )}

              {entityTab && entityTab !== "unidentified_person" && (
                <>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={entitySearch}
                      onChange={e => setEntitySearch(e.target.value)}
                      placeholder="Search…"
                      className="pl-8 h-9 text-sm bg-background"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-1">
                    {filteredEntities.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No matches
                      </p>
                    ) : (
                      filteredEntities.map((e: any, idx: number) => {
                        const isSelected =
                          selectedEntity?.entityLabel === e.shortForm &&
                          selectedEntity?.targetId === e.targetId;
                        const styles = CATEGORY_STYLES[entityTab];
                        return (
                          <button
                            key={`${e.shortForm}-${idx}`}
                            onClick={() => {
                              // Does NOT reset operationId here — see the
                              // effect above this component's return, which
                              // only clears it once restrictedOps confirms
                              // the current choice genuinely isn't valid for
                              // this entity, instead of wiping a still-valid
                              // Operation on every click.
                              setSelectedEntity({
                                targetId: e.targetId,
                                entityLabel: e.shortForm,
                              });
                            }}
                            className={`text-left px-3 py-2 rounded-lg text-sm transition-colors truncate shrink-0 bg-background ${
                              isSelected
                                ? `${styles.activeBg} ${styles.activeText} font-medium`
                                : "hover:bg-muted/50"
                            }`}
                          >
                            {e.shortForm}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button disabled={!canSubmit} onClick={handleSubmit}>
                {uploadManual.isPending || linkToEntity.isPending
                  ? "Uploading…"
                  : "Upload"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
