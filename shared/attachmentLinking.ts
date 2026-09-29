// A photo containing a detected face needs a link to an actual person
// (target/associate/unidentified_person) — a location or vehicle link is
// not enough, even though it does satisfy a plain "linked to something"
// check. Without this distinction, a photo of a person reads as fully
// linked the moment its address gets auto-linked (see
// server/db.ts's autoLinkAttachmentToRowAddresses), silently bypassing the
// whole point of the checks that use this: making sure every person in a
// surveillance photo actually gets identified/linked. faceCount is set
// once, shortly after upload, by an on-device RetinaFace pass (see
// server/attachmentUpload.ts) — null means "not yet known", not "no face",
// so it falls back to the old any-link behaviour rather than blocking on an
// absent value.
//
// Shared between the Governance "Imagery" check (client/src/pages/
// Governance.tsx) and the "unlinked photos" author to-do reminder
// (server/db.ts's getUnlinkedImagesTodoForCin) so both agree on what
// "properly linked" means.

export const PERSON_LINK_CATEGORIES = new Set([
  "target",
  "associate",
  "unidentified_person",
]);

// A photo attached to a running sheet row needs a link attributing it to
// which CIN it belongs to — same idea as the person-link requirement above,
// just about who was there rather than who/what is in the photo. Required
// whenever the photo has a row at all (rowId set), regardless of how many
// members are currently on that row: a row with exactly one member gets
// this auto-linked at upload (see server/db.ts's
// autoLinkAttachmentToRowMemberIfSingle) or as soon as it reaches exactly
// one member (reconcileRowPhotoMemberLinks); a row with 0 or 2+ members
// stays flagged until the officer picks via LinkAttachmentDialog's own CIN
// section (or another member is added, bringing it down to exactly one). A
// manually-uploaded photo with no row at all (rowId null) has no CIN to
// attribute it to, so this never applies to those.
export const CIN_LINK_CATEGORY = "member";

export function isAttachmentProperlyLinked(a: {
  linkedCount?: number;
  linkedCategories?: string[];
  faceCount?: number | null;
  rowId?: number | null;
}): boolean {
  if ((a.linkedCount ?? 0) === 0) return false;
  const categories = a.linkedCategories ?? [];
  const hasFace = (a.faceCount ?? 0) > 0;
  if (hasFace && !categories.some(c => PERSON_LINK_CATEGORIES.has(c)))
    return false;
  if (a.rowId != null && !categories.includes(CIN_LINK_CATEGORY)) return false;
  return true;
}
