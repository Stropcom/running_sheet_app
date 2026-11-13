// Part of the Target Registry page (client/src/pages/TargetRegistry.tsx): a target's Associates and Other Home Address Residents sections.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import { type StructuredAddressParts } from "@/lib/addressFormat";
import { FORM_TONES } from "@/lib/formKit";
import { cn } from "@/lib/utils";
import type { AssociateRecord, PersonKind } from "./types";
import { PERSON_SECTION_STYLE } from "./registryHelpers";
import { AssociateCard } from "./AssociateCard";

/** One coloured block of people filed under a target — either its
 * Associates or its Other Home Address Residents. Same card, same fields;
 * `kind` only changes the heading, colour and which rows are listed. */
function PersonListSection({
  kind,
  targetId,
  operationId,
  people,
  defaultAddress,
  targetAddress,
}: {
  kind: PersonKind;
  targetId: number;
  operationId: number | null;
  people: AssociateRecord[];
  /** Pre-fills a new card's Home Address (residents only). */
  defaultAddress?: StructuredAddressParts;
  /** The target's saved Home Address, for the "move to Residents" offer. */
  targetAddress?: StructuredAddressParts;
}) {
  const [addingNew, setAddingNew] = useState(false);
  const style = PERSON_SECTION_STYLE[kind];
  return (
    <div
      className={cn(
        FORM_TONES[style.tone].panel,
        "mt-2 p-3 flex flex-col gap-2"
      )}
    >
      <p className={FORM_TONES[style.tone].band}>
        <Users className="w-3.5 h-3.5" /> {style.title}
      </p>
      {people.map(a => (
        <AssociateCard
          key={a.id}
          targetId={targetId}
          associate={a}
          operationId={operationId}
          targetAddress={targetAddress}
        />
      ))}
      {addingNew && (
        <AssociateCard
          targetId={targetId}
          associate={null}
          operationId={operationId}
          relationship={kind}
          defaultAddress={defaultAddress}
          targetAddress={targetAddress}
          onCreated={() => setAddingNew(false)}
        />
      )}
      {!addingNew && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 self-start"
          onClick={() => setAddingNew(true)}
        >
          <Plus className="w-3.5 h-3.5" /> {style.add}
        </Button>
      )}
    </div>
  );
}

export function AssociatesSection({
  targetId,
  operationId,
  targetAddress,
}: {
  targetId: number;
  /** The target's saved Home Address — becomes a new resident's default. */
  targetAddress: StructuredAddressParts;
  /** Used to upload a photo staged from the Upload Image button (see
   * AssociateCard) — a target can be linked to several operations, so this
   * is just the first one; attachment.uploadManual needs some operation to
   * file the upload under, and which one doesn't otherwise matter here. */
  operationId: number | null;
}) {
  const { data: assocList } = trpc.associate.listForTarget.useQuery({
    targetId,
  });
  const all = (assocList ?? []) as AssociateRecord[];
  // Residents first, then Associates — residents are the people living with
  // the target, associates everyone else known to them.
  return (
    <>
      <PersonListSection
        kind="resident"
        targetId={targetId}
        operationId={operationId}
        people={all.filter(a => a.relationship === "resident")}
        defaultAddress={targetAddress}
      />
      <PersonListSection
        kind="associate"
        targetId={targetId}
        operationId={operationId}
        people={all.filter(a => a.relationship !== "resident")}
        targetAddress={targetAddress}
      />
    </>
  );
}
