// The five Commands (regions). Operations belong to one Command; people have
// a home Command. Fixed list: no table, so a Command can't be created or
// renamed by accident, and the same codes are used everywhere they're stored.
export const COMMAND_CODES = [
  "WESTERN",
  "NORTHERN",
  "EASTERN",
  "SOUTHERN",
  "CENTRAL",
] as const;

export type CommandCode = (typeof COMMAND_CODES)[number];

/** Where existing operations and people land when the Commands are first
 * introduced. Nothing changes for anyone on day one. */
export const DEFAULT_COMMAND: CommandCode = "WESTERN";

export const COMMAND_LABELS: Record<CommandCode, string> = {
  WESTERN: "Western Command",
  NORTHERN: "Northern Command",
  EASTERN: "Eastern Command",
  SOUTHERN: "Southern Command",
  CENTRAL: "Central Command",
};

export const COMMAND_SHORT: Record<CommandCode, string> = {
  WESTERN: "Western",
  NORTHERN: "Northern",
  EASTERN: "Eastern",
  SOUTHERN: "Southern",
  CENTRAL: "Central",
};

export function isCommandCode(v: unknown): v is CommandCode {
  return (
    typeof v === "string" && (COMMAND_CODES as readonly string[]).includes(v)
  );
}
