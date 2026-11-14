// The identity of an EA compliance finding, so a dismissal can be remembered:
// the same rule, the same person and the same dates are the same finding. If the
// roster changes so a finding names other dates it is a new finding and shows
// again — a dismissal never hides something it did not see.
export interface FindingIdentity {
  ruleKey: string;
  memberId: number;
  dates: string[];
}

/** The finding's dates, sorted and joined: the stored part of its identity. */
export function datesKeyOf(dates: string[]): string {
  return [...dates].sort().join(",");
}

/** One string for a finding's identity (for sets and maps). */
export function findingKey(f: FindingIdentity): string {
  return `${f.ruleKey}|${f.memberId}|${datesKeyOf(f.dates)}`;
}
