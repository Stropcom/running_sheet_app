/**
 * Builds the app's speed-zone lookup file from Main Roads Western Australia's
 * "Legal Speed Limits" GeoJSON (open data, Creative Commons Attribution 4.0).
 *
 *   pnpm tsx scripts/ops/build-speed-zones.ts <Legal_Speed_Limits.geojson> [out] [--bbox minLng,minLat,maxLng,maxLat]
 *
 * `out` defaults to data/speed-zones.bin (or $SPEED_ZONES_FILE). Reads the
 * source one line at a time (a road per line), so it needs little memory, and
 * writes the output only once everything has been read (to a temporary file,
 * then renamed, so a half-written file is never used). Prints what it kept and
 * what it left out. Safe to run again to refresh: the app notices the new file
 * within a minute, no restart needed.
 *
 * Getting the source file (no sign-in needed):
 *   curl -L -o Legal_Speed_Limits.geojson \
 *     "https://portal-mainroads.opendata.arcgis.com/api/download/v1/items/c30239d960df4eaf85890201068ea521/geojson?layers=8"
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { SPEED_ZONE_SOURCE, SpeedZoneBuilder } from "../../shared/speedZones";

async function main() {
  const args = process.argv.slice(2);
  const bboxAt = args.indexOf("--bbox");
  let bbox: [number, number, number, number] | undefined;
  if (bboxAt >= 0) {
    const nums = (args[bboxAt + 1] ?? "").split(",").map(Number);
    if (nums.length !== 4 || nums.some(n => !Number.isFinite(n)))
      throw new Error("--bbox needs minLng,minLat,maxLng,maxLat");
    bbox = nums as [number, number, number, number];
    args.splice(bboxAt, 2);
  }
  const [input, outArg] = args;
  if (!input) {
    console.error(
      "Usage: pnpm tsx scripts/ops/build-speed-zones.ts <Legal_Speed_Limits.geojson> [out] [--bbox minLng,minLat,maxLng,maxLat]"
    );
    process.exit(1);
  }
  const out = path.resolve(
    outArg ?? process.env.SPEED_ZONES_FILE ?? "data/speed-zones.bin"
  );

  const started = Date.now();
  const builder = new SpeedZoneBuilder({ bbox });
  const rl = readline.createInterface({
    input: fs.createReadStream(input, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) builder.addLine(line);
  const bytes = builder.finish();

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, out);

  const s = builder.stats;
  console.log(`Source: ${SPEED_ZONE_SOURCE}`);
  console.log(`Read ${s.linesRead.toLocaleString()} roads from ${input}`);
  console.log(
    `Kept ${s.roads.toLocaleString()} road pieces (${s.points.toLocaleString()} points):`
  );
  console.log(`  ${s.posted.toLocaleString()} with a posted limit`);
  console.log(
    `  ${s.defaultMetro.toLocaleString()} default (50 km/h, Metropolitan region)`
  );
  console.log(
    `  ${s.defaultUnknown.toLocaleString()} default elsewhere (50 or 110 — no number given)`
  );
  if (s.notUnderstood)
    console.log(
      `Left out ${s.notUnderstood.toLocaleString()} whose limit text was not understood`
    );
  if (s.outsideArea)
    console.log(
      `Left out ${s.outsideArea.toLocaleString()} outside the chosen area`
    );
  console.log(
    `Wrote ${out} (${(bytes.length / 1048576).toFixed(1)} MB) in ${((Date.now() - started) / 1000).toFixed(1)} s`
  );
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
