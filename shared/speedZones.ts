// Posted speed limits from Main Roads Western Australia's "Legal Speed Limits"
// open data (Creative Commons Attribution 4.0), held by the app itself so a
// tap on the map can be answered without any outside call: deterministic, the
// same answer every time, nothing about where a target was last seen leaves
// the server.
//
// Two halves, both pure (no file or network access here):
//   SpeedZoneBuilder  reads the GeoJSON, one road per line, into a compact
//                     binary file (about a fifth of the size of the source);
//   SpeedZoneIndex    loads that file into typed arrays plus a grid, and finds
//                     the nearest road to a point.
//
// What the source says, and what is done with it (checked against real lines
// from the owner's download):
//   "SPEED_LIMIT":"60km/h"                     a posted limit — used as is.
//   "SPEED_LIMIT":"50km/h applies in built up areas or 110km/h outside built
//    up areas"                                  the legal default, no sign. In
//     the Metropolitan region that means 50; elsewhere it can be 50 (a town) or
//     110 (the bush) and the file cannot say which — so no number is given.
// School-zone and other time-limited speeds are a separate download and are
// not used: a tap at any hour gets the road's normal limit.
//
// The binary layout (little-endian, every section 4-byte aligned):
//   header   8 x uint32: magic, version, roads, points, nameBytes, builtAt (s)
//   starts   (roads + 1) x uint32      index of each road's first point
//   meta     roads x (kph, kind) uint8 (padded to 4)
//   nameOff  (roads + 1) x uint32      offsets into the name bytes
//   coords   points x (lng, lat) int32 degrees x 100,000 (about 1.1 m)
//   names    UTF-8 bytes

export type ZoneKind = "posted" | "default" | "unknown-default";

export interface ParsedLimit {
  kph: number | null;
  kind: ZoneKind;
}

const POSTED_RE = /^\s*(\d{1,3})\s*km\/h\s*$/i;
const DEFAULT_RE =
  /^\s*(\d{2,3})\s*km\/h applies in built[- ]up areas or (\d{2,3})\s*km\/h outside built[- ]up areas\s*$/i;

/** What a road's SPEED_LIMIT text means, or null when it is not understood
 * (the road is then left out rather than guessed). */
export function parseSpeedLimitText(
  text: string | null | undefined,
  region: string | null | undefined
): ParsedLimit | null {
  if (!text) return null;
  const posted = POSTED_RE.exec(text);
  if (posted) return { kph: Number(posted[1]), kind: "posted" };
  const def = DEFAULT_RE.exec(text);
  if (def) {
    // Inside the Metropolitan region the default is the built-up one.
    return /metropolitan/i.test(region ?? "")
      ? { kph: Number(def[1]), kind: "default" }
      : { kph: null, kind: "unknown-default" };
  }
  return null;
}

const KIND_CODE: Record<ZoneKind, number> = {
  posted: 0,
  default: 1,
  "unknown-default": 2,
};
const KIND_OF = ["posted", "default", "unknown-default"] as const;

const MAGIC = 0x5a445053; // "SPDZ"
const VERSION = 1;
const SCALE = 100_000;
const HEADER_BYTES = 32;

export const SPEED_ZONE_SOURCE =
  "Main Roads Western Australia, Legal Speed Limits (Creative Commons Attribution 4.0)";

export interface BuildStats {
  linesRead: number;
  roads: number;
  points: number;
  /** Roads left out because their limit text was not understood. */
  notUnderstood: number;
  /** Roads left out because they are outside the chosen area. */
  outsideArea: number;
  posted: number;
  defaultMetro: number;
  defaultUnknown: number;
}

export interface BuildOptions {
  /** [minLng, minLat, maxLng, maxLat] — keep only roads with a point inside. */
  bbox?: [number, number, number, number];
  builtAt?: Date;
}

/** Reads the GeoJSON one line at a time (each road is on its own line). */
export class SpeedZoneBuilder {
  private starts: number[] = [0];
  private meta: number[] = [];
  private nameOff: number[] = [0];
  private names: Uint8Array[] = [];
  private nameBytes = 0;
  private coords: number[] = [];
  readonly stats: BuildStats = {
    linesRead: 0,
    roads: 0,
    points: 0,
    notUnderstood: 0,
    outsideArea: 0,
    posted: 0,
    defaultMetro: 0,
    defaultUnknown: 0,
  };
  private enc = new TextEncoder();

  constructor(private opts: BuildOptions = {}) {}

  addLine(raw: string): void {
    const line = raw.trim().replace(/,$/, "");
    if (!line.startsWith('{"type":"Feature"')) return;
    this.stats.linesRead++;
    let f: {
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    };
    try {
      f = JSON.parse(line);
    } catch {
      this.stats.notUnderstood++;
      return;
    }
    const p = f.properties ?? {};
    const parsed = parseSpeedLimitText(
      typeof p.SPEED_LIMIT === "string" ? p.SPEED_LIMIT : null,
      typeof p.RA_NAME === "string" ? p.RA_NAME : null
    );
    if (!parsed) {
      this.stats.notUnderstood++;
      return;
    }
    const g = f.geometry;
    const lines: number[][][] =
      g?.type === "LineString"
        ? [g.coordinates as number[][]]
        : g?.type === "MultiLineString"
          ? (g.coordinates as number[][][])
          : [];
    const name = String(p.COMMON_USAGE_NAME ?? p.ROAD_NAME ?? "").trim();
    for (const pts of lines) {
      if (!Array.isArray(pts) || pts.length < 2) continue;
      if (this.opts.bbox) {
        const [x0, y0, x1, y1] = this.opts.bbox;
        if (
          !pts.some(c => c[0] >= x0 && c[0] <= x1 && c[1] >= y0 && c[1] <= y1)
        ) {
          this.stats.outsideArea++;
          continue;
        }
      }
      for (const c of pts) {
        this.coords.push(Math.round(c[0] * SCALE), Math.round(c[1] * SCALE));
      }
      this.starts.push(this.starts[this.starts.length - 1] + pts.length);
      this.meta.push(
        parsed.kph === null ? 0 : Math.min(255, parsed.kph),
        KIND_CODE[parsed.kind]
      );
      const nb = this.enc.encode(name);
      this.names.push(nb);
      this.nameBytes += nb.length;
      this.nameOff.push(this.nameBytes);
      this.stats.roads++;
      this.stats.points += pts.length;
      if (parsed.kind === "posted") this.stats.posted++;
      else if (parsed.kind === "default") this.stats.defaultMetro++;
      else this.stats.defaultUnknown++;
    }
  }

  finish(): Uint8Array {
    const roads = this.stats.roads;
    const points = this.stats.points;
    const pad4 = (n: number) => (n + 3) & ~3;
    const startsBytes = (roads + 1) * 4;
    const metaBytes = pad4(roads * 2);
    const nameOffBytes = (roads + 1) * 4;
    const coordBytes = points * 8;
    const total =
      HEADER_BYTES +
      startsBytes +
      metaBytes +
      nameOffBytes +
      coordBytes +
      pad4(this.nameBytes);
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    const builtAt = Math.floor(
      (this.opts.builtAt ?? new Date()).getTime() / 1000
    );
    [MAGIC, VERSION, roads, points, this.nameBytes, builtAt, 0, 0].forEach(
      (v, i) => dv.setUint32(i * 4, v, true)
    );
    let o = HEADER_BYTES;
    for (const v of this.starts) {
      dv.setUint32(o, v, true);
      o += 4;
    }
    out.set(this.meta, o);
    o += metaBytes;
    for (const v of this.nameOff) {
      dv.setUint32(o, v, true);
      o += 4;
    }
    for (const v of this.coords) {
      dv.setInt32(o, v, true);
      o += 4;
    }
    for (const nb of this.names) {
      out.set(nb, o);
      o += nb.length;
    }
    return out;
  }
}

export interface NearestRoad {
  name: string;
  kph: number | null;
  kind: ZoneKind;
  /** Metres from the point to the road. */
  distM: number;
}

/** How far from the tapped point a road may be and still count as "the road". */
export const SNAP_METRES = 40;
/** About 1.1 km. */
const CELL = 1000; // in coordinate units (1e-5 degree)
const M_PER_UNIT = 1.11; // metres per 1e-5 degree of latitude

export class SpeedZoneIndex {
  readonly roads: number;
  readonly points: number;
  readonly builtAt: Date;
  private starts: Uint32Array;
  private meta: Uint8Array;
  private nameOff: Uint32Array;
  private coords: Int32Array;
  private names: Uint8Array;
  private minX = 0;
  private minY = 0;
  private nx = 0;
  private ny = 0;
  private cellStart!: Uint32Array;
  private cellSegs!: Int32Array;
  private dec = new TextDecoder();

  constructor(bytes: Uint8Array) {
    // A fresh, aligned buffer: typed-array views need 4-byte alignment.
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const buf = copy.buffer;
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== MAGIC || dv.getUint32(4, true) !== VERSION)
      throw new Error("Not a speed-zone file this version understands.");
    this.roads = dv.getUint32(8, true);
    this.points = dv.getUint32(12, true);
    const nameBytes = dv.getUint32(16, true);
    this.builtAt = new Date(dv.getUint32(20, true) * 1000);
    const pad4 = (n: number) => (n + 3) & ~3;
    let o = HEADER_BYTES;
    this.starts = new Uint32Array(buf, o, this.roads + 1);
    o += (this.roads + 1) * 4;
    this.meta = new Uint8Array(buf, o, this.roads * 2);
    o += pad4(this.roads * 2);
    this.nameOff = new Uint32Array(buf, o, this.roads + 1);
    o += (this.roads + 1) * 4;
    this.coords = new Int32Array(buf, o, this.points * 2);
    o += this.points * 8;
    this.names = new Uint8Array(buf, o, nameBytes);
    this.buildGrid();
  }

  /** Number of bytes held, roughly (for logging). */
  get approxBytes(): number {
    return (
      this.coords.byteLength +
      this.starts.byteLength +
      this.nameOff.byteLength +
      this.names.byteLength +
      this.cellStart.byteLength +
      this.cellSegs.byteLength
    );
  }

  private buildGrid(): void {
    const c = this.coords;
    if (this.points === 0) {
      this.cellStart = new Uint32Array(1);
      this.cellSegs = new Int32Array(0);
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < this.points; i++) {
      const x = c[i * 2],
        y = c[i * 2 + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    this.minX = minX;
    this.minY = minY;
    this.nx = Math.floor((maxX - minX) / CELL) + 1;
    this.ny = Math.floor((maxY - minY) / CELL) + 1;
    const cells = this.nx * this.ny;
    if (cells > 25_000_000)
      throw new Error("The speed-zone file covers too wide an area.");
    const counts = new Uint32Array(cells + 1);
    const eachSegment = (
      fn: (seg: number, c0: number, c1: number, r0: number, r1: number) => void
    ) => {
      for (let r = 0; r < this.roads; r++) {
        for (let i = this.starts[r]; i < this.starts[r + 1] - 1; i++) {
          const x1 = c[i * 2],
            y1 = c[i * 2 + 1],
            x2 = c[i * 2 + 2],
            y2 = c[i * 2 + 3];
          fn(
            i,
            Math.floor((Math.min(x1, x2) - minX) / CELL),
            Math.floor((Math.max(x1, x2) - minX) / CELL),
            Math.floor((Math.min(y1, y2) - minY) / CELL),
            Math.floor((Math.max(y1, y2) - minY) / CELL)
          );
        }
      }
    };
    eachSegment((_s, c0, c1, r0, r1) => {
      for (let gy = r0; gy <= r1; gy++)
        for (let gx = c0; gx <= c1; gx++) counts[gy * this.nx + gx + 1]++;
    });
    for (let i = 0; i < cells; i++) counts[i + 1] += counts[i];
    this.cellStart = counts;
    this.cellSegs = new Int32Array(counts[cells]);
    const fill = new Uint32Array(cells);
    eachSegment((s, c0, c1, r0, r1) => {
      for (let gy = r0; gy <= r1; gy++)
        for (let gx = c0; gx <= c1; gx++) {
          const cell = gy * this.nx + gx;
          this.cellSegs[this.cellStart[cell] + fill[cell]++] = s;
        }
    });
  }

  private roadOfPoint(pointIdx: number): number {
    let lo = 0,
      hi = this.roads - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= pointIdx) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The nearest road within `maxM` metres of the point, or null. */
  nearest(
    lat: number,
    lng: number,
    maxM: number = SNAP_METRES
  ): NearestRoad | null {
    if (this.points === 0) return null;
    const px = lng * SCALE,
      py = lat * SCALE;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const dy = maxM / M_PER_UNIT;
    const dx = dy / Math.max(0.05, cosLat);
    const gx0 = Math.max(0, Math.floor((px - dx - this.minX) / CELL));
    const gx1 = Math.min(this.nx - 1, Math.floor((px + dx - this.minX) / CELL));
    const gy0 = Math.max(0, Math.floor((py - dy - this.minY) / CELL));
    const gy1 = Math.min(this.ny - 1, Math.floor((py + dy - this.minY) / CELL));
    if (gx1 < 0 || gy1 < 0 || gx0 > this.nx - 1 || gy0 > this.ny - 1)
      return null;
    const c = this.coords;
    let bestSeg = -1;
    let best = Infinity;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const cell = gy * this.nx + gx;
        for (let k = this.cellStart[cell]; k < this.cellStart[cell + 1]; k++) {
          const s = this.cellSegs[k];
          // metres, flat-earth around the point
          const ax = (c[s * 2] - px) * cosLat * M_PER_UNIT;
          const ay = (c[s * 2 + 1] - py) * M_PER_UNIT;
          const bx = (c[s * 2 + 2] - px) * cosLat * M_PER_UNIT;
          const by = (c[s * 2 + 3] - py) * M_PER_UNIT;
          const vx = bx - ax,
            vy = by - ay;
          const len2 = vx * vx + vy * vy;
          let t = len2 === 0 ? 0 : -(ax * vx + ay * vy) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + t * vx,
            ey = ay + t * vy;
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d < best) {
            best = d;
            bestSeg = s;
          }
        }
      }
    }
    if (bestSeg < 0 || best > maxM) return null;
    const r = this.roadOfPoint(bestSeg);
    const kph = this.meta[r * 2];
    return {
      name: this.dec.decode(
        this.names.subarray(this.nameOff[r], this.nameOff[r + 1])
      ),
      kph: kph === 0 ? null : kph,
      kind: KIND_OF[this.meta[r * 2 + 1]] ?? "posted",
      distM: best,
    };
  }
}
