// Zero data: empties the operational data (operations, running sheets, photos,
// targets, intelligence, map, briefings, audit log …) and leaves people, teams,
// settings and the CTO Roster. The same table lists as
// scripts/ops/zero-data.mjs (scripts/ops/zero-data-tables.mjs is the one
// source). Owner only — enforced in the router (zeroData.*).

import fs from "node:fs/promises";
import path from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import {
  ALL_CLEAR_TABLES as CLEAR_TABLES,
  IGNORED_TABLES,
  ALL_KEEP_TABLES as KEEP_TABLES,
} from "../scripts/ops/zero-data-tables.mjs";
import { areaTotals } from "@shared/zeroDataAreas";
import { createAuditLog, withDedicatedConnection } from "./db";
import { invalidateFeatureCache } from "./commandFeatures";
import { invalidateAccessCache } from "./operationAccess";
import { invalidateDataEpoch } from "./dataEpoch";

let running = false;

const remoteStorage = () =>
  !!process.env.BUILT_IN_FORGE_API_URL && !!process.env.BUILT_IN_FORGE_API_KEY;

/** The folder this server keeps photos and documents in (server/storage.ts). */
const uploadsDir = () => path.join(process.cwd(), "uploads");

/** Files and bytes under `dir` (0/0 if it isn't there). */
async function folderSize(
  dir: string
): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return { files, bytes };
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = await folderSize(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (e.isFile()) {
      files++;
      bytes += (await fs.stat(full)).size;
    }
  }
  return { files, bytes };
}

/**
 * Deletes everything inside the uploads folder (the folder itself stays, so
 * the /local-uploads route keeps working). Only ever touches <cwd>/uploads,
 * and refuses if that is a link.
 */
async function checkUploadsFolder(): Promise<boolean> {
  try {
    const st = await fs.lstat(uploadsDir());
    if (!st.isDirectory() || st.isSymbolicLink()) {
      throw new Error(
        "Not cleared — the uploads folder isn't a plain folder, so it was left alone."
      );
    }
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

async function emptyUploads(): Promise<{ files: number; bytes: number }> {
  if (!(await checkUploadsFolder())) return { files: 0, bytes: 0 };
  const dir = uploadsDir();
  const size = await folderSize(dir);
  for (const name of await fs.readdir(dir)) {
    await fs.rm(path.join(dir, name), { recursive: true, force: true });
  }
  return size;
}

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
      // Photos and documents kept on this server's disk (deleted too), or
      // sitting in remote storage (which can't be deleted from here).
      remoteStorage: remoteStorage(),
      files: remoteStorage()
        ? { files: 0, bytes: 0 }
        : await folderSize(uploadsDir()),
    };
  });
}

export async function zeroData(by: { id: number; cin: string | null }) {
  if (running) throw new Error("A zero is already running.");
  running = true;
  try {
    // Refuse before anything is cleared, not after.
    if (!remoteStorage()) await checkUploadsFolder();
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

    // Photos and documents kept on this server's disk are deleted for good.
    // Remote storage (if configured) has no delete here — those files are
    // left, and nothing refers to them any more.
    let filesNote = "";
    if (remoteStorage()) {
      filesNote =
        "Photos and documents in remote storage were not deleted (they are no longer referenced).";
    } else {
      const gone = await emptyUploads();
      filesNote = `${gone.files} stored file${gone.files === 1 ? "" : "s"} deleted.`;
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
