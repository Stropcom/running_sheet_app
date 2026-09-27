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

export function isAttachmentProperlyLinked(a: {
  linkedCount?: number;
  linkedCategories?: string[];
  faceCount?: number | null;
}): boolean {
  if ((a.linkedCount ?? 0) === 0) return false;
  const hasFace = (a.faceCount ?? 0) > 0;
  if (!hasFace) return true;
  return (a.linkedCategories ?? []).some(c => PERSON_LINK_CATEGORIES.has(c));
}
