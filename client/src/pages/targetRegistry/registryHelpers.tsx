// Part of the Target Registry page (client/src/pages/TargetRegistry.tsx): small helpers and labels the registry cards share.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { Car, User, MapPin } from "lucide-react";
import type { TargetType } from "@shared/types";
import { type FormTone } from "@/lib/formKit";
import type { PersonKind } from "./types";

/** The Target Registry card icon per targetType — reuses the exact same
 * User/Car/MapPin icons the Intelligence folder already uses for its own
 * person/vehicle/address entity groupings, so a Vehicle/Location target
 * reads consistently between the two screens. */
export function targetTypeIcon(targetType: TargetType) {
  if (targetType === "vehicle")
    return <Car className="w-5 h-5 text-rose-400" />;
  if (targetType === "location")
    return <MapPin className="w-5 h-5 text-rose-400" />;
  return <User className="w-5 h-5 text-rose-400" />;
}

// Initial lock state for a set of extra address/vehicle entries — "locked"
// (needs an explicit Edit/Add-new choice) when the entry already has a
// composed value, "edit" (freely editable, nothing to preserve) otherwise.
export function computeExtraModes<T extends { id: string; full: string }>(
  entries: T[]
): Record<string, "locked" | "edit" | "new"> {
  const modes: Record<string, "locked" | "edit" | "new"> = {};
  for (const e of entries) modes[e.id] = e.full ? "locked" : "edit";
  return modes;
}

export function EditVsNewNote({ kind }: { kind: "address" | "vehicle" }) {
  return (
    <p className="text-[11px] text-muted-foreground mt-1.5">
      Edit if there's a mistake in the current {kind}. Add new if the Target has{" "}
      {kind === "address" ? "moved addresses" : "changed vehicles"}.
    </p>
  );
}
export const PERSON_KIND_LABEL: Record<PersonKind, string> = {
  associate: "Associate",
  resident: "Resident",
};

export const PERSON_SECTION_STYLE: Record<
  PersonKind,
  { tone: FormTone; title: string; add: string }
> = {
  associate: {
    tone: "associate",
    title: "Associates",
    add: "Add Associate",
  },
  // Amber is already the Vehicle colour on the target card, so residents
  // use rose — distinct from violet (associates), sky (name), emerald
  // (address) and amber (vehicle).
  resident: {
    tone: "resident",
    title: "Other Home Address Residents",
    add: "Add Resident",
  },
};
