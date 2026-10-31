// Safety net for the other big screens: Intelligence, the operation page,
// Governance, the Target Registry and row deletion. They are checked at the
// level an officer sees — the right numbers and names appear after something
// is typed on a sheet — so the big files behind them can be split without
// anyone having to look at every screen by hand afterwards.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import {
  USERNAME,
  PASSWORD,
  addRowWithObservation,
  createOperationAndSheet,
  openNewRowCell,
} from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe.configure({ mode: "serial" });

let opId = 0;

// A surname no earlier run could have used, so the person is new to the
// database however many times these tests have been run against it.
const SURNAME = Array.from({ length: 8 }, () =>
  String.fromCharCode(65 + Math.floor(Math.random() * 26))
).join("");
const INTRO = `Observed Lawrence ${SURNAME} (${SURNAME}) walking to 12 Smith Street, Perth.`;

// The pane's Search button starts a search for the team and is shaded while
// Search is on; pressing it while on leaves Search on this screen. This makes
// sure it is on without pressing it twice.
async function searchOn(page: import("@playwright/test").Page) {
  const button = page.getByRole("button", { name: "Search", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true")
    await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

test("a row can be deleted", async ({ page }) => {
  await createOperationAndSheet(page);
  await addRowWithObservation(page, "Row that will be removed");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  // Deleting asks the browser's own "Delete this row?" question first.
  let asked = "";
  page.once("dialog", d => {
    asked = d.message();
    void d.accept();
  });
  await page.getByRole("button", { name: "Delete row" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByText("No rows yet")).toBeVisible();
  expect(asked).toBe("Delete this row?");
});

test("a person typed on a sheet reaches Intelligence", async ({ page }) => {
  ({ opId } = await createOperationAndSheet(page));
  await addRowWithObservation(page, INTRO, "Lawrence");

  // Intelligence folder: the operation lists its sheet and the person.
  await page.goto("/intelligence");
  await expect(page.getByText("Intelligence Folder")).toBeVisible();
  const card = page
    .locator("div")
    .filter({ hasText: /Smoke \d+/i })
    .filter({ hasText: /1\s*sheet/i })
    .filter({ hasText: /1\s*entity/i })
    .first();
  await expect(card).toBeVisible();

  // The operation's own Intelligence page opens and counts the sheet.
  await page.goto(`/intelligence/operation/${opId}`);
  await expect(page.getByText("RUNNING SHEETS")).toBeVisible();
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);
});

test("the same person typed on a second sheet asks if it is the same person", async ({
  page,
}) => {
  await createOperationAndSheet(page);
  await openNewRowCell(page);
  await page.locator("textarea").first().fill(INTRO);
  await page.mouse.click(700, 620);
  const ask = page.getByRole("dialog").filter({
    hasText: "Possible duplicate entity",
  });
  await expect(ask).toBeVisible();
  // "No, different person" keeps them apart and lets the row save.
  await ask.getByRole("button", { name: "No, different person" }).click();
  await expect(ask).toBeHidden();
  await expect(
    page.locator("tbody tr").filter({ hasText: "Lawrence" })
  ).toHaveCount(1);
});

test("the operation page opens each of its tabs", async ({ page }) => {
  await page.goto(`/operation/${opId}`);
  for (const tab of [
    "Running Sheets",
    "Deployment Summaries",
    "Operation Profile",
  ]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(
      page.getByText("An unexpected error occurred."),
      `${tab} shows the error screen`
    ).toHaveCount(0);
  }
  // The last tab opened is the profile.
  await expect(
    page.getByRole("tabpanel", { name: "Operation Profile" })
  ).toBeVisible();
});

test("Governance lists the new sheet as needing attention", async ({
  page,
}) => {
  await page.goto("/governance");
  await expect(
    page.getByText("Running sheet write-off checklist")
  ).toBeVisible();
  await expect(page.getByText(/\d+ to review/).first()).toBeVisible();
});

test("Add Target opens with its four steps", async ({ page }) => {
  await page.goto("/target-registry");
  await page.getByRole("button", { name: "Add Target" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Add Target to Registry")).toBeVisible();
  // (The tab names are shown in capitals by the stylesheet, not in the text.)
  for (const step of ["Target", "Residents", "Associates", "Background"]) {
    await expect(
      dialog.getByText(new RegExp(`^${step}$`, "i")).first()
    ).toBeVisible();
  }
  // Nothing is saved by opening and closing it.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("Add Row, sort and search stay at the top while the rows scroll", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createOperationAndSheet(page);
  for (let i = 0; i < 25; i++) {
    await page.getByRole("button", { name: /^Add/ }).first().click();
    await page.waitForTimeout(120);
  }
  await expect(page.locator("tbody tr")).toHaveCount(25, { timeout: 20_000 });

  for (const [width, height] of [
    [1280, 800],
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const bar = page.getByTestId("sheet-toolbar");
    const main = page.locator("main.app-canvas");
    await main.evaluate(m => (m.scrollTop = 0));
    await main.evaluate(m => (m.scrollTop = 1500));
    // The page really scrolled, and the bar is still at the very top of the
    // scrolling area, fully on screen, with its search box usable.
    await expect
      .poll(() => main.evaluate(m => m.scrollTop), { message: `${width}px` })
      .toBeGreaterThan(500);
    const barTop = (await bar.boundingBox())!.y;
    const mainTop = (await main.boundingBox())!.y;
    expect(
      Math.abs(barTop - mainTop),
      `bar position at ${width}px`
    ).toBeLessThan(3);
    await expect(
      page.getByPlaceholder("Search by time, observation, or CIN…")
    ).toBeVisible();
  }
});

test("Appearance: the light header and side panel is saved, applied and kept across a reload", async ({
  page,
}) => {
  await page.goto("/profile");
  const html = page.locator("html");
  // Profile sections start closed; open Appearance (kept open after reload).
  await page
    .getByTestId("profile-section-appearance")
    .getByRole("button", { name: /Appearance/ })
    .click();
  await page.getByTestId("chrome-style-light").click();
  await expect(html).toHaveAttribute("data-chrome", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-chrome", "light");
  // The side panel really changed colour (light, not the dark rail).
  const rail = page.locator('[data-sidebar="sidebar"]').first();
  const railColour = () =>
    rail.evaluate(el => getComputedStyle(el).backgroundColor);
  const lightColour = await railColour();
  // Put it back so the next test sees the default.
  await page.getByTestId("chrome-style-dark").click();
  await expect(html).toHaveAttribute("data-chrome", "dark");
  expect(await railColour()).not.toBe(lightColour);
});

test("My Profile sections start closed and stay the way they were left", async ({
  page,
}) => {
  await page.goto("/profile");
  const info = page.getByTestId("profile-section-info");
  const button = info.getByRole("button", { name: /Profile Information/ });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  // Every titled section on the page starts closed.
  for (const b of await page
    .locator('[data-testid^="profile-section-"] h2 button')
    .all()) {
    await expect(b).toHaveAttribute("aria-expanded", "false");
  }
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(info.getByText("Your account details")).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByTestId("profile-section-info")
      .getByRole("button", { name: /Profile Information/ })
  ).toHaveAttribute("aria-expanded", "true");
  // Close it again so the next run starts from the default.
  await page
    .getByTestId("profile-section-info")
    .getByRole("button", { name: /Profile Information/ })
    .click();
  await expect(
    page.getByTestId("profile-section-info").getByText("Your account details")
  ).toBeHidden();
});

test("Ego Network on a phone fits the screen and zooms in and out", async ({
  page,
}) => {
  // A small made-up graph, so the test does not depend on what is in the
  // database: one target with five direct links.
  const node = (id: string, label: string, type: string) => ({
    id,
    label,
    type,
    occurrences: 3,
    operationIds: [1],
    operationNames: ["RAVEN"],
    targetId: null,
  });
  const nodes = [
    node("t", "Sahana Priya MENON (MENON)", "target"),
    node("a", "Terminal 4, Perth Airport WA", "address"),
    node("b", "Belmont Forum, 227 Belmont Avenue", "address"),
    node("c", "Daniel Tomas IBARRA (IBARRA)", "person"),
    node("d", "1MEN83 blue Mercedes-Benz GLC", "vehicle"),
    node("e", "Bunnings Belmont WA", "business"),
  ];
  const edges = ["a", "b", "c", "d", "e"].map(id => ({
    source: "t",
    target: id,
    weight: 3,
  }));
  await page.route(/getAssociationGraph/, async route => {
    const resp = await route.fetch();
    const json = await resp.json();
    const procs = new URL(route.request().url()).pathname
      .replace("/api/trpc/", "")
      .split(",");
    const i = procs.indexOf("intelligence.getAssociationGraph");
    const data = { nodes, edges };
    if (Array.isArray(json)) json[i].result.data.json = data;
    else json.result.data.json = data;
    await route.fulfill({ response: resp, json });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/intelligence?tab=egonet");
  await page.getByText(/Select focus entity/).click();
  await page.getByRole("option", { name: /MENON/ }).first().click();

  const canvas = page.getByTestId("ego-canvas");
  const layer = canvas.locator("> div.absolute.inset-0");
  // The picture fits the screen: nothing sticks out sideways.
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(0);
  await expect(layer).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)/);

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(layer).not.toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)/);
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await expect(layer).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)/);
});

test("Places Report lists where a target goes, by kind, with the visits behind each", async ({
  page,
}) => {
  // Made-up answers, so the test does not depend on what is in the database
  // (the real rules are tested in server/placesReport.test.ts).
  const visit = (
    dateISO: string,
    start: number | null,
    end: number | null,
    dwell: number | null
  ) => ({
    placeKey: "x",
    sheetId: 7,
    sheetTitle: "20261022 - 701 - RAVEN (MENON)",
    rowId: 1,
    dateISO,
    startMinutes: start,
    endMinutes: end,
    endDayOffset: 0,
    dwellMinutes: dwell,
  });
  const today = new Date().toISOString().slice(0, 10);
  const place = (
    name: string,
    kind: string,
    source: string,
    registeredAs: string | null,
    visits: ReturnType<typeof visit>[]
  ) => ({
    placeKey: name.toLowerCase(),
    name,
    kind,
    source,
    registeredAs,
    officerKind: null,
    visits: visits.map(v => ({ ...v, placeKey: name.toLowerCase() })),
  });
  const places = {
    targetName: "Sahana Priya MENON",
    operationName: "RAVEN",
    todayISO: today,
    places: [
      place("14 Marine Parade, COTTESLOE", "home", "registry-home", "Home", [
        visit(today, 1060, null, null),
      ]),
      place("100 St Georges Terrace, PERTH", "work", "registry-label", "Work", [
        visit(today, 530, 1025, 495),
      ]),
      place("62 Rokeby Road, SUBIACO", "gym", "sign", "Address 3", [
        visit(today, 450, 505, 55),
      ]),
    ],
  };
  await page.route(/\/api\/trpc\//, async route => {
    const resp = await route.fetch();
    const json = await resp.json();
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      const data =
        name === "operation.list"
          ? [{ id: 987654, name: "RAVEN" }]
          : name === "target.list"
            ? [{ id: 987655, name: "Sahana Priya MENON" }]
            : name === "intelligence.getTargetPlaces"
              ? places
              : undefined;
      if (data === undefined) return;
      // The real server has no such operation or target, so it answered with
      // an error; replace that whole answer.
      delete entry.error;
      entry.result = { data: { json: data } };
    };
    if (Array.isArray(json)) json.forEach((e, i) => patch(e, procs[i]));
    else patch(json, procs[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });

  await page.goto("/intelligence");
  await page.getByRole("button", { name: "Places", exact: true }).click();
  await page.getByText("Select an operation…").click();
  await page.getByRole("option", { name: "RAVEN" }).click();
  await page.getByText("Select a target…").click();
  await page.getByRole("option", { name: /MENON/ }).click();

  const rows = page.getByTestId("place-row");
  await expect(rows).toHaveCount(3);
  // The registry's own names are used: Home, and Work with no extra step.
  const home = rows.filter({ hasText: "14 Marine Parade" });
  await expect(home).toContainText("Registered home address");
  await expect(
    rows.filter({ hasText: "100 St Georges Terrace" })
  ).toContainText("Work");
  // A generic "Address 3" that has a name (a gym) shows as the Gym.
  const gym = rows.filter({ hasText: "62 Rokeby Road" });
  await expect(gym).toContainText("Gym");
  await expect(gym).toContainText("Registered as Address 3");
  // Hiding a kind removes its places.
  await page.getByRole("button", { name: /^Gym/ }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: /^Gym/ }).click();
  await expect(rows).toHaveCount(3);
  // The home evening visit has no departure logged; the list says so.
  await home.getByRole("button", { name: /Show the 1 visit/ }).click();
  await expect(home.locator("table")).toContainText("no departure logged");
});

test("Intelligence Package has Places as a ticked section between Heat Map and Pattern of Life", async ({
  page,
}) => {
  await page.goto("/intelligence");
  await page.getByRole("button", { name: "Packages", exact: true }).click();
  const contents = page.getByText("Package contents").locator("..");
  const names = await contents.locator("label .font-medium").allTextContents();
  const heat = names.indexOf("Heat Map");
  expect(heat).toBeGreaterThan(-1);
  expect(names[heat + 1]).toBe("Places");
  expect(names[heat + 2]).toBe("Pattern of Life");
  // Like every other section, it is ticked until someone unticks it.
  const places = contents.locator("label", { hasText: "Places" }).first();
  await expect(places.getByRole("checkbox")).toBeChecked();
  await places.click();
  await expect(places.getByRole("checkbox")).not.toBeChecked();
});

// A Search started by a test is ended afterwards, so it cannot keep switching
// the predictor on for the next test (it is shared for the whole team).
const searchesToEnd: { opId: number; sheetId: number }[] = [];
test.afterEach(async ({ page }) => {
  for (const s of searchesToEnd.splice(0))
    await page.request
      .post("/api/trpc/intelligence.clearPredictorLastSeen", {
        data: { json: { operationId: s.opId, sheetId: s.sheetId } },
      })
      .catch(() => null);
});

test("Map page: Search is one button that starts a blank search, with no Where next", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const created = await createOperationAndSheet(page);
  searchesToEnd.push(created);
  // History that fits the clock this test runs on: ten Home visits under way
  // around now on today's weekday — seven went to the gym next, three to the
  // cafe — and the sheet says he is at Home.
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const nowMin = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  const weekday = (Math.floor(Date.parse(today) / 86_400_000) + 3) % 7;
  const stop = (placeKey: string, end: number, next: string) => ({
    placeKey,
    weekday,
    dateISO: "2026-01-01",
    startMinutes: Math.max(0, end - 400),
    endMinutes: end,
    departureLogged: true,
    nextPlaceKey: next,
    nextStartMinutes: end + 15,
  });
  const predictor = {
    targetName: "Sahana Priya MENON",
    operationName: "RAVEN",
    todayISO: today,
    places: [
      {
        placeKey: "home",
        name: "14 Marine Parade, COTTESLOE",
        kind: "home",
        lat: -31.99,
        lng: 115.76,
      },
      {
        placeKey: "gym",
        name: "Elevate Fitness, SUBIACO",
        kind: "gym",
        lat: -31.95,
        lng: 115.8,
      },
      {
        placeKey: "cafe",
        name: "Little Bird Cafe, FREMANTLE",
        kind: "cafe",
        lat: -31.99,
        lng: 115.7,
      },
    ],
    stops: Array.from({ length: 10 }, (_, i) =>
      stop("home", nowMin + 5 + (i % 3), i < 7 ? "gym" : "cafe")
    ),
    lastSeen: {
      placeKey: "home",
      dateISO: today,
      minutes: Math.max(0, nowMin - 20),
      leaving: false,
    },
  };
  // The team was heading east from Home in the five minutes before he was last
  // seen: the cafe (west of Home) is behind that heading, the gym is ahead.
  const seenMs =
    Date.parse(`${today}T00:00:00+08:00`) + predictor.lastSeen.minutes * 60_000;
  const trail = [
    { userId: 1, lat: -31.99, lng: 115.76, recordedAt: seenMs - 240_000 },
    { userId: 1, lat: -31.99, lng: 115.764, recordedAt: seenMs - 20_000 },
  ];
  await page.route(/\/api\/trpc\//, async route => {
    // The map page also fetches things that are not tRPC JSON, or are cut off
    // when the test ends; those pass through untouched.
    const resp = await route.fetch().catch(() => null);
    if (!resp) return;
    const json = await resp.json().catch(() => null);
    if (json === null) return route.fulfill({ response: resp });
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      const data =
        name === "intelligence.getSheetTarget"
          ? {
              id: 987655,
              name: "Sahana Priya MENON",
              tgt: null,
              dep: null,
              arr: null,
              hb: null,
              hbf: null,
              v1: null,
              v1f: null,
              v2: null,
              v2f: null,
              extraVehicles: null,
              wildFields: null,
            }
          : name === "intelligence.getTargetPredictor"
            ? predictor
            : name === "intelligence.getPredictorTrail"
              ? trail
              : undefined;
      if (data === undefined) return;
      delete entry.error;
      entry.result = { data: { json: data } };
    };
    if (Array.isArray(json)) json.forEach((e, i) => patch(e, procs[i]));
    else patch(json, procs[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });

  await page.goto("/");
  await page.evaluate(({ opId, sheetId }) => {
    localStorage.setItem(
      "runlog_map_settings",
      JSON.stringify({
        selectedOpIds: [opId],
        opsExplicitlySet: true,
        rsSelectedSheetId: sheetId,
      })
    );
    localStorage.removeItem("runlog_target_predictor_on");
  }, created);
  await page.goto("/intelligence/mapping");
  await page.getByRole("button", { name: "Toggle side panel" }).click();

  // Off until the Search button is pressed, and nothing is shown while off. The
  // pane has the one Search button: no "Target Predictor" heading or On / Off
  // row, and no Where next.
  const searchButton = page.getByRole("button", {
    name: "Search",
    exact: true,
  });
  await searchButton.scrollIntoViewIfNeeded();
  await expect(searchButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("Target Predictor")).toHaveCount(0);
  await expect(page.getByText(/Target predictor/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Where next/ })).toHaveCount(0);
  await expect(page.getByTestId("predictor-banner")).toHaveCount(0);
  await expect(page.getByText("One tap — the cross goes away")).toHaveCount(0);

  // Search starts blank: one tap on the map puts the pin down. It has no top
  // banner, and the pane is stripped back: no names line, no "from the
  // operation" sentence, no clock line, no drop-down, slider or area buttons.
  await searchButton.click();
  await expect(searchButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("predictor-banner")).toHaveCount(0);
  await expect(page.getByText("One tap — the cross goes away")).toBeVisible();
  await expect(
    page.getByText(/From the operation and running sheet selected above/)
  ).toHaveCount(0);
  await expect(page.getByText("Sahana Priya MENON")).toHaveCount(0);
  await expect(page.getByText(/For when the team has lost him/)).toHaveCount(0);
  await expect(page.getByText(/Today is /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Where now?" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back street" })).toHaveCount(
    0
  );
  await expect(page.getByRole("slider")).toHaveCount(0);

  // Google Maps cannot be tapped here, so the pin is put down the way another
  // officer's screen would: shared for the sheet, then read back.
  const seedPoint = async (extra: Record<string, unknown> = {}) => {
    const r = await page.request.post(
      "/api/trpc/intelligence.setPredictorLastSeen",
      {
        data: {
          json: {
            operationId: created.opId,
            sheetId: created.sheetId,
            targetId: 987655,
            kind: "point",
            placeKey: null,
            lat: -31.99,
            lng: 115.76,
            seenMinutes: predictor.lastSeen.minutes,
            area: null,
            pausedAtMinutes: null,
            ...extra,
          },
        },
      }
    );
    expect(r.ok(), await r.text()).toBeTruthy();
  };
  await seedPoint();
  const reopenSearch = async () => {
    await page.reload();
    await page.getByRole("button", { name: "Toggle side panel" }).click();
    await searchOn(page);
  };
  await reopenSearch();
  await expect(page.getByTestId("predictor-banner")).toHaveCount(0);
  // Search no longer lists "Most likely, from his history" or the panel that
  // explains it (a guess from history is not accurate enough); Where next,
  // checked above, still is that history answer.
  await expect(
    page.getByText("Most likely, from his history", { exact: true })
  ).toHaveCount(0);
  await expect(page.getByText(/How this was worked out/)).toHaveCount(0);
  await expect(page.getByText("Show the numbers on the markers")).toHaveCount(
    0
  );
  await expect(page.getByRole("main").getByText(/\b(?!60%)\d+%/)).toHaveCount(
    0
  );
  await expect(page.getByText("Seen how long ago?")).toBeVisible();
  // Taken out: the last-seen line, the shared-by line, the direction note and
  // the two distance cards (the rings on the map carry those numbers).
  await expect(page.getByText(/Last seen \d\d:\d\d — /)).toHaveCount(0);
  await expect(page.getByText(/Shared with the team, set by/)).toHaveCount(0);
  await expect(page.getByText(/Team heading|no direction is used/)).toHaveCount(
    0
  );
  await expect(
    page.getByText("How far he could have got", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText("Most likely by now", { exact: true })
  ).toHaveCount(0);

  // There is no Move pin or Start again: the pin is dragged to move it, and the
  // map is otherwise left alone so a stray touch cannot shift it.
  await expect(page.getByRole("button", { name: "Move pin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start again" })).toHaveCount(
    0
  );

  // Seen how long ago: big buttons, no slider. Nothing goes back further than
  // five minutes.
  await expect(page.getByRole("button", { name: /^\d+ min$/ })).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Now", exact: true })
  ).toBeVisible();
  const saved = page.waitForResponse(r =>
    r.url().includes("setPredictorLastSeen")
  );
  await page.getByRole("button", { name: "2 min", exact: true }).click();
  await saved;
  await expect(
    page.getByRole("button", { name: "2 min", exact: true })
  ).toHaveAttribute("aria-pressed", "true");

  // Pause holds the ring; it is shared, so a reload (or another officer's
  // screen) shows it held too. Resume lets it grow again.
  const paused = page.waitForResponse(r =>
    r.url().includes("setPredictorLastSeen")
  );
  await page.getByRole("button", { name: "Pause ring" }).click();
  await paused;
  await expect(page.getByRole("button", { name: "Resume ring" })).toBeVisible();
  await reopenSearch();
  await expect(page.getByRole("button", { name: "Resume ring" })).toBeVisible();
  const resumed = page.waitForResponse(r =>
    r.url().includes("setPredictorLastSeen")
  );
  await page.getByRole("button", { name: "Resume ring" }).click();
  await resumed;
  await expect(page.getByRole("button", { name: "Pause ring" })).toBeVisible();

  // End search sits next to Pause and takes two taps, so a stray touch cannot end
  // the search for everyone. It then ends it for everyone: the pin and rings go,
  // and the next Search starts blank.
  const searchOf = async () => {
    const r = await page.request.get(
      `/api/trpc/intelligence.getMyTeamSearch?input=${encodeURIComponent(
        JSON.stringify({ json: { operationIds: [created.opId] } })
      )}`
    );
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  expect(await searchOf()).not.toBeNull();
  await page.getByTestId("end-search").click();
  await expect(page.getByTestId("end-search")).toContainText(
    "Tap again to end"
  );
  expect(await searchOf()).not.toBeNull();
  const ended = page.waitForResponse(r =>
    r.url().includes("clearPredictorLastSeen")
  );
  await page.getByTestId("end-search").click();
  await ended;
  await expect(
    page.getByRole("button", { name: "Search", exact: true })
  ).toHaveAttribute("aria-pressed", "false");
  expect(await searchOf()).toBeNull();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("One tap — the cross goes away")).toBeVisible();
  expect((await searchOf()).hasPin).toBe(false);
});

test("Map page: Search still shows how far he could have got with no history, and lists registered addresses in reach", async ({
  page,
}) => {
  const created = await createOperationAndSheet(page);
  searchesToEnd.push(created);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const nowMin = (Number(get("hour")) % 24) * 60 + Number(get("minute"));
  // Seen 20 minutes ago at a tapped point — no known places for this target
  // except one registered address about 1.5 km away that he was never seen at.
  const point = { lat: -31.95, lng: 115.86 };
  let places: unknown[] = [];
  const predictor = () => ({
    targetName: "Sahana Priya MENON",
    operationName: "RAVEN",
    todayISO: today,
    places,
    stops: [],
    lastSeen: null,
  });
  const sharedSeen = {
    kind: "point",
    placeKey: null,
    lat: point.lat,
    lng: point.lng,
    seenMinutes: Math.max(0, nowMin - 20),
    area: null,
    pausedAtMinutes: null,
    updatedByCIN: "999",
    updatedAtMs: Date.now(),
  };
  await page.route(/\/api\/trpc\//, async route => {
    const resp = await route.fetch().catch(() => null);
    if (!resp) return;
    const json = await resp.json().catch(() => null);
    if (json === null) return route.fulfill({ response: resp });
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      const data =
        name === "intelligence.getSheetTarget"
          ? {
              id: 987655,
              name: "Sahana Priya MENON",
              tgt: null,
              dep: null,
              arr: null,
              hb: null,
              hbf: null,
              v1: null,
              v1f: null,
              v2: null,
              v2f: null,
              extraVehicles: null,
              wildFields: null,
            }
          : name === "intelligence.getTargetPredictor"
            ? predictor()
            : name === "intelligence.getPredictorLastSeen"
              ? sharedSeen
              : name === "intelligence.getPredictorTrail"
                ? []
                : name === "intelligence.getRoadSpeed"
                  ? {
                      ok: true,
                      kph: 100,
                      source: "posted",
                      road: "Kwinana Fwy",
                      dataDate: "2026-10-24",
                    }
                  : undefined;
      if (data === undefined) return;
      delete entry.error;
      entry.result = { data: { json: data } };
    };
    if (Array.isArray(json)) json.forEach((e, i) => patch(e, procs[i]));
    else patch(json, procs[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  await page.goto("/");
  await page.evaluate(({ opId, sheetId }) => {
    localStorage.setItem(
      "runlog_map_settings",
      JSON.stringify({
        selectedOpIds: [opId],
        opsExplicitlySet: true,
        rsSelectedSheetId: sheetId,
      })
    );
    localStorage.setItem("runlog_target_predictor_on", "1");
  }, created);

  // 1. No known places and no history: the reach still answers.
  await page.goto("/intelligence/mapping");
  await page.getByRole("button", { name: "Toggle side panel" }).click();
  await searchOn(page);
  // Search has no top banner; its answers are in the pane and on the map.
  await expect(page.getByTestId("predictor-banner")).toHaveCount(0);
  // The posted limit of the road he was on picks the area and the speed.
  await expect(page.getByText(/Travelling at about\s*100 km\/h/)).toBeVisible();
  await expect(page.getByText(/the posted limit on Kwinana Fwy/)).toBeVisible();
  // The data's licence asks for a credit.
  await expect(
    page.getByText(/Main Roads Western Australia, Legal Speed Limits \(CC BY/)
  ).toBeVisible();
  await expect(
    page.getByText(/None of his known places or registered addresses/)
  ).toBeVisible();

  // The pane stays open when the map is tapped while the predictor is on; only
  // its X closes it.
  const pane = page.getByTestId("right-pane");
  await expect(pane).toHaveAttribute("data-open", "true");
  await page.mouse.click(300, 400);
  await page.waitForTimeout(400);
  await expect(pane).toHaveAttribute("data-open", "true");
  await expect(page.getByText("Seen how long ago?")).toBeVisible();

  // 2. A registered address he has never been seen at, inside the reach, is a
  // location of interest on its own (no visits needed).
  places = [
    {
      placeKey: "reg",
      name: "14 Marine Parade, COTTESLOE",
      kind: "home",
      lat: point.lat - 0.012,
      lng: point.lng,
      visits: 0,
      registered: true,
    },
  ];
  await page.reload();
  await page.getByRole("button", { name: "Toggle side panel" }).click();
  await searchOn(page);
  await expect(page.getByText("Locations of interest in reach")).toBeVisible();
  // The explanation panel is gone from Search; the rings keep their names on the
  // map only (Google Maps cannot be reached here to read them).
  await expect(page.getByText(/How this was worked out/)).toHaveCount(0);
  await expect(
    page.getByText("registered address — no visits on record")
  ).toBeVisible();
});

test("Map page: a Search started on one screen switches on by itself for the rest of the team", async ({
  page,
  browser,
}) => {
  // Waits for the polls (every 8 s) twice over.
  test.setTimeout(150_000);
  const created = await createOperationAndSheet(page);
  searchesToEnd.push(created);
  // A second screen — another officer's device — open on the Map with the
  // predictor off and no sheet selected.
  const other = await browser.newContext({
    storageState: "e2e/.auth/user.json",
  });
  const second = await other.newPage();
  // The sheet is given a target, as in the other predictor tests.
  await second.route(/\/api\/trpc\//, async route => {
    const resp = await route.fetch().catch(() => null);
    if (!resp) return;
    const json = await resp.json().catch(() => null);
    if (json === null) return route.fulfill({ response: resp });
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      if (name === "intelligence.getTargetPredictor") {
        delete entry.error;
        entry.result = {
          data: {
            json: {
              targetName: "Sahana Priya MENON",
              operationName: "RAVEN",
              todayISO: new Date().toLocaleDateString("en-CA", {
                timeZone: "Australia/Perth",
              }),
              places: [],
              stops: [],
              lastSeen: null,
            },
          },
        };
        return;
      }
      if (name !== "intelligence.getSheetTarget") return;
      delete entry.error;
      entry.result = {
        data: {
          json: {
            id: 987655,
            name: "Sahana Priya MENON",
            tgt: null,
            dep: null,
            arr: null,
            hb: null,
            hbf: null,
            v1: null,
            v1f: null,
            v2: null,
            v2f: null,
            extraVehicles: null,
            wildFields: null,
          },
        },
      };
    };
    if (Array.isArray(json)) json.forEach((e, i) => patch(e, procs[i]));
    else patch(json, procs[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  await second.goto("/");
  // This screen has the operation selected on the Map — and nothing else: no
  // sheet, no target, Show & Share off.
  await second.evaluate(opId => {
    localStorage.removeItem("runlog_target_predictor_on");
    localStorage.setItem(
      "runlog_map_settings",
      JSON.stringify({ selectedOpIds: [opId], opsExplicitlySet: true })
    );
  }, created.opId);
  await second.goto("/intelligence/mapping");
  const predictorOn = () =>
    second.evaluate(() => localStorage.getItem("runlog_target_predictor_on"));
  const searchOf = async () => {
    const r = await page.request.get(
      `/api/trpc/intelligence.getMyTeamSearch?input=${encodeURIComponent(
        JSON.stringify({ json: { operationIds: [created.opId] } })
      )}`
    );
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const startOn = (sheetId: number) =>
    page.request.post("/api/trpc/intelligence.startTeamSearch", {
      data: {
        json: { operationId: created.opId, sheetId, targetId: 987655 },
      },
    });
  expect(await predictorOn()).toBeNull();

  // Search is started on the first screen. The second one — logged in and with
  // the operation selected, Show & Share off — shows it by itself: nothing asks
  // it to join, and nothing is switched on for its location.
  const started = await startOn(created.sheetId);
  expect(started.ok(), await started.text()).toBeTruthy();
  await expect.poll(predictorOn, { timeout: 40_000 }).toBe("1");
  await second.getByRole("button", { name: "Toggle side panel" }).click();
  await expect(second.getByTestId("join-search")).toHaveCount(0);
  await expect(
    second.getByRole("button", { name: "Search", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByText("One tap — the cross goes away")).toBeVisible();
  await expect(second.getByTestId("predictor-banner")).toHaveCount(0);

  // The first search has priority: a search started on another sheet of the
  // same operation joins it instead of starting a second one.
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const other2 = await page.request.post("/api/trpc/sheet.create", {
    data: { json: { operationId: created.opId, sheetDate: today } },
  });
  expect(other2.ok(), await other2.text()).toBeTruthy();
  const sheetB = (await other2.json()).result.data.json;
  const secondId = sheetB.id ?? sheetB.sheetId;
  expect(typeof secondId).toBe("number");
  const heldRes = await startOn(secondId);
  expect(heldRes.ok(), await heldRes.text()).toBeTruthy();
  const held = (await heldRes.json()).result.data.json;
  expect(held.started).toBe(false);
  expect(held.holdingSheetId).toBe(created.sheetId);
  expect((await searchOf()).sheetId).toBe(created.sheetId);

  // End search takes two taps, then it is over for everyone and every screen
  // switches it off.
  await second.getByTestId("end-search").click();
  await expect(second.getByTestId("end-search")).toContainText(
    "Tap again to end"
  );
  expect(await searchOf()).not.toBeNull();
  await second.getByTestId("end-search").click();
  await expect.poll(predictorOn, { timeout: 10_000 }).toBe("0");
  await expect.poll(searchOf, { timeout: 10_000 }).toBeNull();

  // Started again: a new, blank search, shown by itself on the second screen.
  const again = await startOn(created.sheetId);
  expect(again.ok(), await again.text()).toBeTruthy();
  expect((await searchOf()).hasPin).toBe(false);
  await expect.poll(predictorOn, { timeout: 40_000 }).toBe("1");

  // Tracks. A device with its location off is never tracked: nobody is sharing
  // yet, so the Teams panel has no Track button at all.
  const trackButton = second
    .getByRole("button", { name: /^(Track|Tracking)$/ })
    .first();
  await expect(trackButton).toHaveCount(0);
  // The moment a device is sharing its location on the operation, the running
  // search switches its Track on by itself ...
  const share = await page.request.post(
    "/api/trpc/intelligence.updateUserLocation",
    {
      data: {
        json: {
          deviceId: "e2e-track-device",
          lat: -31.95,
          lng: 115.86,
          operationIds: [created.opId],
          sharingEnabled: true,
        },
      },
    }
  );
  expect(share.ok(), await share.text()).toBeTruthy();
  await expect(trackButton).toHaveText("Tracking", { timeout: 30_000 });
  // ... but does not hold it on: switched off by hand it stays off while the
  // list is polled again and again, and can be switched back on.
  await trackButton.click();
  await expect(trackButton).toHaveText("Track");
  await second.waitForTimeout(4_000);
  await expect(trackButton).toHaveText("Track");
  await trackButton.click();
  await expect(trackButton).toHaveText("Tracking");
  await page.request.post("/api/trpc/intelligence.clearUserLocation", {
    data: { json: { deviceId: "e2e-track-device" } },
  });
  await other.close();
});

test("Top banner: the operation name is a Show & Share switch, green while on", async ({
  page,
}) => {
  const created = await createOperationAndSheet(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // The operation is selected on the Map, and sharing starts off.
  await page.evaluate(opId => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith("runlog_sharing_u")) localStorage.removeItem(k);
    localStorage.setItem(
      "runlog_map_settings",
      JSON.stringify({ selectedOpIds: [opId], opsExplicitlySet: true })
    );
  }, created.opId);
  await page.goto("/intelligence/mapping");

  const banner = page
    .locator("header.app-chrome button[aria-pressed]")
    .filter({ hasText: /smoke/i });
  const colour = () =>
    banner.evaluate(el => getComputedStyle(el).color as string);
  const flag = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find(k =>
        k.startsWith("runlog_sharing_u")
      );
      return k ? localStorage.getItem(k) : null;
    });
  // The side panel's own Show & Share switch, which the banner must agree with.
  const paneSwitch = page.getByRole("button", { name: /Show & Share/ }).first();
  if (!(await paneSwitch.isVisible()))
    await page.getByRole("button", { name: "Toggle side panel" }).click();
  await expect(paneSwitch).toBeVisible();

  await expect(banner).toHaveAttribute("aria-pressed", "false");
  const white = await colour();

  await banner.click();
  await expect(banner).toHaveAttribute("aria-pressed", "true");
  await expect(paneSwitch).toHaveAttribute("aria-pressed", "true");
  expect(await flag()).toBe("true");
  // Phosphor green: the same colour the --share-on variable resolves to.
  const green = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--share-on)";
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  // The colour fades in, so wait for it to settle.
  await expect.poll(colour).toBe(green);
  expect(green).not.toBe(white);

  // The side-panel switch turns it off again too, and the banner follows.
  await paneSwitch.click();
  await expect(banner).toHaveAttribute("aria-pressed", "false");
  await expect.poll(colour).toBe(white);
  expect(await flag()).toBe("false");

  // And the banner turns it off when it was on.
  await banner.click();
  await expect(paneSwitch).toHaveAttribute("aria-pressed", "true");
  await banner.click();
  await expect(paneSwitch).toHaveAttribute("aria-pressed", "false");
  expect(await flag()).toBe("false");
});

test("The first row of a sheet comes with the opening and the whole team on it", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `First row ${Date.now()}`,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  // A team roster of one registered officer, and one name that is not a
  // registered CIN (it must not end up on the row).
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    sheetDate: today,
    sheetCins: [
      { cin, hasImages: false, isTeamLeader: true, isAuthor: true },
      { cin: "NOTAUSER9", hasImages: false },
    ],
  });
  await page.goto(`/sheet/${sheet.id ?? sheet.sheetId}`);
  await expect(page.getByText("No rows yet")).toBeVisible();

  // First row: the opening is written, the cell is open with the caret at the
  // end (ready for the address), and the team is on the row. Read in one step,
  // because the browser can take window focus away a moment later and the cell
  // then saves and closes, as it always does.
  await page.getByRole("button", { name: "Add Row" }).click();
  const textarea = page.locator("textarea").first();
  await expect
    .poll(() =>
      textarea.evaluate(el => ({
        value: (el as HTMLTextAreaElement).value,
        caretAtEnd:
          (el as HTMLTextAreaElement).selectionStart ===
          (el as HTMLTextAreaElement).value.length,
      }))
    )
    .toEqual({
      value: "Surveillance commenced in the vicinity of ",
      caretAtEnd: true,
    });
  const row = page.locator("tbody tr").first();
  await expect(row.getByText(cin, { exact: true })).toBeVisible();
  await expect(row.getByText("NOTAUSER9")).toHaveCount(0);

  // Saved, not just shown: reload and the opening and the team are still on it.
  await page.reload();
  const saved = page.locator("tbody tr").first();
  await expect(saved).toContainText(
    "Surveillance commenced in the vicinity of"
  );
  await expect(saved.getByText(cin, { exact: true })).toBeVisible();
  await expect(saved.getByText("NOTAUSER9")).toHaveCount(0);

  // Only the first row: the next one starts empty, with nobody on it.
  await page.getByRole("button", { name: "Add Row" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  const second = page
    .locator("tbody tr")
    .filter({ hasText: "Enter observation…" });
  await expect(second).toHaveCount(1);
  await expect(second.getByText(cin, { exact: true })).toHaveCount(0);
});

test("Add Row stamps the time, and Cease adds the ceased row with everyone still on", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Cease ${Date.now()}`,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  // Cease is a chip in the target chips, so the sheet has a target with a home
  // address to give it a row of chips.
  const target = await post("target.create", {
    operationId: op.id ?? op.operationId ?? op,
    name: `Cease Target ${Date.now()}`,
    hbf: "12 Smith Street, PERTH WA",
  });
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    targetId: target.id ?? target.targetId ?? target,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  await page.goto(`/sheet/${sheet.id ?? sheet.sheetId}`);
  await expect(page.getByText("No rows yet")).toBeVisible();

  // Nothing to cease on an empty sheet.
  const cease = page.getByTestId("cease-row");
  await expect(cease).toHaveCount(0);

  // Add Row arrives with the current time, not "Set time".
  await page.getByRole("button", { name: "Add Row" }).click();
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(/\d\d:\d\d [AP]M/);
  await expect(rows.first()).not.toContainText("Set time");

  // Cease: the ceased row, with the time and the officer still on. No place is
  // known on this sheet, so it is left open for the address.
  await expect(cease).toBeVisible();
  await cease.click();
  await expect(rows).toHaveCount(2);
  await expect(cease).toHaveCount(0);
  await page.reload();
  const ceased = page
    .locator("tbody tr")
    .filter({ hasText: "Surveillance ceased in the vicinity of" });
  await expect(ceased).toHaveCount(1);
  await expect(ceased).toContainText(/\d\d:\d\d [AP]M/);
  await expect(ceased.getByText(cin, { exact: true })).toBeVisible();
  // Everyone has ceased: nothing more to cease.
  await expect(page.getByTestId("cease-row")).toHaveCount(0);
});

test("Cease writes the place the team commenced at when nothing else says where the target is", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Cease place ${Date.now()}`,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  // Cease is a chip in the target chips, so the sheet has a target with a home
  // address to give it a row of chips.
  const target = await post("target.create", {
    operationId: op.id ?? op.operationId ?? op,
    name: `Cease Target ${Date.now()}`,
    hbf: "12 Smith Street, PERTH WA",
  });
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    targetId: target.id ?? target.targetId ?? target,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  // The first row, as an officer writes it: the team comes with it.
  await post("row.create", {
    sheetId,
    observation:
      "Surveillance commenced in the vicinity of 12 Smith Street, PERTH WA (12 Smith Street).",
  });
  await page.goto(`/sheet/${sheetId}`);
  await expect(page.getByTestId("cease-row")).toBeVisible();
  await page.getByTestId("cease-row").click();

  // One tap: the whole sentence, the place the team commenced at, the time, and
  // the officer — no typing.
  const ceased = page
    .locator("tbody tr")
    .filter({ hasText: "Surveillance ceased in the vicinity of" });
  await expect(ceased).toHaveCount(1);
  await expect(ceased).toContainText(
    "Surveillance ceased in the vicinity of 12 Smith Street, PERTH WA (12 Smith Street)."
  );
  await expect(ceased).toContainText(/\d\d:\d\d [AP]M/);
  await expect(ceased.getByText(cin, { exact: true })).toBeVisible();
  await expect(page.getByTestId("cease-row")).toHaveCount(0);
});

test("Cease is the last of the target chips and is not in the toolbar", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Cease chip ${Date.now()}`,
  });
  const opId = op.id ?? op.operationId ?? op;
  // A target with a home address gives the sheet a row of chips.
  const target = await post("target.create", {
    operationId: opId,
    name: `Chip Target ${Date.now()}`,
    hbf: "12 Smith Street, PERTH WA",
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: opId,
    sheetDate: today,
    targetId: target.id ?? target.targetId ?? target,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation:
      "Surveillance commenced in the vicinity of 12 Smith Street, PERTH WA (12 Smith Street).",
  });
  await page.goto(`/sheet/${sheetId}`);

  // One Cease control: a chip in the target chips, none in the toolbar.
  const toolbar = page.getByTestId("sheet-toolbar");
  const all = page.getByTestId("cease-row");
  await expect(all).toHaveCount(1);
  await expect(toolbar.getByTestId("cease-row")).toHaveCount(0);
  await expect(all).toHaveText("Cease");
  // It sits after the other chips, on the same panel.
  const chips = page.locator("button").filter({ hasText: /^(HBF|Cease)$/i });
  await expect(chips.last()).toHaveAttribute("data-testid", "cease-row");

  // With the target panel collapsed there is no chip, and still nothing in the
  // toolbar beside Add Row.
  await page
    .getByText(/^TARGET —/)
    .first()
    .click();
  await expect(all).toHaveCount(0);
  await expect(toolbar.getByTestId("cease-row")).toHaveCount(0);
  await page
    .getByText(/^TARGET —/)
    .first()
    .click();
  await expect(all).toHaveCount(1);

  // The chip adds the whole ceased row.
  await all.click();
  const ceased = page
    .locator("tbody tr")
    .filter({ hasText: "Surveillance ceased in the vicinity of" });
  await expect(ceased).toHaveCount(1);
  await expect(ceased).toContainText(
    "12 Smith Street, PERTH WA (12 Smith Street)."
  );
  await expect(ceased.getByText(cin, { exact: true })).toBeVisible();
});

test("A suburb spelled like a target's surname does not list that target at the address", async ({
  page,
}) => {
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  // A surname that is also the second half of a suburb ("MAIDA VALE"), so no
  // other test's data can match it.
  const word = () =>
    Array.from({ length: 8 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join("");
  const vale = word();
  const daryani = word();
  const op = await post("operation.create", { name: `Suburb ${Date.now()}` });
  const opId = op.id ?? op.operationId ?? op;
  const t1 = await post("target.create", {
    operationId: opId,
    name: `Arman Reza ${daryani}`,
    tgt: daryani,
  });
  await post("target.create", {
    operationId: opId,
    name: `Elliot Marcus ${vale}`,
    tgt: vale,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: opId,
    sheetDate: today,
    targetId: t1.id ?? t1.targetId ?? t1,
  });
  // The row names one target and the suburb, never the other target.
  await post("row.create", {
    sheetId: sheet.id ?? sheet.sheetId,
    time: "05:00 PM",
    timeMinutes: 1020,
    autoFill: false,
    observation: `Vehicle 1ARD64, ${daryani} driver and sole occupant, arrived at Advent Park, 345 Kalamunda Road, MAIDA ${vale} WA (Advent Park)`,
  });
  const r = await page.request.get(
    `/api/trpc/intelligence.mappingLocations?input=${encodeURIComponent(
      JSON.stringify({ json: { operationIds: [opId] } })
    )}`
  );
  expect(r.ok(), await r.text()).toBeTruthy();
  const locs = (await r.json()).result.data.json as {
    label?: string;
    observedTargets: string[];
  }[];
  const advent = locs.find(l => (l.label ?? "").includes("Advent Park"));
  expect(advent, JSON.stringify(locs)).toBeTruthy();
  expect(advent!.observedTargets.join(" | ")).toContain(daryani);
  expect(advent!.observedTargets.join(" | ")).not.toContain(vale);
});

test("Walked in says 'through the car park' when the vehicle's arrival says it parked in the car park", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Car park route ${Date.now()}`,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation:
      "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at 12 Smith Street, PERTH WA (12 Smith Street). Parked in the car park.",
  });
  await page.goto(`/sheet/${sheetId}`);
  await page.getByText("Target Logger", { exact: true }).first().click();
  await page.getByRole("button", { name: "Walked in", exact: true }).click();
  const walked = page
    .locator("tbody tr")
    .filter({ hasText: "exited the vehicle, walked" });
  await expect(walked).toHaveCount(1);
  await expect(walked).toContainText("walked through the car park, entered");
  await expect(walked).not.toContainText("[route]");
});

test("Walked in reads the car park from the box being typed in, without clicking out", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Car park live ${Date.now()}`,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation: "Surveillance commenced in the vicinity of 12 Smith Street.",
  });
  await page.goto(`/sheet/${sheetId}`);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await openNewRowCell(page);
  const box = page.locator("textarea").first();
  await box.fill(
    "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at 12 Smith Street, PERTH WA (12 Smith Street). Parked in the car park."
  );
  // Not saved: the card is built from the open box, and the tap reads it.
  const header = page.getByText("Target Logger", { exact: true }).first();
  await expect(header).toBeVisible();
  await header.click();
  const walkedIn = page.getByRole("button", { name: "Walked in", exact: true });
  await expect(walkedIn).toBeVisible();
  await walkedIn.click();
  await expect(box).toHaveValue(/walked through the car park, entered/);
  await expect(box).not.toHaveValue(/\[route\]/);
});

test("Map page: Target Markers is an on/off switch under Search, off to start, remembered", async ({
  page,
}) => {
  await createOperationAndSheet(page);
  await page.goto("/intelligence/mapping");
  await page.getByRole("button", { name: "Toggle side panel" }).click();
  const sw = page.getByTestId("target-location-switch");
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute("aria-pressed", "false");
  // The section sits after Search and before Street & Heading — by position in
  // the page, which does not move when the pane scrolls or reflows.
  const inOrder = await page.evaluate(() => {
    const switchEl = document.querySelector(
      '[data-testid="target-location-switch"]'
    )!;
    const searchBtn = Array.from(document.querySelectorAll("button")).find(
      b => b.textContent?.trim() === "Search"
    )!;
    const streetHeads = Array.from(document.querySelectorAll("span")).filter(
      e => e.textContent?.trim() === "Street & Heading"
    );
    const follows = (a: Element, b: Element) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      searchBeforeSwitch: follows(searchBtn, switchEl),
      streetHeads: streetHeads.length,
      switchBeforeStreet: streetHeads.every(h => follows(switchEl, h)),
    };
  });
  expect(inOrder.searchBeforeSwitch).toBe(true);
  expect(inOrder.streetHeads).toBeGreaterThan(0);
  expect(inOrder.switchBeforeStreet).toBe(true);
  // On or off — nothing else to choose.
  await sw.click();
  await expect(sw).toHaveAttribute("aria-pressed", "true");
  await expect(sw).toContainText("On");
  await page.reload();
  await page.getByRole("button", { name: "Toggle side panel" }).click();
  await expect(page.getByTestId("target-location-switch")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.getByTestId("target-location-switch").click();
  await expect(page.getByTestId("target-location-switch")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
});

test("Walked in after an arrival on the street says 'walked to', not an earlier visit's car park", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Street route ${Date.now()}`,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  const row = (observation: string) =>
    post("row.create", { sheetId, observation });
  await row(
    "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at 7 Boab Road, PERTH WA (7 Boab Road). Parked in the car park."
  );
  await row(
    "DARYANI exited 7 Boab Road and walked through the car park towards Vehicle 1ARD64."
  );
  await row(
    "Vehicle 1ARD64, DARYANI driver and sole occupant, departed 7 Boab Road and continued via:"
  );
  await row(
    "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at 12 Smith Street, PERTH WA (12 Smith Street) and parked on the street."
  );
  await page.goto(`/sheet/${sheetId}`);
  await page.getByText("Target Logger", { exact: true }).first().click();
  await page.getByRole("button", { name: "Walked in", exact: true }).click();
  const walked = page
    .locator("tbody tr")
    .filter({ hasText: "exited the vehicle, walked" });
  await expect(walked).toHaveCount(1);
  await expect(walked).toContainText("walked to, entered 12 Smith Street");
  await expect(walked).not.toContainText("car park");
  await expect(walked).not.toContainText("[route]");
});

test("Walked in after an arrival parked in the driveway is just 'exited the vehicle, entered …'", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Driveway route ${Date.now()}`,
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation:
      "Vehicle 1ARD64, DARYANI driver and sole occupant, arrived at 38 Lawley Crescent, MOUNT LAWLEY WA (38 Lawley Crescent) and parked in the driveway.",
  });
  await page.goto(`/sheet/${sheetId}`);
  await page.getByText("Target Logger", { exact: true }).first().click();
  await page.getByRole("button", { name: "Walked in", exact: true }).click();
  const walked = page
    .locator("tbody tr")
    .filter({ hasText: "exited the vehicle, entered" });
  await expect(walked).toHaveCount(1);
  await expect(walked).toContainText(
    "exited the vehicle, entered 38 Lawley Crescent and continued out of sight."
  );
  await expect(walked).not.toContainText("walked");
  await expect(walked).not.toContainText("[route]");
});

test("Map page: RS Quick Entry has the Cease chip at the end of the target chips", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", { name: `QE cease ${Date.now()}` });
  const opId = op.id ?? op.operationId ?? op;
  const target = await post("target.create", {
    operationId: opId,
    name: `QE Target ${Date.now()}`,
    hbf: "12 Smith Street, PERTH WA",
  });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: opId,
    sheetDate: today,
    targetId: target.id ?? target.targetId ?? target,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation:
      "Surveillance commenced in the vicinity of 12 Smith Street, PERTH WA (12 Smith Street).",
  });
  await page.evaluate(
    ([op, sh]) =>
      localStorage.setItem(
        "runlog_map_settings",
        JSON.stringify({ rsSelectedOpId: op, rsSelectedSheetId: sh })
      ),
    [opId, sheetId]
  );
  await page.goto("/intelligence/mapping");
  await page.waitForFunction(
    () => typeof (window as any).__intelRsQuickEntry === "function"
  );
  await page.evaluate(() => {
    (window as any).__intelRsQuickEntry("12 Smith Street, PERTH WA");
  });
  await expect(page.getByText("RS Quick Entry")).toBeVisible();

  // The chip is the last of the target chips (HBF and the rest).
  const cease = page.getByTestId("cease-row");
  await expect(cease).toHaveCount(1);
  await expect(cease).toHaveText("Cease");
  const chips = page.locator("button").filter({ hasText: /^(HBF|Cease)$/i });
  await expect(chips.last()).toHaveAttribute("data-testid", "cease-row");

  // One tap: the ceased row, at the place the team commenced.
  await cease.click();
  await expect(page.getByText("Surveillance ceased added")).toBeVisible();
  const list = await page.request.get(
    `/api/trpc/row.list?input=${encodeURIComponent(JSON.stringify({ json: { sheetId } }))}`
  );
  const rows = (await list.json()).result.data.json as {
    observation: string | null;
  }[];
  const ceased = rows.filter(r =>
    r.observation?.startsWith("Surveillance ceased in the vicinity of")
  );
  expect(ceased).toHaveLength(1);
  expect(ceased[0].observation).toContain("12 Smith Street");
  // Everyone has ceased: the chip goes.
  await expect(page.getByTestId("cease-row")).toHaveCount(0);
});
