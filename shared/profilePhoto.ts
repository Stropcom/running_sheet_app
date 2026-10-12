/**
 * Which photo represents a person on the profile pages and the photoboard.
 *
 * 1. A photo added through the Target Registry (Add Target / an associate's
 *    card) always wins. If several were added there, the most recent one —
 *    the registry's current picture of them.
 * 2. With none from the registry, the first photo ever uploaded of them (not
 *    the latest, which is whatever happened to be added last).
 *
 * Pure and deterministic; the gallery lists keep their own newest-first order.
 */
export type ProfilePhotoCandidate = {
  id: number;
  fromRegistry?: boolean | null;
  createdAt?: Date | string | number | null;
};

function stamp(p: ProfilePhotoCandidate): number {
  const t = p.createdAt == null ? 0 : new Date(p.createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function pickProfilePhoto<T extends ProfilePhotoCandidate>(
  photos: readonly T[] | null | undefined
): T | null {
  if (!photos || photos.length === 0) return null;
  const registry = photos.filter(p => p.fromRegistry);
  if (registry.length > 0) {
    return registry.reduce((best, p) =>
      stamp(p) > stamp(best) || (stamp(p) === stamp(best) && p.id > best.id)
        ? p
        : best
    );
  }
  return photos.reduce((best, p) =>
    stamp(p) < stamp(best) || (stamp(p) === stamp(best) && p.id < best.id)
      ? p
      : best
  );
}
