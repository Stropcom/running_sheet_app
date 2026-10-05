// Which running-sheet rows count as "images taken", and which CINs were on
// them. Shared by the TEAM / CERTIFY strip on the running sheet (the camera
// beside a CIN) and the Governance imagery check, so the two always agree
// without anyone having to tick a box.
//
// A row counts when its observation says images were taken ("PHOTOGRAPHS
// TAKEN", "VIDEO FOOTAGE TAKEN", …) OR an image is attached to it.

export const IMAGERY_PHRASE_PATTERN =
  /(PHOTOGRAPHS TAKEN|PHOTOGRAPH\/S TAKEN|PHOTOGRAPH TAKEN|VIDEO FOOTAGE TAKEN|VIDEO TAKEN|PHOTOS TAKEN|PHOTO TAKEN)/i;

interface ImageryRowLike {
  observation?: string | null;
  attachments?: ReadonlyArray<unknown> | null;
  members?: ReadonlyArray<{ memberName: string }> | null;
}

export function rowHasImageryPhrase(row: ImageryRowLike): boolean {
  return IMAGERY_PHRASE_PATTERN.test(row.observation ?? "");
}

export function rowHasAttachedImage(row: ImageryRowLike): boolean {
  return (row.attachments?.length ?? 0) > 0;
}

/** True when the row has an imagery phrase or an attached image. */
export function rowHasImagery(row: ImageryRowLike): boolean {
  return rowHasImageryPhrase(row) || rowHasAttachedImage(row);
}

/** Every CIN that is a member of at least one row with imagery. */
export function cinsWithImagery(
  rows: ReadonlyArray<ImageryRowLike>
): Set<string> {
  const cins = new Set<string>();
  for (const row of rows) {
    if (!rowHasImagery(row)) continue;
    for (const m of row.members ?? []) cins.add(m.memberName);
  }
  return cins;
}
