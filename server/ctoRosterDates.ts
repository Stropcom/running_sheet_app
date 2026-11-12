// Part of the CTO roster (server/ctoRoster.ts): date arithmetic on "YYYY-MM-DD" strings for
// the Repeat Cycle feature. Plain calendar arithmetic in UTC with no time-zone conversion, so
// the results are the same calendar dates anywhere. Moved out of ctoRoster.ts unchanged; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

export function addDaysToDateStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function daysBetweenDateStrs(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db_ = Date.UTC(by, bm - 1, bd);
  return Math.round((db_ - da) / 86_400_000);
}
