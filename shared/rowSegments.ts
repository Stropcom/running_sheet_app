// A row's observation is often several sentences on separate lines — an
// arrival, then who walked in, then the vehicle leaving. The continuity logic
// reads each line as its own event, in order, so a later sentence in the same
// row can change what an earlier one set up (and so a draft that is still
// being typed can be read the same way).

export interface SegmentableRow {
  observation: string | null;
}

/** One entry per non-empty line of each row's observation, keeping every
 * other field of the row, in order. Rows with no observation are dropped. */
export function expandRowSegments<T extends SegmentableRow>(rows: T[]): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (!row.observation) continue;
    const lines = row.observation
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length <= 1) {
      out.push(row);
      continue;
    }
    for (const line of lines) out.push({ ...row, observation: line });
  }
  return out;
}
