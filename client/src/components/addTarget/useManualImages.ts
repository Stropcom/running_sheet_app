// Part of the Add Target dialog (client/src/components/AddTargetDialog.tsx): the photos added by hand.
// The dialog used to be one 2,600-line function; its state, effects and handlers are now step
// hooks (called in order by useAddTargetScreen) and its layout is AddTargetView. Same code as
// before (only a few plain definitions moved earlier, never an effect); see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { makeExtraId } from "@/components/TargetStructuredFields";
import type { StagedImage } from "@/components/ImportTargetDocumentDialog";
import type { DuplicateStateState } from "./useDuplicateState";
import type { TargetFormState } from "./useTargetForm";
import type { AddTargetDialogProps } from "./types";
import { base64ToArrayBuffer, sha256Hex, readImageFile } from "./helpers";

export function useManualImages(
  s: Pick<
    DuplicateStateState,
    | "dupMatch"
    | "setCheckingImageDuplicates"
    | "setDuplicateImageKeys"
    | "setImageChoices"
  > &
    Pick<AddTargetDialogProps, "initialImages"> &
    Pick<TargetFormState, "utils">
) {
  const {
    dupMatch,
    initialImages,
    setCheckingImageDuplicates,
    utils,
    setDuplicateImageKeys,
    setImageChoices,
  } = s;

  // Photos the officer picks directly in this dialog (Upload Image button
  // under Person Identity / an associate's identity fields) — staged the
  // same way as a document-import photo (see StagedImage), just added here
  // instead of arriving via `initialImages`. A single hidden file input is
  // shared by every "Upload Image" button; which person it's for is
  // recorded in manualImageTarget when that button is clicked, just before
  // the input is opened.
  const [manualImages, setManualImages] = useState<StagedImage[]>([]);
  const [manualImageTarget, setManualImageTarget] = useState<
    StagedImage["linkTo"] | null
  >(null);
  const manualImageInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const triggerManualImageUpload = (linkTo: StagedImage["linkTo"]) => {
    setManualImageTarget(linkTo);
    manualImageInputRef.current?.click();
  };

  const handleManualImageSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const linkTo = manualImageTarget;
    setManualImageTarget(null);
    if (!file || !linkTo) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    try {
      const { dataBase64, mimeType, width, height } = await readImageFile(file);
      setManualImages(v => [
        ...v,
        { key: makeExtraId(), dataBase64, mimeType, width, height, linkTo },
      ]);
    } catch {
      toast.error("Could not read that image.");
    }
  };

  useEffect(() => {
    const candidateTargetId = dupMatch?.id;
    const staged = initialImages ?? [];
    if (!candidateTargetId || staged.length === 0) return;
    let cancelled = false;
    (async () => {
      setCheckingImageDuplicates(true);
      try {
        const existingPhotos = await utils.attachment.byEntity.fetch({
          category: "target",
          targetId: candidateTargetId,
        });
        if (cancelled || !existingPhotos || existingPhotos.length === 0) return;
        const existingHashes = await Promise.all(
          existingPhotos.map(async (p: any) => {
            try {
              const buf = await (await fetch(p.url)).arrayBuffer();
              return await sha256Hex(buf);
            } catch {
              return null;
            }
          })
        );
        const existingHashSet = new Set(
          existingHashes.filter((h): h is string => !!h)
        );
        if (existingHashSet.size === 0) return;
        const dupes = new Set<string>();
        for (const img of staged) {
          try {
            const hash = await sha256Hex(base64ToArrayBuffer(img.dataBase64));
            if (existingHashSet.has(hash)) dupes.add(img.key);
          } catch {
            // Couldn't hash this one — leave it kept rather than guess.
          }
        }
        if (!cancelled && dupes.size > 0) {
          setDuplicateImageKeys(dupes);
          setImageChoices(prev => {
            const next = { ...prev };
            dupes.forEach(key => {
              next[key] = false;
            });
            return next;
          });
        }
      } finally {
        if (!cancelled) setCheckingImageDuplicates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupMatch?.id]);

  return {
    manualImages,
    setManualImages,
    setManualImageTarget,
    manualImageInputRef,
    bodyRef,
    triggerManualImageUpload,
    handleManualImageSelected,
  };
}

export type ManualImagesState = ReturnType<typeof useManualImages>;
