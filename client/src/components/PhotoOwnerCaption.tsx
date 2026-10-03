/**
 * The small name printed under a staged photo thumbnail — who the photo is of
 * ("This target", "Priya Anjali SHAH"). Shared by every place a photo is
 * staged before it's saved (Add Target's Photos and Upload Image controls, an
 * associate card's Upload Image) or picked (Compare Faces), so a batch of
 * portraits can be checked at a glance. Already-saved photos show the same
 * information through LinkedEntityPills.
 */

/** "Priya Anjali SHAH, born 5 June 1985 (SHAH)" → "Priya Anjali SHAH".
 * Drops the ", born …" detail and the trailing "(SURNAME)" bracket that the
 * registry's composed names carry; a plain label ("This target") is left as
 * is. Takes ONE name — join several after shortening each. */
export function shortPersonName(label: string): string {
  return label
    .replace(/\s*\([^()]*\)\s*$/, "")
    .split(/,\s*born\b/i)[0]
    .split(",")[0]
    .trim();
}

export function PhotoOwnerCaption({ label }: { label: string }) {
  return (
    <span
      className="text-[10px] leading-tight text-center text-muted-foreground break-words w-full"
      title={label}
    >
      {shortPersonName(label)}
    </span>
  );
}
