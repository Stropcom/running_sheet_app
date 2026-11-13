// Part of the tactical marker library (client/src/lib/tacticalMarkers.ts).

export type TacticalGroup =
  | "target_associates"
  | "tactical"
  | "vehicles"
  | "facilities"
  | "personnel";

export interface TacticalIcon {
  key: string;
  label: string;
  src: string;
  group: TacticalGroup;
}
