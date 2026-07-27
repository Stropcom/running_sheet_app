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
import { Users, Car, User, MapPin, HelpCircle, Search, ImagePlus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FaceSelectPicker } from "@/components/FaceSelectPicker";

type Category = "target" | "vehicle" | "associate" | "location" | "unidentified_person";

const CATEGORY_TABS: { key: Category; label: string; icon: typeof Users }[] = [
  { key: "target", label: "Targets", icon: Users },
  { key: "vehicle", label: "Vehicles", icon: Car },
  { key: "associate", label: "Associates", icon: User },
  { key: "location", label: "Locations", icon: MapPin },
  { key: "unidentified_person", label: "Unidentified Person", icon: HelpCircle },
];

function categoryForEntity(e: { type: string; isTarget?: boolean }): Exclude<Category, "unidentified_person"> {
  if (e.isTarget) return "target";
  if (e.type === "vehicle") return "vehicle";
  if (e.type === "address" || e.type === "business") return "location";
  return "associate";
}

// Manual upload from the Images folder — independent of any running sheet
// row. Flow: pick a photo → optionally link it to an entity (Target/
// Vehicle/Associate/Location, or a brand-new Unidentified Person pool
// entry) → mandatory Operation → optional Running Sheet/row. Mirrors the
// process the user specified: upload, link to entity, link to operation
// (restricted to that entity's own operations when a known entity is
// picked), link to running sheet.
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

  const [file, setFile] = useState<{ blob: Blob; mimeType: string; fileName: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [entityTab, setEntityTab] = useState<Category | null>(null);
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<{ targetId?: number; entityLabel?: string } | null>(null);

  const [operationId, setOperationId] = useState<number | null>(defaultOperationId ?? null);
  const [operationSearch, setOperationSearch] = useState("");
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [rowId, setRowId] = useState<number | null>(null);

  // Set once the upload itself has succeeded and the officer picked
  // Unidentified Person — the dialog then switches to the face-select step
  // instead of closing, since which specific face(s) are the UP subject(s)
  // still needs a human tap-to-confirm.
  const [uploadedForFaceSelect, setUploadedForFaceSelect] = useState<{ id: number; url: string } | null>(null);

  const knownEntitySelected = entityTab && entityTab !== "unidentified_person" && !!selectedEntity;

  const { data: entities } = trpc.intelligence.getEntities.useQuery(undefined, {
    enabled: open && !!entityTab && entityTab !== "unidentified_person",
  });

  const { data: restrictedOps } = trpc.attachment.linkedOperationsForEntity.useQuery(
    knownEntitySelected
      ? { category: entityTab as Exclude<Category, "unidentified_person">, targetId: selectedEntity?.targetId, entityLabel: selectedEntity?.entityLabel }
      : { category: "location" },
    { enabled: !!knownEntitySelected }
  );

  const { data: allOperations } = trpc.operation.list.useQuery(undefined, { enabled: open });

  const { data: sheets } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId ?? -1 },
    { enabled: operationId != null }
  );

  const { data: rows } = trpc.row.list.useQuery(
    { sheetId: sheetId ?? -1 },
    { enabled: sheetId != null }
  );

  const operationOptions = useMemo(() => {
    const source = (knownEntitySelected ? restrictedOps : allOperations) ?? [];
    const q = operationSearch.trim().toLowerCase();
    return (source as any[]).filter((o) => !q || o.name.toLowerCase().includes(q));
  }, [restrictedOps, allOperations, knownEntitySelected, operationSearch]);

  const filteredEntities = useMemo(() => {
    if (!entities || !entityTab || entityTab === "unidentified_person") return [];
    const q = entitySearch.trim().toLowerCase();
    return (entities as any[])
      .filter((e) => categoryForEntity(e) === entityTab)
      .filter((e) => !q || e.shortForm.toLowerCase().includes(q));
  }, [entities, entityTab, entitySearch]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setEntityTab(null);
    setEntitySearch("");
    setSelectedEntity(null);
    setOperationId(defaultOperationId ?? null);
    setOperationSearch("");
    setSheetId(null);
    setRowId(null);
    setUploadedForFaceSelect(null);
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
      const isHeic = !compressed && (/^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name));
      if (!isHeic) {
        const reader = new FileReader();
        reader.onload = () => setPreview(reader.result as string);
        reader.readAsDataURL(blob);
      } else {
        setPreview(null);
      }
    } catch {
      toast.error("Couldn't process that photo — try again, or use a different photo.");
    }
  };

  const canSubmit = !!file && operationId != null && !uploadManual.isPending && !linkToEntity.isPending;

  const handleSubmit = async () => {
    if (!file || operationId == null) return;
    const dataBase64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
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
        utils.attachment.listUploaded.invalidate();
        if (sheetId != null) utils.attachment.listBySheet.invalidate({ sheetId });
        if (rowId != null) utils.row.list.invalidate({ sheetId: sheetId ?? undefined });
        setUploadedForFaceSelect({ id: result.id, url: result.url });
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
      utils.attachment.listUploaded.invalidate();
      if (sheetId != null) utils.attachment.listBySheet.invalidate({ sheetId });
      if (rowId != null) utils.row.list.invalidate({ sheetId: sheetId ?? undefined });
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
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{uploadedForFaceSelect ? "Tag Unidentified Person" : "Upload photo"}</DialogTitle>
        </DialogHeader>

        {uploadedForFaceSelect ? (
          <FaceSelectPicker
            attachmentId={uploadedForFaceSelect.id}
            photoUrl={uploadedForFaceSelect.url}
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
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photo</p>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          {file ? (
            <div className="flex flex-col gap-2 w-fit">
              {preview ? (
                <img src={preview} alt="Selected photograph" className="max-w-[220px] rounded-lg border border-border" />
              ) : (
                <div className="w-[220px] aspect-square rounded-lg border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground text-center px-2">
                  {file.fileName}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                Change photo
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => inputRef.current?.click()} className="w-fit gap-2">
              <ImagePlus className="h-4 w-4" />
              Choose photo
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link to entity (optional)</p>
          <div className="flex gap-1 border-b border-border pb-2 flex-wrap">
            {CATEGORY_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setEntityTab((prev) => (prev === t.key ? null : t.key));
                  setSelectedEntity(null);
                  setEntitySearch("");
                  setOperationId(defaultOperationId ?? null);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  entityTab === t.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {entityTab === "unidentified_person" && (
            <p className="text-sm text-muted-foreground px-1">
              After uploading, you'll be asked to tap which face(s) in the photo are the unidentified person(s).
            </p>
          )}

          {entityTab && entityTab !== "unidentified_person" && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={entitySearch}
                  onChange={(e) => setEntitySearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <div className="max-h-36 overflow-y-auto flex flex-col gap-1">
                {filteredEntities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No matches</p>
                ) : (
                  filteredEntities.map((e: any, idx: number) => {
                    const isSelected = selectedEntity?.entityLabel === e.shortForm && selectedEntity?.targetId === e.targetId;
                    return (
                      <button
                        key={`${e.shortForm}-${idx}`}
                        onClick={() => {
                          setSelectedEntity({ targetId: e.targetId, entityLabel: e.shortForm });
                          setOperationId(null);
                        }}
                        className={`text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                          isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
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

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operation (required)</p>
          {knownEntitySelected && (!restrictedOps || restrictedOps.length === 0) ? (
            <p className="text-sm text-muted-foreground">This entity isn't linked to any operation yet.</p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={operationSearch}
                  onChange={(e) => setOperationSearch(e.target.value)}
                  placeholder="Search operations…"
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <div className="max-h-36 overflow-y-auto flex flex-col gap-1 border border-border rounded-lg p-1">
                {operationOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No operations found</p>
                ) : (
                  operationOptions.map((o: any) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setOperationId(o.id);
                        setSheetId(null);
                        setRowId(null);
                      }}
                      className={`text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                        operationId === o.id ? "bg-primary/10 text-primary" : "hover:bg-accent/50"
                      }`}
                    >
                      {o.name}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {operationId != null && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Running sheet (optional)</p>
            <Select
              value={sheetId != null ? String(sheetId) : "__none__"}
              onValueChange={(v) => {
                setSheetId(v === "__none__" ? null : Number(v));
                setRowId(null);
              }}
            >
              <SelectTrigger className="h-9 text-sm">
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
                onValueChange={(v) => setRowId(v === "__none__" ? null : Number(v))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select row…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {(rows ?? []).map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {(r.time ?? "—") + " · " + (r.observation ? String(r.observation).slice(0, 60) : "(no observation)")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

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
            {uploadManual.isPending || linkToEntity.isPending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
