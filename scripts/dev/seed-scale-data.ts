/**
 * Fills a THROWAWAY database with realistic fake data at a chosen scale, so
 * the app's speed can be measured with years of data (see scale-measure.ts and
 * docs/features/dev-and-ops.md). Nothing here is real: every name, address and
 * registration is made up, and the same options always give the same data.
 *
 * Usage (the database must already have its tables — run `drizzle-kit migrate`
 * first, with DATABASE_URL pointing at it):
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3307/runlog_scale \
 *   pnpm tsx scripts/dev/seed-scale-data.ts --years=1
 *
 * Options (defaults are the growth figures given for the app: 10 running
 * sheets a day on 5 days a week, ~30 rows each, 3 photos per sheet, 10 target
 * profiles a week with 5 photos each):
 *   --years=1            how many years of data to make
 *   --sheets-per-day=10
 *   --days-per-year=260  working days (5 a week)
 *   --rows-per-sheet=30
 *   --photos-per-sheet=3
 *   --profiles-per-week=10   new targets a week
 *   --photos-per-profile=5
 *   --days-per-operation=40  how long one operation keeps running
 *   --open-days=10       only sheets from the newest N working days are still
 *                        open (not closed, some rows unlocked); everything
 *                        older is closed with every row certified and locked,
 *                        as it is in real use
 *   --wipe               empty the data tables first
 *
 * Refuses to run unless the database name ends in "_scale".
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

// ── options ──────────────────────────────────────────────────────────────────
function opt(name: string, fallback: number): number {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? Number(a.split("=")[1]) : fallback;
}
const YEARS = opt("years", 1);
const SHEETS_PER_DAY = opt("sheets-per-day", 10);
const DAYS_PER_YEAR = opt("days-per-year", 260);
const ROWS_PER_SHEET = opt("rows-per-sheet", 30);
const PHOTOS_PER_SHEET = opt("photos-per-sheet", 3);
const PROFILES_PER_WEEK = opt("profiles-per-week", 10);
const PHOTOS_PER_PROFILE = opt("photos-per-profile", 5);
const DAYS_PER_OP = opt("days-per-operation", 40);
const OPEN_DAYS = opt("open-days", 10); // only the newest N working days are still open
const WIPE = process.argv.includes("--wipe");

// ── deterministic random numbers ─────────────────────────────────────────────
let seed = 20261022;
function rnd(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

// ── word pools ───────────────────────────────────────────────────────────────
const GIVEN =
  "James Mary John Patricia Robert Jennifer Michael Linda William Elizabeth David Barbara Richard Susan Joseph Jessica Thomas Sarah Daniel Karen Matthew Nancy Anthony Lisa Mark Betty Paul Dorothy Steven Sandra Andrew Ashley Kenneth Kimberly Joshua Donna Kevin Emily Brian Michelle George Carol Timothy Amanda Ronald Melissa Jason Deborah Edward Stephanie Jeffrey Rebecca Ryan Laura Jacob Sharon Gary Cynthia Nicholas Kathleen Eric Amy Jonathan Shirley Stephen Angela Larry Helen Justin Anna Scott Brenda Brandon Pamela Benjamin Nicole Samuel Samantha Frank Katherine Gregory Christine Raymond Debra Alexander Rachel Patrick Carolyn Jack Janet Dennis Maria Jerry Heather".split(
    " "
  );
const SURNAME =
  "SMITH JONES WILLIAMS BROWN TAYLOR DAVIES WILSON EVANS THOMAS ROBERTS JOHNSON LEWIS WALKER ROBINSON WOOD THOMPSON WHITE WATSON JACKSON WRIGHT GREEN HARRIS COOPER KING LEE MARTIN CLARKE JAMES MORGAN HUGHES EDWARDS HILL MOORE CLARK HARRISON SCOTT YOUNG MORRIS HALL WARD TURNER CARTER PHILLIPS MITCHELL PATEL ADAMS CAMPBELL ANDERSON ALLEN COOK BAILEY PARKER MILLER DAVIS MURPHY PRICE BELL BAKER GRIFFITHS KELLY SIMPSON MARSHALL COLLINS BENNETT FOX GRAY SHAW".split(
    " "
  );
const STREET =
  "George Hay Murray Wellington Adelaide Albany Canning Stirling Beaufort Oxford Scarborough Fitzgerald Roe Lord Newcastle Harborne Wanneroo Marmion Rockingham Cockburn Hampton Leach Mitchell Kwinana Karrinyup Walcott Lemnos Nicholson Cleaver Kooyong Brisbane Victoria Francis Charles Bagot Pier Marine Preston Forrest Cambridge Bourke Elder Hobart Kent Ord Seaview Salvado Waterloo Mends Hulme Olding Sewell Riverside Howe Leeds".split(
    " "
  );
const STYPE = [
  "Street",
  "Road",
  "Avenue",
  "Drive",
  "Way",
  "Court",
  "Terrace",
  "Parade",
  "Lane",
  "Highway",
];
const SUBURB =
  "PERTH NORTHBRIDGE FREMANTLE JOONDALUP MIDLAND ARMADALE ROCKINGHAM MANDURAH CANNINGTON BELMONT VICTORIA PARK SUBIACO CLAREMONT STIRLING OSBORNE PARK BALCATTA WANNEROO MORLEY BASSENDEAN CLARKSON KWINANA COOGEE SPEARWOOD BIBRA LAKE MYAREE BOOKAROO LEEDERVILLE WEMBLEY INNALOO SCARBOROUGH DIANELLA MAYLANDS BAYSWATER EAST FREMANTLE ASHFIELD BULL CREEK SOUTH PERTH".split(
    " "
  );
const PLACE = [
  "Hungry Jack's",
  "Bunnings",
  "Woolworths",
  "Coles",
  "Westpac Branch",
  "Caltex",
  "BP Service Station",
  "Dome Cafe",
  "Royal Hotel",
  "Anytime Fitness",
  "Kmart",
  "Officeworks",
  "Subway",
  "McDonald's",
  "Tavern",
  "Post Office",
  "Medical Centre",
  "Car Park",
  "Shopping Centre",
];
const COLOUR = [
  "white",
  "black",
  "silver",
  "grey",
  "blue",
  "red",
  "green",
  "gold",
];
const MAKE: [string, string[], string][] = [
  ["Toyota", ["Camry", "Corolla", "Hilux", "RAV4"], "sedan"],
  ["Holden", ["Commodore", "Cruze", "Colorado"], "sedan"],
  ["Ford", ["Falcon", "Ranger", "Focus"], "utility"],
  ["Mazda", ["3", "CX-5", "BT-50"], "hatchback"],
  ["Nissan", ["Navara", "X-Trail", "Pulsar"], "wagon"],
  ["Hyundai", ["i30", "Tucson", "Getz"], "hatchback"],
];
const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";
const usedRegos = new Set<string>();
function rego(): string {
  for (;;) {
    const r = `${int(1, 9)}${pick([...LETTERS])}${pick([...LETTERS])}${pick([...LETTERS])}${int(100, 999)}`;
    if (!usedRegos.has(r)) {
      usedRegos.add(r);
      return r;
    }
  }
}

// A fake street address pool, shared across operations (places are visited by
// many unrelated operations in real life, which is what makes the entity
// matching expensive).
const ADDR_POOL: { full: string; short: string; suburb: string }[] = [];
for (let i = 0; i < 6000; i++) {
  const no = int(1, 400);
  const street = `${pick(STREET)} ${pick(STYPE)}`;
  const suburb = pick(SUBURB);
  ADDR_POOL.push({
    full: `${no} ${street}, ${suburb} WA`,
    short: `${no} ${street}`,
    suburb,
  });
}
const addrFull = (a: { full: string; short: string }) =>
  `${a.full} (${a.short})`;

// ── bulk insert ──────────────────────────────────────────────────────────────
let conn: mysql.Connection;
async function bulk(table: string, cols: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 1500) {
    const chunk = rows.slice(i, i + 1500);
    await conn.query(
      `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(",")}) VALUES ?`,
      [chunk]
    );
  }
}
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sqlTime = (d: Date) =>
  `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/_scale$/.test(dbName)) {
    throw new Error(
      `Refusing to run: database "${dbName}" does not end in "_scale". This script fills a throwaway database with fake data.`
    );
  }
  conn = await mysql.createConnection({ uri: url, multipleStatements: true });
  await conn.query("SET unique_checks=0; SET foreign_key_checks=0;");
  if (WIPE) {
    for (const t of [
      "certifications",
      "row_members",
      "attachment_entity_links",
      "row_attachments",
      "sheet_rows",
      "running_sheets",
      "operation_target_links",
      "associates",
      "targets",
      "operations",
      "users",
    ])
      await conn.query(`TRUNCATE TABLE \`${t}\``);
  }
  const started = Date.now();

  // users (officers) — one shared password hash
  const hash = await bcrypt.hash("Scale-Test-1!", 4);
  const officers = Array.from({ length: 80 }, (_, i) => ({
    id: i + 1,
    cin: `S${String(i + 1).padStart(3, "0")}`,
    name: `${pick(GIVEN)} ${pick(SURNAME)}`,
  }));
  await bulk(
    "users",
    [
      "id",
      "name",
      "username",
      "passwordHash",
      "cin",
      "role",
      "mustChangePassword",
    ],
    officers.map(o => [
      o.id,
      o.name,
      `officer${o.id}`,
      hash,
      o.cin,
      o.id === 1 ? "admin" : "member",
      0,
    ])
  );

  // calendar: working days, starting YEARS ago
  const totalDays = YEARS * DAYS_PER_YEAR;
  const start = new Date();
  start.setDate(start.getDate() - Math.ceil((totalDays / 5) * 7));
  const dayDate = (d: number) => {
    const t = new Date(start);
    t.setDate(t.getDate() + Math.floor(d / 5) * 7 + (d % 5));
    return t;
  };

  // operations (SHEETS_PER_DAY run side by side), targets, associates
  const slots = SHEETS_PER_DAY;
  const opsPerSlot = Math.ceil(totalDays / DAYS_PER_OP);
  const targetsPerOp = Math.max(
    1,
    Math.round((PROFILES_PER_WEEK * (DAYS_PER_OP / 5)) / slots)
  );
  type Tgt = {
    id: number;
    given: string;
    surname: string;
    home: (typeof ADDR_POOL)[number];
    regos: { rego: string; text: string }[];
    cars: string[];
  };
  const opRows: unknown[][] = [];
  const tgtRows: unknown[][] = [];
  const assocRows: unknown[][] = [];
  const linkRows: unknown[][] = [];
  const ops: {
    id: number;
    targets: Tgt[];
    people: { given: string; surname: string }[];
    startDay: number;
  }[] = [];
  let opId = 0,
    tgtId = 0,
    asId = 0,
    linkId = 0;
  for (let w = 0; w < opsPerSlot; w++) {
    for (let k = 0; k < slots; k++) {
      opId++;
      const startDay = w * DAYS_PER_OP;
      opRows.push([
        opId,
        `Operation ${opId}`,
        1,
        "active",
        sqlTime(dayDate(startDay)),
        sqlTime(dayDate(startDay)),
      ]);
      const targets: Tgt[] = [];
      for (let t = 0; t < targetsPerOp; t++) {
        tgtId++;
        const given = pick(GIVEN),
          surname = pick(SURNAME);
        const home = pick(ADDR_POOL);
        const cars = [0, 1].map(() => {
          const [make, models, body] = pick(MAKE);
          const r = rego();
          const c = pick(COLOUR);
          return {
            rego: r,
            text: `a ${c} ${make} ${pick(models)} ${body}, bearing WA registration ${r} (Vehicle ${r})`,
          };
        });
        targets.push({
          id: tgtId,
          given,
          surname,
          home,
          regos: cars,
          cars: [],
        });
        const name = `${given} ${surname}`;
        tgtRows.push([
          tgtId,
          name,
          1,
          given,
          surname,
          `${home.full} (${home.short})`,
          home.short,
          sqlTime(dayDate(startDay)),
          sqlTime(dayDate(startDay)),
        ]);
        linkRows.push([++linkId, opId, tgtId]);
        for (let a = 0; a < 2; a++) {
          asId++;
          const ag = pick(GIVEN),
            as = pick(SURNAME);
          assocRows.push([
            asId,
            tgtId,
            ag,
            as,
            `${ag} ${as}`,
            1,
            a === 0 ? "associate" : "resident",
            sqlTime(dayDate(startDay)),
            sqlTime(dayDate(startDay)),
          ]);
        }
      }
      const people = Array.from({ length: 30 }, () => ({
        given: pick(GIVEN),
        surname: pick(SURNAME),
      }));
      ops.push({ id: opId, targets, people, startDay });
    }
  }
  await bulk(
    "operations",
    ["id", "name", "createdBy", "status", "createdAt", "updatedAt"],
    opRows
  );
  await bulk(
    "targets",
    [
      "id",
      "name",
      "createdBy",
      "firstNames",
      "surname",
      "hbf",
      "hb",
      "createdAt",
      "updatedAt",
    ],
    tgtRows
  );
  await bulk(
    "associates",
    [
      "id",
      "targetId",
      "firstNames",
      "surname",
      "name",
      "createdBy",
      "relationship",
      "createdAt",
      "updatedAt",
    ],
    assocRows
  );
  await bulk(
    "operation_target_links",
    ["id", "operationId", "targetId"],
    linkRows
  );
  console.log(`operations ${opId}, targets ${tgtId}, associates ${asId}`);

  // sheets, rows, members, certifications, attachments, links
  let sheetId = 0,
    rowId = 0,
    memId = 0,
    certId = 0,
    attId = 0,
    elId = 0;
  let sheetRows: unknown[][] = [],
    rowRows: unknown[][] = [],
    memRows: unknown[][] = [],
    certRows: unknown[][] = [],
    attRows: unknown[][] = [],
    elRows: unknown[][] = [];
  const flush = async () => {
    await bulk(
      "running_sheets",
      [
        "id",
        "operationId",
        "title",
        "sheetDate",
        "targetName",
        "targetId",
        "sheetCins",
        "createdBy",
        "createdAt",
        "updatedAt",
        "closedAt",
        "closedByCIN",
      ],
      sheetRows
    );
    await bulk(
      "sheet_rows",
      [
        "id",
        "sheetId",
        "rowNumber",
        "time",
        "timeMinutes",
        "rowDate",
        "observation",
        "isLocked",
        "createdAt",
        "updatedAt",
      ],
      rowRows
    );
    await bulk(
      "row_members",
      ["id", "rowId", "memberName", "sortOrder"],
      memRows
    );
    await bulk(
      "certifications",
      [
        "id",
        "rowId",
        "memberId",
        "certifiedByUserId",
        "certifiedByName",
        "certifiedByCIN",
        "certifiedAt",
        "isActive",
      ],
      certRows
    );
    await bulk(
      "row_attachments",
      [
        "id",
        "rowId",
        "operationId",
        "isManualUpload",
        "key",
        "url",
        "mimeType",
        "uploadedBy",
        "uploadedByCIN",
        "faceCount",
        "createdAt",
      ],
      attRows
    );
    await bulk(
      "attachment_entity_links",
      [
        "id",
        "attachmentId",
        "category",
        "targetId",
        "entityKey",
        "entityLabel",
        "fromRegistry",
      ],
      elRows
    );
    sheetRows = [];
    rowRows = [];
    memRows = [];
    certRows = [];
    attRows = [];
    elRows = [];
  };
  const photoRowIdx = new Set(
    Array.from({ length: PHOTOS_PER_SHEET }, (_, i) =>
      Math.floor(((i + 1) * ROWS_PER_SHEET) / (PHOTOS_PER_SHEET + 1))
    )
  );
  const hex = () =>
    Math.floor(rnd() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");

  for (let d = 0; d < totalDays; d++) {
    const date = dayDate(d);
    const opWave = Math.floor(d / DAYS_PER_OP);
    for (let k = 0; k < slots; k++) {
      const op = ops[opWave * slots + k];
      const tgt = op.targets[(d + k) % op.targets.length];
      sheetId++;
      const isOpen = totalDays - d <= OPEN_DAYS;
      const team = Array.from({ length: 4 }, () => pick(officers));
      const title = `${ymd(date).replace(/-/g, "")} - ${tgt.surname}`;
      sheetRows.push([
        sheetId,
        op.id,
        title,
        ymd(date),
        `${tgt.given} ${tgt.surname}`,
        tgt.id,
        JSON.stringify(
          team.map((o, i) => ({
            cin: o.cin,
            hasImages: i === 0,
            isAuthor: i === 0,
          }))
        ),
        team[0].id,
        sqlTime(date),
        sqlTime(date),
        isOpen ? null : date.getTime() + 10 * 3600_000,
        isOpen ? null : team[0].cin,
      ]);
      let minutes = 6 * 60 + int(0, 90);
      let vehicle = tgt.regos[0];
      for (let r = 0; r < ROWS_PER_SHEET; r++) {
        rowId++;
        const incidental = pick(ADDR_POOL);
        const place = `${pick(PLACE)}`;
        const who = pick(op.people);
        let obs: string;
        if (r === 0) obs = `Surveillance commenced at ${addrFull(tgt.home)}.`;
        else if (r === ROWS_PER_SHEET - 1) obs = "Surveillance ceased.";
        else {
          const t = rnd();
          if (t < 0.18) {
            vehicle = pick(tgt.regos);
            obs = `${tgt.surname} entered ${vehicle.text}, and departed ${addrFull(tgt.home)} and continued via:`;
          } else if (t < 0.38)
            obs = `Vehicle ${vehicle.rego}, ${tgt.surname} driver, arrived at ${place}, ${addrFull(incidental)}.`;
          else if (t < 0.55)
            obs = `${tgt.surname} met with ${who.given} ${who.surname} (${who.surname}) outside ${incidental.short}.`;
          else if (t < 0.7)
            obs = `${tgt.surname} exited ${incidental.short} and walked to ${pick(ADDR_POOL).short}.`;
          else if (t < 0.85)
            obs = `${tgt.surname} entered ${place}, ${addrFull(incidental)}, and continued out of sight.`;
          else
            obs = `Vehicle ${vehicle.rego}, unseen occupant/s, departed ${incidental.short} and continued via:`;
        }
        minutes += int(8, 35);
        const hh = pad(Math.floor(minutes / 60) % 24),
          mm = pad(minutes % 60);
        const locked = isOpen ? (rnd() < 0.7 ? 1 : 0) : 1;
        rowRows.push([
          rowId,
          sheetId,
          r + 1,
          `${hh}:${mm}`,
          minutes % (24 * 60),
          ymd(date),
          obs,
          locked,
          sqlTime(date),
          sqlTime(date),
        ]);
        const members = Array.from(
          new Set(Array.from({ length: int(1, 3) }, () => pick(team)))
        );
        members.forEach((o, mi) => {
          memId++;
          memRows.push([memId, rowId, o.cin, mi]);
          if (locked)
            certRows.push([
              ++certId,
              rowId,
              memId,
              o.id,
              o.name,
              o.cin,
              date.getTime() + 3600_000,
              1,
            ]);
        });
        if (photoRowIdx.has(r)) {
          attId++;
          const face = rnd() < 0.3 ? 1 : 0;
          const key = `row-attachments/sheet-${sheetId}/row-${rowId}/${date.getTime()}_${hex()}.jpeg`;
          attRows.push([
            attId,
            rowId,
            op.id,
            0,
            key,
            `/local-uploads/${key}`,
            "image/jpeg",
            members[0].id,
            members[0].cin,
            face,
            sqlTime(date),
          ]);
          elRows.push([
            ++elId,
            attId,
            "member",
            null,
            members[0].cin.toLowerCase(),
            members[0].cin,
            0,
          ]);
          if (rnd() < 0.6)
            elRows.push([
              ++elId,
              attId,
              "location",
              null,
              incidental.short.toLowerCase(),
              incidental.short,
              0,
            ]);
          if (face)
            elRows.push([
              ++elId,
              attId,
              "target",
              tgt.id,
              null,
              `${tgt.given} ${tgt.surname}`,
              0,
            ]);
        }
      }
      if (sheetRows.length >= 150) await flush();
    }
    if (d % 20 === 0)
      process.stdout.write(
        `\rday ${d}/${totalDays}  sheets ${sheetId}  rows ${rowId}   `
      );
  }
  await flush();

  // profile photos: PHOTOS_PER_PROFILE per target, linked to the target
  for (const op of ops) {
    for (const t of op.targets) {
      for (let p = 0; p < PHOTOS_PER_PROFILE; p++) {
        attId++;
        const key = `manual-uploads/target-${t.id}/${hex()}.jpeg`;
        attRows.push([
          attId,
          null,
          op.id,
          1,
          key,
          `/local-uploads/${key}`,
          "image/jpeg",
          1,
          "S001",
          1,
          sqlTime(dayDate(op.startDay)),
        ]);
        elRows.push([
          ++elId,
          attId,
          "target",
          t.id,
          null,
          `${t.given} ${t.surname}`,
          p === 0 ? 1 : 0,
        ]);
      }
    }
    if (attRows.length > 3000) await flush();
  }
  await flush();
  console.log(
    `\nDone in ${((Date.now() - started) / 1000).toFixed(0)}s — sheets ${sheetId}, rows ${rowId}, members ${memId}, photos ${attId}, links ${elId}`
  );
  await conn.end();
}
main().catch(e => {
  console.error(e);
  process.exit(1);
});
