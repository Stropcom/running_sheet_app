/**
 * "Upload Image" inside an entity's EDIT form on the Target Registry card — the
 * same offer Add Target gives each person, address and vehicle. A photo is
 * picked while editing and shown as a thumbnail; it is only uploaded and linked
 * once the edit is saved (`useEntityPhotoSaver`), because it links by the
 * entity's saved label, which an edit can change and a new entry doesn't have
 * yet. Which entity a photo is for is its `slot` (shared/entityPhotoSlots.ts).
 */
import { useCallback, useRef, useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { readImageFile } from "@/components/AddTargetDialog";
import { PhotoOwnerCaption } from "@/components/PhotoOwnerCaption";
import { makeExtraId } from "@/components/TargetStructuredFields";
import {
  resolvePhotoLink,
  type SavedEntityLabels,
} from "@shared/entityPhotoSlots";

export interface StagedEntityPhoto {
  key: string;
  slot: string;
  dataBase64: string;
  mimeType: string;
}

/** The photos picked so far on one card, across all its entities. */
export function useEntityPhotos() {
  const [photos, setPhotos] = useState<StagedEntityPhoto[]>([]);
  const add = useCallback(
    (slot: string, img: { dataBase64: string; mimeType: string }) =>
      setPhotos(v => [...v, { key: makeExtraId(), slot, ...img }]),
    []
  );
  const remove = useCallback(
    (key: string) => setPhotos(v => v.filter(p => p.key !== key)),
    []
  );
  const clear = useCallback(() => setPhotos([]), []);
  /** Drops everything picked for one entity (its edit was cancelled or the
   * entry removed), so nothing is uploaded for it on the next Save. */
  const removeSlot = useCallback(
    (slot: string) => setPhotos(v => v.filter(p => p.slot !== slot)),
    []
  );
  return { photos, add, remove, clear, removeSlot };
}

// Border colour of a thumbnail follows the entity colour (Form kit).
const TONE_BORDER = {
  person: "border-rose-500",
  associate: "border-violet-500",
  resident: "border-sky-500",
  address: "border-emerald-500",
  vehicle: "border-amber-500",
} as const;

export function EntityPhotoUpload({
  slot,
  photos,
  onAdd,
  onRemove,
  tone,
  ownerLabel,
  disabledReason,
}: {
  slot: string;
  photos: StagedEntityPhoto[];
  onAdd: (slot: string, img: { dataBase64: string; mimeType: string }) => void;
  onRemove: (key: string) => void;
  tone: keyof typeof TONE_BORDER;
  /** Printed under each thumbnail — who or what the photo is of. */
  ownerLabel: string;
  /** Set when photos can't be added yet (e.g. no operation to store them in). */
  disabledReason?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = photos.filter(p => p.slot === slot);

  const handleSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    try {
      const { dataBase64, mimeType } = await readImageFile(file);
      onAdd(slot, { dataBase64, mimeType });
    } catch {
      toast.error("Could not read that image.");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelected}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 self-start"
        disabled={!!disabledReason}
        title={disabledReason}
        onClick={() => inputRef.current?.click()}
      >
        <ImageIcon className="w-3.5 h-3.5" /> Upload Image
      </Button>
      {disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
      {mine.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {mine.map(img => (
              <div
                key={img.key}
                className="flex flex-col items-center gap-1 w-16"
              >
                <div
                  className={`relative rounded-md overflow-hidden border-2 ${TONE_BORDER[tone]}`}
                >
                  <img
                    src={`data:${img.mimeType};base64,${img.dataBase64}`}
                    alt="Photo to add"
                    className="w-16 h-16 object-cover block"
                  />
                  <button
                    type="button"
                    title="Remove this photo"
                    onClick={() => onRemove(img.key)}
                    className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
                <PhotoOwnerCaption label={ownerLabel} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Added when you save.</p>
        </>
      )}
    </div>
  );
}

/**
 * Uploads and links the photos picked on a card, once its edit has been saved.
 * `person` is what the card's name slot means: the Target itself, or an
 * Associate / Resident (linked by name). A single clear face on a person photo
 * is stored against them (so later face matches can find them), as Add Target
 * does; otherwise the photo is just linked.
 */
export function useEntityPhotoSaver(params: {
  operationId: number | null;
  person: { category: "target"; targetId: number } | { category: "associate" };
}) {
  const { operationId, person } = params;
  const utils = trpc.useUtils();
  const uploadMut = trpc.attachment.uploadManual.useMutation();
  const confirmFaceMut = trpc.attachment.confirmEntityFace.useMutation();
  const linkMut = trpc.attachment.linkToEntity.useMutation();

  return useCallback(
    async (photos: StagedEntityPhoto[], saved: SavedEntityLabels) => {
      if (photos.length === 0) return;
      if (!operationId) {
        toast.error(
          "Saved, but the photos weren't added — this target isn't linked to an operation yet. Add them from its Images folder."
        );
        return;
      }
      let ok = 0;
      let failed = 0;
      for (const photo of photos) {
        try {
          const link = resolvePhotoLink(photo.slot, saved);
          if (!link) throw new Error("nothing to link to");
          const uploaded = await uploadMut.mutateAsync({
            operationId,
            dataBase64: photo.dataBase64,
            mimeType: photo.mimeType,
            fileName: `${photo.slot.replace(/[^a-z]/gi, "")}-photo-${photo.key}.png`,
          });
          if (link.kind === "person") {
            const target =
              person.category === "target" ? { targetId: person.targetId } : {};
            let faces: { index: number }[] = [];
            try {
              faces = await utils.attachment.detectFaces.fetch({
                attachmentId: uploaded.id,
              });
            } catch {
              faces = [];
            }
            if (faces.length === 1) {
              await confirmFaceMut.mutateAsync({
                attachmentId: uploaded.id,
                faceIndex: faces[0].index,
                category: person.category,
                ...target,
                entityLabel: link.label,
                fromRegistry: true,
              });
            } else {
              await linkMut.mutateAsync({
                attachmentId: uploaded.id,
                category: person.category,
                ...target,
                entityLabel: link.label,
                fromRegistry: true,
              });
            }
          } else {
            await linkMut.mutateAsync({
              attachmentId: uploaded.id,
              category: link.kind,
              entityLabel: link.label,
              fromRegistry: true,
            });
          }
          ok++;
        } catch {
          failed++;
        }
      }
      utils.attachment.byEntity.invalidate();
      utils.attachment.listByOperation.invalidate();
      if (ok > 0)
        toast.success(`${ok} photo${ok > 1 ? "s" : ""} added and linked.`);
      if (failed > 0)
        toast.error(
          `${failed} photo${failed > 1 ? "s" : ""} couldn't be added — add ${failed > 1 ? "them" : "it"} from the Images folder.`
        );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operationId, person.category, (person as { targetId?: number }).targetId]
  );
}
