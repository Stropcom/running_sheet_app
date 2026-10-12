import { PersonLinkRow } from "@/components/PersonLinkRow";

/**
 * One person under "Other Home Address Residents" or "Registered Associates":
 * their photo, name and a one-line detail; tapped it opens in place and shows
 * the same details as that person's own profile page. The row carries a scroll
 * anchor so the photoboard tile can jump to it.
 */
export function RegistryPersonRow({
  name,
  isIndicesOnly,
  kind,
  sub,
  anchorId,
}: {
  name: string;
  isIndicesOnly: boolean;
  kind: "resident" | "associate";
  /** One quiet line under the name (e.g. their home address). */
  sub?: string | null;
  /** Element id for the photoboard tile to scroll to. Left off inside an
   * opened drop-down, where the page already carries the id. */
  anchorId?: string;
}) {
  return (
    <PersonLinkRow
      kind="associate"
      refId={name}
      name={name}
      tone={kind}
      sub={sub}
      isIndicesOnly={isIndicesOnly}
      anchorId={anchorId}
    />
  );
}
