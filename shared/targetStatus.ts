// Person-target status fields — Motor Drivers Licence (MDL) and bail. Shared
// by the server zod schema's allowed values and every client surface that
// shows or edits them, so labels never drift apart.

export const MDL_STATUSES = ["active", "none", "suspended"] as const;
export type MdlStatus = (typeof MDL_STATUSES)[number];
export const MDL_LABELS: Record<MdlStatus, string> = {
  active: "Active",
  none: "None",
  suspended: "Suspended",
};

export const YES_NO = ["yes", "no"] as const;
export type YesNo = (typeof YES_NO)[number];
export const YES_NO_LABELS: Record<YesNo, string> = { yes: "Yes", no: "No" };

export function mdlLabel(value: string | null | undefined): string {
  return value && value in MDL_LABELS ? MDL_LABELS[value as MdlStatus] : "";
}

/** One-line bail summary for read-only display, or "" when never set. */
export function formatBail(t: {
  bailStatus?: string | null;
  bailConditions?: string | null;
  bailConditionsText?: string | null;
}): string {
  if (t.bailStatus === "no") return "No";
  if (t.bailStatus !== "yes") return "";
  if (t.bailConditions === "no") return "Yes — no conditions";
  if (t.bailConditions === "yes") {
    const text = t.bailConditionsText?.trim();
    return text ? `Yes — conditions: ${text}` : "Yes — conditions";
  }
  return "Yes";
}
