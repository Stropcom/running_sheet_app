/**
 * The small name printed under a staged photo thumbnail — who the photo is of
 * ("This target", "Priya Anjali SHAH, born 5 June 1985 (SHAH)"). Shared by
 * every place a photo is staged before it's saved (Add Target's Photos and
 * Upload Image controls, an associate card's Upload Image), so a batch of
 * portraits can be checked at a glance. Already-saved photos show the same
 * information through LinkedEntityPills.
 */
export function PhotoOwnerCaption({ label }: { label: string }) {
  return (
    <span
      className="text-[10px] leading-tight text-center text-muted-foreground break-words w-full"
      title={label}
    >
      {label}
    </span>
  );
}
