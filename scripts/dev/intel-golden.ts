/**
 * The Intelligence "golden" check: a small, made-up, fully deterministic
 * database is loaded, the Intelligence entity set is built from it by the real
 * code (getAllIntelligenceEntities — the same path the app uses), and the
 * result is compared field by field with the reference answer saved in
 * scripts/dev/golden/intelligence-entities.json.
 *
 * Why it exists: the Intelligence builder (server/db/reports.ts) is the legal
 * heart of the app and is being split into smaller files a piece at a time
 * (docs/features/dev-and-ops.md, "Big-file plan", phase 4). A move must not
 * change a single result, and a rule change must change exactly what it was
 * meant to. This is the check that says so, against a real database, the way
 * the unit tests cannot.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3306/runlog_golden \
 *   pnpm tsx scripts/dev/intel-golden.ts check      # load, build, compare (CI)
 *   … intel-golden.ts update                        # load, build, save the new answer
 *
 * The database must already have its tables (`pnpm exec drizzle-kit migrate`).
 * It EMPTIES the data tables it uses, so it refuses to run unless the database
 * name ends in "_golden". Nothing here is real: every name, address and
 * registration is made up.
 *
 * When a check fails on purpose-built change (a new rule), read the listed
 * differences, and only if they are exactly the intended ones run `update` and
 * commit the new reference file in the same change.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  canonicalizeEntities,
  compareEntityLists,
} from "../../server/intelCompare";

const GOLDEN = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "golden",
  "intelligence-entities.json"
);

// ── the made-up data ─────────────────────────────────────────────────────────
// Each row of observation text is chosen to hit one rule of the builder; the
// comment says which. Change a row here and the reference answer must be
// updated with it.
const OPERATIONS = [
  { id: 1, name: "OP GOLDEN ONE" },
  { id: 2, name: "OP GOLDEN TWO" },
];

const TARGETS = [
  {
    id: 1,
    name: "Lawrence SANTOS",
    firstNames: "Lawrence",
    surname: "SANTOS",
    tgt: "SANTOS",
    hbf: "19 Jacaranda Drive, ATTADALE WA",
    hb: "19 Jacaranda Drive",
    v1f: "grey Toyota Camry sedan, bearing WA registration 1EMB303",
    v1: "1EMB303 grey Toyota Camry sedan",
    linkedAssociateId: null,
  },
  {
    // Shares a surname with target 1: a bare "SANTOS" must not be credited to
    // both (err towards missing a mention, never inventing one).
    id: 2,
    name: "Maria SANTOS",
    firstNames: "Maria",
    surname: "SANTOS",
    tgt: "M SANTOS",
    hbf: "4 Hay Street, PERTH WA",
    hb: "4 Hay Street",
    v1f: null,
    v1: null,
    linkedAssociateId: null,
  },
  {
    // The same real person as associate 1 (an identity link).
    id: 3,
    name: "Peter AMBERLINE",
    firstNames: "Peter",
    surname: "AMBERLINE",
    tgt: "AMBERLINE",
    hbf: null,
    hb: null,
    v1f: null,
    v1: null,
    linkedAssociateId: 1,
  },
];

const ASSOCIATES = [
  {
    id: 1,
    targetId: 1,
    name: "Peter AMBERLINE",
    firstNames: "Peter",
    surname: "AMBERLINE",
    tgt: "AMBERLINE",
    linkedTargetId: 3,
  },
  {
    id: 2,
    targetId: 1,
    name: "John PARK",
    firstNames: "John",
    surname: "PARK",
    tgt: "PARK",
    linkedTargetId: null,
  },
  {
    // A second PARK: "park" in the car park is an ordinary word.
    id: 3,
    targetId: 2,
    name: "Susan PARK",
    firstNames: "Susan",
    surname: "PARK",
    tgt: "S PARK",
    linkedTargetId: null,
  },
];

// operation_target_links: a target is linked to every operation it appears in.
const LINKS = [
  { operationId: 1, targetId: 1 },
  { operationId: 2, targetId: 1 },
  { operationId: 1, targetId: 2 },
  { operationId: 2, targetId: 3 },
];

// A confirmed merge: 1OLD111 was merged into 1NEW222.
const ALIASES = [
  {
    type: "vehicle",
    loserKey: "1old111",
    loserLabel: "white Holden (Vehicle 1OLD111)",
    winnerKey: "1new222",
    winnerLabel: "white Holden (Vehicle 1NEW222)",
  },
];

const SHEETS = [
  {
    id: 1,
    operationId: 1,
    title: "20261005 - SANTOS",
    date: "2026-10-05",
    targetId: 1,
  },
  {
    id: 2,
    operationId: 1,
    title: "20261006 - M SANTOS",
    date: "2026-10-06",
    targetId: 2,
  },
  {
    id: 3,
    operationId: 2,
    title: "20261007 - SANTOS",
    date: "2026-10-07",
    targetId: 1,
  },
  {
    id: 4,
    operationId: 2,
    title: "20261008 - No target",
    date: "2026-10-08",
    targetId: null,
  },
];

const ROWS: Array<[sheetId: number, text: string]> = [
  // Sheet 1 — operation one, target 1
  [
    1,
    "Surveillance commenced in the vicinity of 19 Jacaranda Drive, ATTADALE.",
  ],
  // bracket introduction of a registered person
  [1, "Observed Lawrence SANTOS (SANTOS) walking to 12 Smith Street, Perth."],
  // registered plate and registered home address in plain text
  [
    1,
    "Vehicle 1EMB303, SANTOS driving, departed 19 Jacaranda Drive and continued via:",
  ],
  // unregistered vehicle, a business with its street address, an unknown person
  [
    1,
    "A grey sedan (Vehicle 1ZZZ111) parked outside The Reveley, 1 Barrack Street, PERTH WA (The Reveley). A male (UNKNOWN MALE 1) exited.",
  ],
  // a measurement is not a registration
  [
    1,
    "SANTOS carried a box approx 30cm x 30cm x 30cm into 7 Ocean Drive, SCARBOROUGH WA (7 Ocean Drive).",
  ],
  // two registered associates met
  [1, "John PARK (PARK) met with Peter AMBERLINE (AMBERLINE) at the car park."],
  // the two ends of a confirmed vehicle merge
  [1, "A white Holden (Vehicle 1OLD111) arrived."],
  [1, "A white Holden (Vehicle 1NEW222) departed."],
  // Sheet 2 — operation one, target 2 (shares the surname SANTOS)
  [2, "Maria SANTOS (M SANTOS) entered 4 Hay Street, PERTH WA."],
  // a lower-case surname is never matched to a registered surname
  [2, "santos was seen at the cafe."],
  [
    2,
    "Susan PARK (S PARK) and a male, Daniel REID (REID), in a silver Mazda (Vehicle 1MAZ777).",
  ],
  // "park" and "parked" are ordinary words
  [2, "The park was quiet and the grey car was parked in the car park."],
  [2, "Vehicle 1EMB303 was seen again at 19 Jacaranda Drive."],
  // Sheet 3 — operation two, target 1 (same vehicle and place as operation one)
  [
    3,
    "Observed Lawrence SANTOS (SANTOS) leave 19 Jacaranda Drive, ATTADALE in Vehicle 1EMB303.",
  ],
  [
    3,
    "A grey Toyota (Vehicle 1EMB303) travelled to The Reveley, 1 Barrack Street, PERTH WA (The Reveley).",
  ],
  [
    3,
    "Peter AMBERLINE (AMBERLINE) entered Crown Towers, 1 Great Eastern Highway, BURSWOOD WA (Crown Towers).",
  ],
  // Sheet 4 — operation two, no target
  [4, "Observed Daniel REID (REID) at 12 Smith Street, Perth."],
  [4, "A silver Mazda (Vehicle 1MAZ777) parked at 12 Smith Street, Perth."],
  [4, "No further observations."],
];

// ── load ─────────────────────────────────────────────────────────────────────
async function load(conn: mysql.Connection) {
  for (const t of [
    "entity_aliases",
    "associates",
    "operation_target_links",
    "targets",
    "sheet_rows",
    "running_sheets",
    "operations",
  ])
    await conn.query(`TRUNCATE TABLE \`${t}\``); // also restarts the ids at 1

  for (const o of OPERATIONS)
    await conn.query(
      "INSERT INTO operations (id, name, createdBy) VALUES (?, ?, 1)",
      [o.id, o.name]
    );
  for (const t of TARGETS)
    await conn.query(
      `INSERT INTO targets (id, createdBy, name, targetType, firstNames, surname, tgt, hbf, hb, v1f, v1, linkedAssociateId)
       VALUES (?, 1, ?, 'person', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.name,
        t.firstNames,
        t.surname,
        t.tgt,
        t.hbf,
        t.hb,
        t.v1f,
        t.v1,
        t.linkedAssociateId,
      ]
    );
  for (const a of ASSOCIATES)
    await conn.query(
      `INSERT INTO associates (id, createdBy, targetId, linkedTargetId, relationship, firstNames, surname, name, tgt)
       VALUES (?, 1, ?, ?, 'associate', ?, ?, ?, ?)`,
      [
        a.id,
        a.targetId,
        a.linkedTargetId,
        a.firstNames,
        a.surname,
        a.name,
        a.tgt,
      ]
    );
  for (const l of LINKS)
    await conn.query(
      "INSERT INTO operation_target_links (operationId, targetId) VALUES (?, ?)",
      [l.operationId, l.targetId]
    );
  for (const a of ALIASES)
    await conn.query(
      `INSERT INTO entity_aliases (type, loserKey, loserLabel, winnerKey, winnerLabel, mergedAt)
       VALUES (?, ?, ?, ?, ?, 1760000000000)`,
      [a.type, a.loserKey, a.loserLabel, a.winnerKey, a.winnerLabel]
    );
  for (const s of SHEETS)
    await conn.query(
      `INSERT INTO running_sheets (id, operationId, title, sheetDate, targetId, createdBy)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [s.id, s.operationId, s.title, s.date, s.targetId]
    );
  const perSheet = new Map<number, number>();
  for (const [sheetId, text] of ROWS) {
    const n = (perSheet.get(sheetId) ?? 0) + 1;
    perSheet.set(sheetId, n);
    const date = SHEETS.find(s => s.id === sheetId)!.date;
    // 06:00, 06:10, 06:20 … so the order of rows is fixed.
    const minutes = 6 * 60 + (n - 1) * 10;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    await conn.query(
      `INSERT INTO sheet_rows (sheetId, rowNumber, time, timeMinutes, rowDate, observation)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sheetId, n, `${hh}:${mm} AM`, minutes, date, text]
    );
  }
}

async function main() {
  const command = process.argv[2];
  if (command !== "check" && command !== "update") {
    console.error("Usage: intel-golden.ts check | update");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_golden")) {
    console.error(
      `Refusing to run: the database name must end in "_golden" (it is "${dbName}"). This check EMPTIES the data tables.`
    );
    process.exit(2);
  }

  const conn = await mysql.createConnection(url);
  try {
    await load(conn);
  } finally {
    await conn.end();
  }

  const { getAllIntelligenceEntities } = await import(
    "../../server/db/reports"
  );
  const entities = await getAllIntelligenceEntities({ unscoped: true });
  const built = canonicalizeEntities(entities);

  if (command === "update") {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, JSON.stringify(built, null, 1) + "\n");
    console.log(`Saved ${built.length} entities to ${GOLDEN}.`);
    process.exit(0);
  }

  if (!fs.existsSync(GOLDEN)) {
    console.error(`No reference answer at ${GOLDEN}. Run "update" first.`);
    process.exit(2);
  }
  const reference = JSON.parse(fs.readFileSync(GOLDEN, "utf8")) as unknown[];
  const r = compareEntityLists(reference, built);
  console.log(
    `Intelligence golden check: reference ${r.countA} entities, built ${r.countB} — ${r.identical ? "IDENTICAL" : `${r.differences.length} DIFFERENCE(S)`}`
  );
  for (const d of r.differences.slice(0, 40))
    console.log(
      `  ${d.kind}  ${d.key}${d.fields ? `  fields: ${d.fields.join(", ")}` : ""}${d.occurrences ? `  occurrences: ${d.occurrences[0]} vs ${d.occurrences[1]}` : ""}`
    );
  process.exit(r.identical ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
