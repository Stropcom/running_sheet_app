// Loads the app's own copy of Main Roads Western Australia's speed limits (see
// shared/speedZones.ts and scripts/ops/build-speed-zones.ts) the first time a
// lookup needs it. The file stays out of git (data/ is ignored) and is found at
// $SPEED_ZONES_FILE, else data/speed-zones.bin under the folder the app runs in
// (where uploads/ is). A refreshed file is picked up within a minute, no
// restart needed; a missing or damaged file just means "no data" — the Map page
// then says so and the officer picks the area by hand.
import fs from "node:fs";
import path from "node:path";
import { SpeedZoneIndex } from "@shared/speedZones";

const RECHECK_MS = 60_000;

let loaded: {
  index: SpeedZoneIndex;
  file: string;
  mtimeMs: number;
  size: number;
} | null = null;
let checkedAt = 0;
let lastError = "";

export function speedZoneFile(): string {
  return path.resolve(
    process.env.SPEED_ZONES_FILE ||
      path.join(process.cwd(), "data", "speed-zones.bin")
  );
}

/** The loaded index, or null when there is no (usable) file. */
export function getSpeedZones(now: number = Date.now()): SpeedZoneIndex | null {
  const file = speedZoneFile();
  const sameFile = loaded?.file === file;
  if (loaded && sameFile && now - checkedAt < RECHECK_MS) return loaded.index;
  checkedAt = now;
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    loaded = null;
    return null;
  }
  if (
    loaded &&
    sameFile &&
    loaded.mtimeMs === st.mtimeMs &&
    loaded.size === st.size
  )
    return loaded.index;
  try {
    const index = new SpeedZoneIndex(fs.readFileSync(file));
    loaded = { index, file, mtimeMs: st.mtimeMs, size: st.size };
    lastError = "";
    console.log(
      `[speed-zones] loaded ${index.roads.toLocaleString()} roads from ${file} (data of ${index.builtAt.toISOString().slice(0, 10)})`
    );
    return index;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== lastError)
      console.error(`[speed-zones] could not use ${file}: ${msg}`);
    lastError = msg;
    // Keep serving the last good copy if there is one.
    return sameFile && loaded ? loaded.index : null;
  }
}

/** For tests: forget what is loaded. */
export function resetSpeedZonesForTests(): void {
  loaded = null;
  checkedAt = 0;
  lastError = "";
}
