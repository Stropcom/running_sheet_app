// Zero data: empties the operational data (operations, running sheets, photos,
// targets, intelligence, map, briefings, audit log …) and leaves people, teams,
// settings and the CTO Roster. The same table lists as
// scripts/ops/zero-data.mjs (scripts/ops/zero-data-tables.mjs is the one
// source). Owner only — enforced in the router (zeroData.*).

import fs from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import {
  CLEAR_TABLES,
  IGNORED_TABLES,
  KEEP_TABLES,
} from "../scripts/ops/zero-data-tables.mjs";
import { areaTotals } from "@shared/zeroDataAreas";
import { createAuditLog, withDedicatedConnection } from "./db";
import { invalidateFeatureCache } from "./commandFeatures";
import { invalidateAccessCache } from "./operationAccess";
import { invalidateDataEpoch } from "./dataEpoch";

let running = false;

async function tablesInDb(
  conn: Parameters<Parameters<typeof withDedicatedConnection>[0]>[0]
) {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'"
  );
  return rows.map(r => String(r.t)).filter(t => !IGNORED_TABLES.includes(t));
}

/** Tables in the database that neither list knows about (should be none). */
function unclassified(inDb: string[]) {
  const known = new Set([...KEEP_TABLES, ...CLEAR_TABLES]);
  return inDb.filter(t => !known.has(t));
}

export async function zeroDataPreview() {
  return withDedicatedConnection(async conn => {
    const inDb = await tablesInDb(conn);
    const counts: Record<string, number> = {};
    for (const t of CLEAR_TABLES.filter(t => inDb.includes(t))) {
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM \`${t}\``
      );
      counts[t] = Number(rows[0].n);
    }
    const areas = areaTotals(counts);
    return {
      areas,
      total: areas.reduce((n, a) => n + a.rows, 0),
      unclassified: unclassified(inDb),
    };
  });
}

export async function zeroData(by: { id: number; cin: string | null }) {
  if (running) throw new Error("A zero is already running.");
  running = true;
  try {
    const { cleared, remaining } = await withDedicatedConnection(async conn => {
      const inDb = await tablesInDb(conn);
      const odd = unclassified(inDb);
      if (odd.length) {
        throw new Error(
          `Not cleared — these tables aren't classified in zero-data-tables.mjs: ${odd.join(", ")}`
        );
      }
      const toClear = CLEAR_TABLES.filter(t => inDb.includes(t));
      let cleared = 0;
      await conn.query("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const t of toClear) {
          await conn.query(`TRUNCATE TABLE \`${t}\``);
          cleared++;
        }
      } finally {
        await conn.query("SET FOREIGN_KEY_CHECKS = 1");
      }
      let remaining = 0;
      for (const t of toClear) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS n FROM \`${t}\``
        );
        remaining += Number(rows[0].n);
      }
      return { cleared, remaining };
    });

    // Stored files on disk are moved aside, never deleted (remote storage is
    // left alone, nothing refers to it any more).
    let filesNote = "";
    const remote =
      !!process.env.BUILT_IN_FORGE_API_URL &&
      !!process.env.BUILT_IN_FORGE_API_KEY;
    if (!remote) {
      const uploads = path.join(process.cwd(), "uploads");
      try {
        await fs.access(uploads);
        const stamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        const moved = `${uploads}.pre-zero-${stamp}`;
        await fs.rename(uploads, moved);
        await fs.mkdir(uploads, { recursive: true });
        filesNote = ` Stored files moved to ${path.basename(moved)}.`;
      } catch {
        // no uploads folder: nothing to move
      }
    }

    invalidateFeatureCache();
    invalidateAccessCache();
    const at = Date.now();
    await createAuditLog({
      sheetId: 0,
      userId: by.id,
      userName: by.cin ?? "Unknown",
      userCIN: by.cin,
      action: "data_zeroed",
      details: `Data zeroed: ${cleared} tables cleared.${filesNote}`,
      createdAt: at,
    });
    invalidateDataEpoch();
    return { cleared, remaining, filesNote: filesNote.trim(), at };
  } finally {
    running = false;
  }
}
