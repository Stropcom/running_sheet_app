// Which profile a chip in a profile's list opens.
//
// A person, vehicle or place named in a profile's lists opens that entity's
// own profile; a REGISTERED TARGET opens the Target profile, which is looked up
// by the target's id — never by name. (Looking a target up by its name as if it
// were an associate gives "not found": the associate profile deliberately
// leaves targets out.) One rule, used by the in-place drop-downs.

export type ProfileLinkKind =
  | "target"
  | "associate"
  | "vehicle"
  | "location"
  | "operation";

export interface ProfileLinkItem {
  id: string;
  label: string;
  type: string;
  /** Sent by the server for a target. */
  targetId?: number;
}

export function profileLinkFor(item: ProfileLinkItem): {
  kind: ProfileLinkKind;
  refId: number | string;
} {
  if (item.type === "target") {
    // The id the server sent, else the old "target::<id>" form.
    const targetId =
      item.targetId ??
      (item.id.startsWith("target::") ? Number(item.id.split("::")[1]) : 0);
    if (targetId > 0) return { kind: "target", refId: targetId };
  }
  if (item.type === "vehicle") return { kind: "vehicle", refId: item.label };
  if (item.type === "address" || item.type === "business")
    return { kind: "location", refId: item.label };
  return { kind: "associate", refId: item.label };
}
