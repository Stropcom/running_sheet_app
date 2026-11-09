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
  makePng,
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

test("Governance is the Outstanding Actions page: the banner opens the checklist list", async ({
  page,
}) => {
  await page.goto("/governance");
  await expect(
    page.getByRole("heading", { name: "Outstanding Actions" })
  ).toBeVisible();
  // The banner counts incomplete sheets, overdue sheets and members; the
  // checklist list is closed until it is clicked.
  const banner = page.getByRole("button", { name: /incomplete sheet/ });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/\d+\s*overdue/);
  await expect(banner).toContainText(/members? with outstanding actions/);
  await expect(banner).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText(/\d+ to review/)).toHaveCount(0);
  await banner.click();
  await expect(banner).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/\d+ to review/).first()).toBeVisible();
  // A sheet in the list opens its write-off checklist.
  await page
    .getByText(/^\d{8} - /)
    .first()
    .click();
  await expect(page).toHaveURL(/\/governance\/\d+/);
});

test("The old Outstanding Actions address goes to the Governance page", async ({
  page,
}) => {
  await page.goto("/reports/outstanding-actions");
  await expect(page).toHaveURL(/\/governance$/);
  await expect(
    page.getByRole("heading", { name: "Outstanding Actions" })
  ).toBeVisible();
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
  // The PDF export reads like the page: a card for each place, with its kind,
  // its weekday bars and its visits, not a plain table.
  const popupP = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await popupP;
  await pop.waitForLoadState();
  await expect(pop.locator(".disclaimer")).toContainText(
    "not a certified evidentiary document"
  );
  await expect(pop.locator(".pl-card")).toHaveCount(3);
  await expect(pop.locator(".pl-card").first()).toContainText("Usually");
  await expect(pop.locator(".pl-card svg").first()).toBeVisible();
  await pop.close();
});

test("Day Route sits between Places and Pattern of Life and shows one day's stops, gaps and map", async ({
  page,
}) => {
  const day = "2026-11-03";
  const visit = (
    key: string,
    start: number,
    end: number | null,
    rowId: number
  ) => ({
    placeKey: key,
    sheetId: 7,
    sheetTitle: "20261103 - 701 - RAVEN (MENON)",
    rowId,
    dateISO: day,
    startMinutes: start,
    endMinutes: end,
    endDayOffset: 0,
    dwellMinutes: end === null ? null : end - start,
  });
  const place = (name: string, kind: string, visits: any[]) => ({
    placeKey: name.toLowerCase(),
    name,
    kind,
    source: "none",
    registeredAs: null,
    officerKind: null,
    visits,
  });
  const places = {
    targetName: "Sahana Priya MENON",
    operationName: "RAVEN",
    todayISO: day,
    places: [
      place("14 lawley crescent", "home", [
        visit("14 lawley crescent", 402, 438, 1),
        visit("14 lawley crescent", 790, null, 4),
      ]),
      place("terminal 4", "travel", [visit("terminal 4", 665, 750, 3)]),
      place("88 hay street", "work", [visit("88 hay street", 511, 580, 2)]),
    ],
  };
  const coords = [
    { placeKey: "14 lawley crescent", lat: -31.99, lng: 115.78 },
    { placeKey: "88 hay street", lat: -31.95, lng: 115.83 },
    { placeKey: "terminal 4", lat: -31.94, lng: 115.97 },
  ];
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
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
              : name === "intelligence.getPlaceCoords"
                ? coords
                : name === "rsMapping.getStaticMapImage"
                  ? { dataUrl: png }
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

  await page.goto("/intelligence");
  const tabs = page.getByRole("button", {
    name: /^(Places|Day Route|Pattern of Life)$/,
  });
  await expect(tabs).toHaveText(["Places", "Day Route", "Pattern of Life"]);
  await page.getByRole("button", { name: "Day Route", exact: true }).click();
  await page.getByText("Select an operation…").click();
  await page.getByRole("option", { name: "RAVEN" }).click();
  await page.getByText("Select a target…").click();
  await page.getByRole("option", { name: /MENON/ }).click();

  // Four stops: home, work, the airport, home again (a second visit).
  const stops = page.getByRole("listitem").filter({ hasText: /Visit|min/ });
  await expect(page.getByText("14 lawley crescent").first()).toBeVisible();
  await expect(page.getByText("Visit 2")).toBeVisible();
  // 12:40 (stop 3 starts 11:05) follows work ending 09:40: an hour and a bit
  // with no rows is a gap, and is said so.
  await expect(page.getByText(/No rows for 1 h 25 min/)).toBeVisible();
  // The last stop has no departure logged and says so.
  await expect(page.getByText(/13:10 \(no departure logged\)/)).toBeVisible();
  await expect(page.getByRole("img", { name: /Route on/ })).toBeVisible();
  void stops;
});

test("Summary PDF: the Day Route (this sheet only, no gap lines) replaces the Locations map when the sheet has a target", async ({
  page,
}) => {
  const { opId, sheetId } = await createOperationAndSheet(page);
  const day = "2026-11-03";
  const visit = (
    key: string,
    start: number,
    end: number,
    rowId: number,
    sid = sheetId
  ) => ({
    placeKey: key,
    sheetId: sid,
    sheetTitle: "Sheet",
    rowId,
    dateISO: day,
    startMinutes: start,
    endMinutes: end,
    endDayOffset: 0,
    dwellMinutes: end - start,
  });
  const place = (name: string, kind: string, visits: any[]) => ({
    placeKey: name,
    name,
    kind,
    source: "none",
    registeredAs: null,
    officerKind: null,
    visits,
  });
  const places = {
    targetName: "Sahana Priya MENON",
    operationName: "RAVEN",
    todayISO: day,
    places: [
      place("14 lawley crescent", "home", [
        visit("14 lawley crescent", 402, 438, 1),
      ]),
      // 85 minutes later: the report would call this a gap; the Summary must not.
      place("88 hay street", "work", [visit("88 hay street", 523, 580, 2)]),
      // Another sheet's visit the same day: never in this sheet's summary.
      place("terminal 4, terminal 4", "travel", [
        visit("terminal 4, terminal 4", 665, 750, 3, sheetId + 999),
      ]),
    ],
  };
  const coords = [
    { placeKey: "14 lawley crescent", lat: -31.99, lng: 115.78 },
    { placeKey: "88 hay street", lat: -31.95, lng: 115.83 },
    { placeKey: "terminal 4, terminal 4", lat: -31.94, lng: 115.97 },
  ];
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  let withTarget = true;
  await page.route(/\/api\/trpc\//, async route => {
    const resp = await route.fetch();
    const json = await resp.json();
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      if (!withTarget) return;
      if (name === "sheet.get" && entry.result) {
        entry.result.data.json = {
          ...entry.result.data.json,
          targetId: 987655,
        };
        return;
      }
      const data =
        name === "target.getById"
          ? { id: 987655, name: "Sahana Priya MENON" }
          : name === "intelligence.getTargetPlaces"
            ? places
            : name === "intelligence.getPlaceCoords"
              ? coords
              : name === "rsMapping.getStaticMapImage"
                ? { dataUrl: png }
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
  void opId;

  await page.goto(`/summary/${sheetId}`);
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await page.waitForEvent("popup");
  await pop.waitForLoadState();
  const html = await pop.content();
  expect(html).toContain("Day Route");
  expect(html).toContain("14 lawley crescent");
  expect(html).toContain("88 hay street");
  // Only what the rows say: no gap wording, no other sheet's place.
  expect(html).not.toContain("No rows for");
  expect(html).not.toContain("terminal 4");
  expect(html).not.toContain("Location Map");
  await pop.close();

  // No target on the sheet: the Day Route is left out.
  withTarget = false;
  await page.goto(`/summary/${sheetId}`);
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop2 = await page.waitForEvent("popup");
  await pop2.waitForLoadState();
  expect(await pop2.content()).not.toContain("Day Route");
  await pop2.close();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Weekly Surveillance Report PDF: full width, a card for each target, a new page for each next target, rectangular pills", async ({
  page,
}) => {
  const target = (id: number, name: string, withIntel: boolean) => ({
    targetId: id,
    targetName: name,
    officers: ["459", "484"],
    teamLabel: "Team 1",
    days: ["2026-10-21"],
    coverageHours: 8.5,
    shifts: [
      { date: "2026-10-21", startMinutes: 7 * 60, finishMinutes: 14 * 60 },
      {
        date: "2026-10-22",
        startMinutes: 13 * 60,
        finishMinutes: 20 * 60 + 30,
      },
    ],
    investigator: "Ted NUGENT",
    intelSupport: "Ted NUGENT",
    contacted: "Day prior — Text",
    specialProjects: [{ key: "LBS", detail: "AFP" }],
    objectives: ["associate meets"],
    criticalDecisions: [],
    issues: [],
    targetActivity: [
      { label: "9 Etwell Street, EAST VICTORIA PARK", count: 2 },
    ],
    newIntel: {
      persons: withIntel ? ["Lucas Minh NGUYEN (NGUYEN)"] : [],
      vehicles: [],
      locations: withIntel
        ? ["Hawaiian's Park Centre, 789 Albany Highway"]
        : [],
      images: [],
    },
  });
  const operations = [
    {
      operationId: 1,
      operationName: "AURORA",
      sheetsCount: 3,
      rowsCount: 71,
      targets: [
        target(11, "Amadou TRAORE", true),
        target(12, "Kieran DOYLE", false),
        target(13, "Third TARGET", false),
      ],
    },
    {
      operationId: 2,
      operationName: "RAVEN",
      sheetsCount: 1,
      rowsCount: 9,
      targets: [
        target(21, "Sahana MENON", false),
        target(22, "Other PERSON", false),
      ],
    },
  ];
  await page.route(/\/api\/trpc\//, async route => {
    const resp = await route.fetch();
    const json = await resp.json();
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      if (name !== "reports.weeklyActivity") return;
      delete entry.error;
      entry.result = { data: { json: { operations } } };
    };
    if (Array.isArray(json)) json.forEach((e, i) => patch(e, procs[i]));
    else patch(json, procs[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });

  await page.goto("/reports/weekly-activity");
  // On the page: the overview is the first thing inside each operation's dropdown.
  await page.getByRole("button", { name: /AURORA/ }).click();
  await expect(
    page.getByText("Overview", { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.getByText("3 targets · 2 days worked · 25.5 h")
  ).toBeVisible();
  await expect(page.getByText("Wed 21 Oct").first()).toBeVisible();
  await expect(page.getByText("07:00 – 14:00").first()).toBeVisible();
  // The dropdown has sections like the PDF: the overview is its own card and
  // each target is its own card, each section in it under a titled band.
  await expect(page.getByTestId("wk-overview")).toHaveCount(1);
  const wkTargets = page.getByTestId("wk-target");
  await expect(wkTargets).toHaveCount(3);
  await expect(
    wkTargets.first().getByText("Deployment", { exact: true })
  ).toBeVisible();
  const popupP = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await popupP;
  await pop.waitForLoadState();
  await expect(pop.locator(".disclaimer")).toContainText(
    "not a certified evidentiary document"
  );

  // The overview leads the report: every operation, every target, the days and
  // times worked and the hours, before the operations' own pages.
  await expect(pop.locator(".ov-op")).toHaveCount(2);
  await expect(pop.locator(".ov-target")).toHaveCount(5);
  await expect(pop.locator(".ov-op").first()).toContainText("07:00 – 14:00");
  await expect(pop.locator(".ov-op").first()).toContainText("13:00 – 20:30");
  await expect(pop.locator(".ov-hours").first()).toHaveText("8.5 h");
  const overviewTop = await pop.locator(".overview").boundingBox();
  const firstOp = await pop.locator(".op-card").first().boundingBox();
  expect(overviewTop!.y).toBeLessThan(firstOp!.y);
  const blocks = pop.locator(".target-block");
  await expect(blocks).toHaveCount(5);
  // Each target is its own card with its own header band, naming the operation.
  await expect(pop.locator(".target-subhead")).toHaveCount(5);
  await expect(pop.locator(".tgt-op").first()).toHaveText("AURORA");
  // The first target stays on the header page; the next target in an operation
  // starts a new page (a new operation already does).
  const breakOf = (i: number) =>
    blocks.nth(i).evaluate(el => getComputedStyle(el).breakBefore);
  expect(await breakOf(0)).not.toBe("page");
  expect(await breakOf(1)).toBe("page");
  expect(await breakOf(2)).toBe("page");
  expect(await breakOf(3)).not.toBe("page"); // first target of RAVEN: its operation card breaks
  expect(await breakOf(4)).toBe("page");
  expect(
    await pop
      .locator(".op-card")
      .nth(1)
      .evaluate(el => getComputedStyle(el).breakBefore)
  ).toBe("page");
  // As wide as the header band.
  const head = await pop.locator(".cover-header").boundingBox();
  const card = await blocks.first().boundingBox();
  expect(Math.round(card!.x)).toBe(Math.round(head!.x));
  expect(Math.round(card!.width)).toBe(Math.round(head!.width));
  // Pills are rectangles, not circles.
  for (const sel of [".team-pill", ".day-chip", ".coverage-total", ".chip"]) {
    const radius = await pop
      .locator(sel)
      .first()
      .evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(radius).toBeLessThan(8);
  }
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("CTO Weekly Tasking: Copy Last Week copies from the latest week that has contacts, the full view shows every section, a deleted week goes to the Recycle Bin and can be reinstated", async ({
  page,
}) => {
  // Three made-up weeks far from real ones: one with contacts and a priority
  // board, a later one with only its calendar, and the new week the dialog makes.
  const W1 = "2040-01-02";
  const W2 = "2040-01-09";
  const W3 = "2040-01-16";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  const wipe = async () => {
    for (const w of [W1, W2, W3])
      await call("opManager.deleteWeek", { weekStart: w });
  };
  await wipe();
  try {
    await call("opManager.saveSupervisorContacts", {
      weekStart: W1,
      contacts: [
        {
          role: "CTO Inspector",
          userId: null,
          phone: "0400 111 222",
          sortOrder: 0,
        },
      ],
    });
    await call("opManager.savePriorityBoard", {
      weekStart: W1,
      rows: [
        {
          category: "A-TACC",
          priority: 1,
          operationName: "RAVEN",
          sortOrder: 0,
        },
        { category: "WC", priority: 2, operationName: "AURORA", sortOrder: 1 },
      ],
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W1,
      dayIndex: 1,
      teamRow: "surv2",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W2,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1400",
    });

    // New week: copies from the 2 Jan week, not the calendar-only 9 Jan one.
    await page.goto("/operation-manager");
    await page
      .getByRole("button", { name: "New CTO Weekly Tasking" })
      .first()
      .click();
    await expect(
      page.getByText(/Copies contacts & priority board from 02 Jan . 08 Jan/)
    ).toBeVisible();
    await page.getByRole("button", { name: /Copy Last Week/ }).click();
    await expect(
      page.getByText(
        /Copied 1 contact and 2 priority rows from 02 Jan . 08 Jan/
      )
    ).toBeVisible();
    await page.getByRole("tab", { name: "Priority" }).click();
    await page.getByRole("button", { name: "Full View" }).click();
    await expect(page.getByText("RAVEN").first()).toBeAttached();
    await expect(page.getByText("AURORA").first()).toBeAttached();

    // A week with only its calendar still shows the whole page.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 09 Jan – 15 Jan").click();
    await expect(page.getByText("Supervisors & Contacts")).toBeVisible();
    await expect(page.getByText("Priority Board")).toBeVisible();
    await expect(
      page.getByText("No priorities set for this week.")
    ).toBeVisible();
    await expect(page.getByText("Weekly Tasking Calendar")).toBeVisible();

    // Its edit page is not blank: it offers to copy the earlier week in.
    await page.getByRole("button", { name: /Edit Contacts/ }).click();
    await expect(
      page.getByText(/This week has no contacts or priority board yet/)
    ).toBeVisible();
    await page.getByRole("button", { name: "Copy them in" }).click();
    await expect(
      page.getByText(/This week has no contacts or priority board yet/)
    ).toHaveCount(0);

    // The Weekly Tasking Calendar can be laid out four ways, the choice is
    // remembered, and an operation can be highlighted across it.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 02 Jan – 08 Jan").click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    await expect(picker).toContainText("Banded columns");
    await expect(page.locator(".tcv-pa").first()).toBeVisible();
    for (const [label, marker] of [
      ["Schedule tables", ".tcv-table"],
      ["Calendar", ".tcv-ta"],
      ["Timeline", ".tcv-cb"],
    ] as const) {
      await picker.click();
      await page.getByRole("option", { name: label }).click();
      await expect(picker).toContainText(label);
      await expect(page.locator(marker).first()).toBeVisible();
    }
    const highlight = page.getByRole("group", {
      name: "Highlight an operation",
    });
    const raven = highlight.getByRole("button", { name: "RAVEN", exact: true });
    await expect(raven).toHaveAttribute("aria-pressed", "false");
    await raven.click();
    await expect(raven).toHaveAttribute("aria-pressed", "true");
    await highlight.getByRole("button", { name: "All", exact: true }).click();
    await expect(raven).toHaveAttribute("aria-pressed", "false");
    // Remembered: back at the list and into the week again, it is still the timeline.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 02 Jan – 08 Jan").click();
    await expect(
      page.getByRole("combobox", { name: "Calendar view" })
    ).toContainText("Timeline");
    await expect(page.locator(".tcv-cb").first()).toBeVisible();

    // The full view has Export PDF (the same preview window as every other
    // export), not a bare browser Print.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 02 Jan – 08 Jan").click();
    await expect(page.getByRole("button", { name: "Print" })).toHaveCount(0);
    await page.getByRole("button", { name: "Export PDF" }).click();
    // The export asks which layout (one or two): the one on screen is ticked,
    // a third cannot be ticked, and at least one is needed.
    const layouts = page.getByRole("group", {
      name: "Calendar layouts to export",
    });
    const timeline = layouts.getByRole("checkbox", { name: "Timeline" });
    const banded = layouts.getByRole("checkbox", { name: "Banded columns" });
    const tiles = layouts.getByRole("checkbox", { name: "Calendar" });
    await expect(timeline).toBeChecked();
    await banded.click();
    await expect(banded).toBeChecked();
    await expect(tiles).toBeDisabled();
    await timeline.click();
    await expect(tiles).toBeEnabled();
    await banded.click();
    await expect(
      page.getByRole("button", { name: "Export", exact: true })
    ).toBeDisabled();
    await banded.click();
    await timeline.click();
    const exportPopup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pop = await exportPopup;
    await pop.waitForLoadState();
    const html = await pop.content();
    expect(html).toContain("CTO Weekly Tasking");
    expect(html).toContain("Weekly Tasking Calendar · Banded columns");
    expect(html).toContain("Weekly Tasking Calendar · Timeline");
    expect(html).not.toContain("Weekly Tasking Calendar · Calendar");
    expect(html).toContain("02 Jan – 08 Jan 2040");
    expect(html).toContain("0400 111 222");
    expect(html).toContain("RAVEN");
    expect(html).toContain("Weekly Tasking Calendar");
    await expect(
      pop.getByRole("button", { name: /Close Preview/ })
    ).toBeVisible();
    await pop.close();

    // Delete a week from the list.
    await page.goto("/operation-manager");
    await expect(
      page.getByText("CTO Weekly Tasking — 16 Jan – 22 Jan")
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /Delete the weekly tasking for 16 Jan . 22 Jan/,
      })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      page.getByText("CTO Weekly Tasking — 16 Jan – 22 Jan")
    ).toHaveCount(0);
    await expect(
      page.getByText("CTO Weekly Tasking — 09 Jan – 15 Jan")
    ).toBeVisible();

    // It went to the Recycle Bin, and Reinstate brings it back with its contents.
    await page.goto("/recycle-bin");
    const binRow = page
      .locator("div")
      .filter({ hasText: "CTO Weekly Tasking — 16 Jan – 22 Jan" })
      .filter({ has: page.getByRole("button", { name: "Reinstate" }) })
      .last();
    await expect(binRow).toContainText("Weekly Tasking");
    await expect(binRow).toContainText("1 contact");
    await expect(binRow).toContainText("2 priority rows");
    await binRow.getByRole("button", { name: "Reinstate" }).click();
    await expect(page.getByText(/reinstated successfully/)).toBeVisible();
    await page.goto("/operation-manager");
    await expect(
      page.getByText("CTO Weekly Tasking — 16 Jan – 22 Jan")
    ).toBeVisible();
  } finally {
    await wipe();
  }
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

test("Add on a row opens the list of team CINs straight away, on laptop and phone", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", { name: `Add CIN ${Date.now()}` });
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const sheet = await post("sheet.create", {
    operationId: op.id ?? op.operationId ?? op,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  const addRow = () =>
    post("row.create", {
      sheetId,
      observation: `Observed a car ${Math.random().toString(36).slice(2, 7)}.`,
    });
  // A row with someone already on it, so Add (not the first-row team fill) is
  // what is pressed. The first row takes the whole team on creation.
  await addRow();
  const second = await addRow();
  expect(second).toBeTruthy();
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(`/sheet/${sheetId}`);
    // The second row has nobody on it.
    const rows = page.locator("tbody tr, [data-testid='sheet-row-card']");
    await expect(rows.first()).toBeVisible();
    // On a phone the toolbar button that adds a row is also called "Add", so
    // take the last one on the page: a row's own Add.
    const add = page.getByRole("button", { name: "Add", exact: true }).last();
    await add.click();
    // The list of CINs is open after the one tap: the options are showing.
    await expect(page.getByRole("option", { name: cin })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("Target Logger keeps people at the building when they enter a lift", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", { name: `Lift ${Date.now()}` });
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
      "Vehicle 1MEN83, MENON driver, VALE front passenger and LANGLEY rear passenger, arrived at Crown Towers Perth (Crown Towers Perth) and stopped in the valet parking area.\n\nMENON, VALE and LANGLEY exited the vehicle, entered Crown Towers Perth and continued out of sight.",
  });
  await post("row.create", {
    sheetId,
    observation:
      "MENON, VALE and LANGLEY checked in, entered the elevators and continued out of sight.",
  });
  await page.goto(`/sheet/${sheetId}`);
  await page.getByText("Target Logger", { exact: true }).first().click();
  // Still inside the building they went into: the lift is not a place of its own.
  await expect(page.getByText(/Crown Towers Perth · since/)).toBeVisible();
  await expect(page.getByText(/elevators/i)).toHaveCount(1); // the row's own text
});

test("Images: a photo linked to a vehicle or a location has a purple Profile pill, like a person", async ({
  page,
}) => {
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", {
    name: `Profile pills ${Date.now()}`,
  });
  const opId = op.id ?? op.operationId ?? op;
  const upload = async () => {
    const a = await post("attachment.uploadManual", {
      operationId: opId,
      dataBase64: makePng().toString("base64"),
      mimeType: "image/png",
      fileName: "x.png",
    });
    return a.id ?? a.attachmentId ?? a;
  };
  const place = await upload();
  await post("attachment.linkToEntity", {
    attachmentId: place,
    category: "location",
    entityLabel: "12 Amherst Street, FREMANTLE",
  });
  const car = await upload();
  await post("attachment.linkToEntity", {
    attachmentId: car,
    category: "vehicle",
    entityLabel: "1MEN83 blue Mercedes-Benz GLC station sedan",
  });
  await page.goto(`/images/${opId}`);
  // The manually uploaded photos are listed under their own group.
  await page.getByText("Manually uploaded").first().click();
  const loc = page.getByRole("link", { name: "Profile 12 Amherst Street" });
  const veh = page.getByRole("link", { name: "Profile 1MEN83" });
  await expect(loc).toBeVisible();
  await expect(veh).toBeVisible();
  await expect(loc).toHaveAttribute(
    "href",
    "/intelligence/location/12%20Amherst%20Street%2C%20FREMANTLE"
  );
  await expect(veh).toHaveAttribute(
    "href",
    "/intelligence/vehicle/1MEN83%20blue%20Mercedes-Benz%20GLC%20station%20sedan"
  );
});

test("CTO Weekly Tasking: Team 1 and Team 2 on the same shift can be blended, and a blended day shows in every layout and the PDF", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // One made-up week far from real ones; Monday: Team 1 on 0600-1500 (RAVEN),
  // Team 2 on 1300-2200 (FALCON).
  const W = "2040-02-06";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  const cells = async () => {
    const res = await page.request.get(
      `/api/trpc/opManager.getTaskingCalendar?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { weekStart: W } } }))}`
    );
    const body = await res.json();
    return body[0].result.data.json as {
      dayIndex: number;
      teamRow: string;
      shiftTime: string | null;
      primaryTask: string | null;
      blended: boolean;
    }[];
  };
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv2",
      shiftTime: "1300-2200",
      primaryTask: "FALCON",
    });

    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 06 Feb – 12 Feb").click();
    const layoutPicker = page.getByRole("combobox", { name: "Calendar view" });
    await layoutPicker.click();
    await page.getByRole("option", { name: "Banded columns" }).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    const setT2Shift = (shift: string) =>
      page.getByLabel("Shift T2 · Mon").selectOption(shift);
    const dialog = page.getByRole("dialog");

    // Same shift as Team 1: asked. The tasks differ, so it also asks whose to keep.
    await setT2Shift("0600-1500");
    await expect(
      dialog.getByText("Blend Team 1 and Team 2 on Mon 06 Feb?")
    ).toBeVisible();
    await expect(dialog.getByText("Team 1's tasks")).toBeVisible();
    await expect(dialog.getByText("Team 2's tasks")).toBeVisible();
    // No: kept apart, and not asked again for that shift.
    await dialog.getByRole("button", { name: "No, keep separate" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(0);
    // A different shift and back is a new question.
    await setT2Shift("1000-1800");
    await expect(dialog).toHaveCount(0);
    await setT2Shift("0600-1500");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, blend" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Split" }).first()
    ).toBeVisible();

    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(
      page.getByText(/Saved \d+ changes?\.|Draft saved/)
    ).toBeVisible();
    // (If the roster has people in these teams it asks about their start times.)
    await page
      .getByRole("dialog", { name: "Update the roster too?" })
      .getByRole("button", { name: "No" })
      .click({ timeout: 3000 })
      .catch(() => {});
    const saved = await cells();
    const mon = saved.filter(c => c.dayIndex === 0);
    expect(mon.find(c => c.teamRow === "surv1")).toMatchObject({
      blended: true,
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });
    // Team 2 carries the shared entry (Team 1's tasks, as picked by default).
    expect(mon.find(c => c.teamRow === "surv2")).toMatchObject({
      blended: true,
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });

    // The full view shows the blended day in each layout.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 06 Feb – 12 Feb").click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    await picker.click();
    await page.getByRole("option", { name: "Banded columns" }).click();
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(2);
    await picker.click();
    await page.getByRole("option", { name: "Schedule tables" }).click();
    await expect(page.locator(".tcv-table tr.bl")).toHaveCount(2);
    await picker.click();
    await page.getByRole("option", { name: "Calendar" }).click();
    await expect(page.locator(".tcv-tl.merged")).toHaveCount(1);
    await picker.click();
    await page.getByRole("option", { name: "Timeline" }).click();
    await expect(page.locator(".tcv-bar.merged")).toHaveCount(1);

    // And in the PDF.
    await page.getByRole("button", { name: "Export PDF" }).click();
    const layouts = page.getByRole("group", {
      name: "Calendar layouts to export",
    });
    await layouts.getByRole("checkbox", { name: "Banded columns" }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pop = await popup;
    await pop.waitForLoadState();
    const html = await pop.content();
    expect(html).toContain("tp-btag");
    expect(html).toContain("tp-bar merged");
    await pop.close();

    // Split puts the day back to two teams.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 06 Feb – 12 Feb").click();
    await layoutPicker.click();
    await page.getByRole("option", { name: "Banded columns" }).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    await page.getByRole("button", { name: "Split" }).first().click();
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(0);
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(
      page.getByText(/Saved \d+ changes?\.|Draft saved/)
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "Update the roster too?" })
      .getByRole("button", { name: "No" })
      .click({ timeout: 3000 })
      .catch(() => {});
    const after = (await cells()).filter(c => c.dayIndex === 0);
    expect(after.every(c => !c.blended)).toBe(true);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("Team Duty Roster: zoom, team cards and team colours that follow User Management", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-03-05"; // a made-up CTO Weekly Tasking week
  const NEW_COLOUR = "#00aa55";
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: null } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";

  // A roster team called "Team 1" with one member (kept if it is already there).
  let rosterTeams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  let addedTeam = false;
  if (!rosterTeams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    addedTeam = true;
    rosterTeams = await get("ctoRoster.teams.list");
  }
  const rosterTeam = rosterTeams.find(t => t.name === "Team 1")!;
  const members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  let addedMemberId: number | null = null;
  if (!members.some(m => m.cin === cin)) {
    const r = await call("ctoRoster.members.add", {
      cin,
      teamId: rosterTeam.id,
    });
    addedMemberId = r.result?.data.json.memberId ?? null;
  }

  // The User Management team called "Team 1" gets a new colour.
  const umTeams = (await get("users.listTeams")) as {
    id: number;
    name: string;
    colour: string | null;
    aiPhones: string[] | null;
    mapVisibility: "always" | "online";
    forceShare: boolean;
    offerOnNewSheet: boolean;
  }[];
  const um = umTeams.find(t => t.name === "Team 1")!;
  const setColour = (colour: string | null) =>
    call("admin.updateTeam", {
      id: um.id,
      name: um.name,
      colour,
      aiPhones: um.aiPhones ?? [],
      mapVisibility: um.mapVisibility,
      forceShare: um.forceShare,
      offerOnNewSheet: um.offerOnNewSheet,
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await setColour(NEW_COLOUR);
    await page.goto("/cto-roster");
    const fold = page.getByRole("button", { name: "Collapse Team 1" });
    await expect(fold).toBeVisible();
    const card = fold.locator(
      "xpath=ancestor::div[contains(@class,'mb-5')][1]"
    );
    // The team's section is drawn in the colour set in User Management.
    // (the colour end at the card's left, which stays on screen when scrolled)
    await expect(card.locator("> div").first()).toHaveCSS(
      "background-color",
      "rgb(0, 170, 85)"
    );

    // Zoom: 100% to start, the slider zooms the grid and it is remembered.
    const grid = card.locator("xpath=..");
    // The percentage is only read out for screen readers now (no number shown).
    const zoomSays = page
      .getByRole("group", { name: "Roster zoom" })
      .locator("[aria-live=polite]");
    await expect(zoomSays).toHaveText("100%");
    await expect(grid).toHaveCSS("zoom", "1");
    await page.getByRole("slider", { name: "Zoom level" }).fill("50");
    await expect(zoomSays).toHaveText("50%");
    await expect(grid).toHaveCSS("zoom", "0.5");
    await page.reload();
    await expect(zoomSays).toHaveText("50%");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoomSays).toHaveText("55%");
    // A team folds down to its totals and back.
    await page.getByRole("button", { name: "Collapse Team 1" }).click();
    await expect(
      page.getByRole("button", { name: "Expand Team 1" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Expand Team 1" }).click();
    await expect(
      page.getByRole("button", { name: "Collapse Team 1" })
    ).toBeVisible();

    // The CTO Weekly Tasking draws Team 1 in the same colour.
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1400",
      primaryTask: "RAVEN",
    });
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 05 Mar – 11 Mar").click();
    await expect(page.locator(".tcv-team").first()).toHaveAttribute(
      "style",
      /--tc:\s*(#00aa55|rgb\(0,\s*170,\s*85\))/
    );
  } finally {
    await setColour(um.colour);
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking on a phone: only Calendar and Timeline, no colour or letter key", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-05-07";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    // A saved Banded columns choice (made on a laptop) shows as Calendar on a phone.
    await page.addInitScript(() =>
      localStorage.setItem("runlog.taskingView", "panel-banded")
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 07 May/).click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    await expect(picker).toContainText("Calendar");
    await picker.click();
    await expect(page.getByRole("option")).toHaveText(["Calendar", "Timeline"]);
    await page.keyboard.press("Escape");

    // A laptop still has all four layouts, and no colour key (it was taken
    // out of the screen view).
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(page.locator(".tcv-legend")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Calendar view" }).click();
    await expect(page.getByRole("option")).toHaveCount(4);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("Calendar: month grid by default, List view is selectable and remembered", async ({
  page,
}) => {
  await page.goto("/calendar");
  await page.evaluate(() => localStorage.removeItem("runlog.calendarView"));
  await page.reload();
  const group = page.getByRole("group", { name: "Calendar layout" });
  await expect(group.getByRole("button", { name: "Month" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".rbc-month-view")).toBeVisible();

  await group.getByRole("button", { name: "List" }).click();
  await expect(group.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".rbc-month-view")).toHaveCount(0);

  // Remembered on this device.
  await page.reload();
  await expect(group.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("Team Duty Roster on a phone: the month sits in the frozen corner, follows the scroll and stays in full screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cto-roster");
  const corner = page.getByTestId("roster-month-corner");
  await expect(corner).toBeVisible();
  await expect(corner).toHaveText(/^[A-Z][a-z]{2} \d{4}$/);
  const before = (await corner.textContent()) ?? "";
  // Scroll the grid a few weeks sideways: the corner month follows.
  await page.evaluate(() => {
    const el = document.querySelector(".overflow-auto.cursor-grab");
    if (el) el.scrollLeft += 2400;
  });
  await expect(corner).not.toHaveText(before);
  // Still there in Full screen, where the month picker is hidden.
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByText("Showing", { exact: true })).toHaveCount(0);
  await expect(corner).toBeVisible();
});

test("Team Duty Roster full screen: a phone turned sideways has zoom / Today / Exit in the header, a portrait phone keeps the strip", async ({
  page,
}) => {
  const bar = page.getByRole("group", { name: "Roster full screen controls" });
  // Sideways (landscape, both header layouts): the controls are in the header
  // bar, at the very top, not in a strip over the grid.
  for (const [width, height] of [
    [844, 390],
    [740, 360],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/cto-roster");
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect(bar).toBeVisible();
    await expect(bar).toHaveCount(1);
    const box = await bar.boundingBox();
    expect(box?.y ?? 99).toBeLessThan(40);
    await bar.getByRole("button", { name: "Exit full screen" }).click();
    await expect(page.getByText("Team Duty Roster")).toBeVisible();
  }
  // Portrait: still the strip on the page, under the header.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cto-roster");
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCount(1);
  const portrait = await bar.boundingBox();
  expect(portrait?.y ?? 0).toBeGreaterThan(55);
});

test("Team Duty Roster: Full screen hides the toolbar, keeps zoom / Today / Exit in the header, Esc and Exit put it back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/cto-roster");
  await expect(page.getByText("Showing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toBeVisible();
  // Repeat Cycle is gone; Today sits in the row with Bulk Edit and Bulk Copy.
  await expect(page.getByRole("button", { name: "Repeat Cycle" })).toHaveCount(
    0
  );
  const todayBox = await page
    .getByRole("button", { name: "Today" })
    .boundingBox();
  const editBox = await page
    .getByRole("button", { name: "Bulk Edit" })
    .boundingBox();
  expect(Math.abs((todayBox?.y ?? 0) - (editBox?.y ?? 99))).toBeLessThan(4);

  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByText("Showing", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toHaveCount(0);
  const bar = page.getByRole("group", { name: "Roster full screen controls" });
  await expect(bar.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Today" })).toBeVisible();

  // Exit button puts the toolbar back.
  await bar.getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toBeVisible();
  await expect(page.getByText("Showing", { exact: true })).toBeVisible();

  // Esc does too.
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toBeVisible();

  // A phone gets the same controls as a strip on the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(
    page
      .getByRole("group", { name: "Roster full screen controls" })
      .getByRole("button", { name: "Exit full screen" })
  ).toBeVisible();
});

test("CTO Weekly Tasking Timeline: an admin slides a bar, sees Save and re-post, and the change is saved", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2040-05-14";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  // Plenty of operations, so the operation menu is long enough to scroll
  // inside itself (it used to close when it did, which hung this test on a
  // database that already had operations).
  const stamp = Date.now();
  const menuOpIds: number[] = [];
  for (let n = 1; n <= 14; n++) {
    const r = await call("operation.create", {
      name: `E2E MENU OP ${stamp} ${n}`,
    });
    const made = (await r.json())[0].result.data.json;
    menuOpIds.push(
      typeof made === "number" ? made : (made.id ?? made.operationId)
    );
  }
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv2",
      shiftTime: "1400-2200",
      primaryTask: "AURORA",
    });
    // Posted already, so the bar offers Save and re-post.
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.addInitScript(() =>
      localStorage.setItem("runlog.taskingView", "cal-timeline")
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 14 May/).click();

    const bar = page.locator(".tcv-bar", { hasText: "RAVEN" }).first();
    await expect(bar).toContainText("0700–1500");
    await expect(
      page.getByRole("region", { name: "Unsaved timeline changes" })
    ).toHaveCount(0);
    // Not editable until Edit is pressed.
    await expect(page.locator(".tcv-bar.tcv-edit")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    await expect(page.locator(".tcv-bar.tcv-edit").first()).toBeVisible();

    // Slide it later in the day: the bar shows its new time, the save bar appears.
    const box = (await bar.boundingBox())!;
    const lane = (await bar.locator("xpath=..").boundingBox())!;
    const hours = lane.width / 19; // 05:00 to 24:00 while editing
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + hours,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.move(
      box.x + box.width / 2 + 2 * hours,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.up();
    await expect(bar).toContainText("0900–1700");
    const saveBar = page.getByRole("region", {
      name: "Unsaved timeline changes",
    });
    await expect(saveBar).toContainText("1 change");
    await expect(saveBar).toContainText("0700–1500 to 0900–1700");
    await expect(
      page.getByRole("button", { name: "Save and re-post" }).first()
    ).toBeVisible();

    // Cancel puts it back and leaves edit mode.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(saveBar).toHaveCount(0);
    await expect(bar).toContainText("0700–1500");
    await expect(page.locator(".tcv-bar.tcv-edit")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();

    // A click (no slide) opens the operation menu.
    await bar.click();
    const menu = page.getByRole("menu", { name: /Operation for/ });
    await expect(
      menu.getByRole("menuitemradio", { name: /RAVEN/ })
    ).toHaveAttribute("aria-checked", "true");
    // Admin and Other (free text) sit under the operations, as in the edit grid.
    await expect(
      menu.getByRole("menuitemradio", { name: "Admin" })
    ).toBeVisible();
    await menu.getByRole("menuitem", { name: /Other/ }).click();
    await menu.getByLabel("Describe the task").fill("Training day");
    await menu.getByRole("button", { name: "Set" }).click();
    await expect(menu).toHaveCount(0);
    const savebar2 = page.getByRole("region", {
      name: "Unsaved timeline changes",
    });
    await expect(savebar2).toContainText("operation RAVEN to Training day");
    await expect(
      page.locator(".tcv-bar", { hasText: "Training day" })
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(bar).toContainText("RAVEN");
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    // Escape closes the menu without changing anything.
    await bar.click();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Slide again and Save: it is stored and still there after a reload.
    await bar.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(bar).toContainText("0800–1600");
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(page.getByText(/Saved 1 change\.|Draft saved/)).toBeVisible();
    await expect(saveBar).toHaveCount(0);
    // Save leaves edit mode.
    await expect(
      page.getByRole("button", { name: "Edit Tasking", exact: true })
    ).toBeVisible();
    await expect(page.locator(".tcv-bar.tcv-edit")).toHaveCount(0);
    await page.reload();
    await page.getByText(/CTO Weekly Tasking — 14 May/).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "RAVEN" }).first()
    ).toContainText("0800–1600");
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
    for (const id of menuOpIds) await call("operation.delete", { id });
  }
});

test("Side menu: CTO Roster opens the roster, and its tools are grouped under Roster tools (folded by default)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/cto-roster");
  const tools = page.getByRole("button", { name: "Roster tools", exact: true });
  await expect(tools).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "My Shifts", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Outlook", exact: true })
  ).toBeVisible();
  for (const name of [
    "Drafts",
    "Saved Rosters",
    "EA Compliance",
    "Audit Log",
    "Members",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0
    );

  await tools.click();
  await expect(tools).toHaveAttribute("aria-expanded", "true");
  for (const name of [
    "Drafts",
    "Saved Rosters",
    "EA Compliance",
    "Audit Log",
    "Members",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();

  // Going to a tool leaves the group open so you can see where you are.
  await page.getByRole("button", { name: "Audit Log", exact: true }).click();
  await expect(page).toHaveURL(/\/cto-roster\/audit/);
  await expect(
    page.getByRole("button", { name: "Roster tools", exact: true })
  ).toHaveAttribute("aria-expanded", "true");

  // The CTO Roster entry itself opens the main roster page.
  await page.getByRole("button", { name: "CTO Roster", exact: true }).click();
  await expect(page).toHaveURL(/\/cto-roster$/);
});

test("Side menu: Weekly Activity (the Weekly Surveillance Report) keeps Op Manager open and does not open Procedures or Administration", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/reports/weekly-activity");
  // Op Manager is open with Weekly Activity in it.
  await expect(
    page.getByRole("button", { name: "Weekly Activity", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CTO Weekly Tasking", exact: true })
  ).toBeVisible();
  // Procedures and Administration stay folded.
  for (const name of [
    "Vehicle Crash",
    "UCO Guide",
    "SMEAC Briefings",
    "Archive",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0
    );
});

test("CTO Weekly Tasking: Post asks whether to carry a different start time to the roster, again each time while they differ; Yes updates the on-duty members", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const W = "2040-06-04"; // a Monday, a made-up week
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";

  // A roster team called "Team 1" with the e2e officer in it (kept if there).
  let rosterTeams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  let addedTeam = false;
  if (!rosterTeams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    addedTeam = true;
    rosterTeams = await get("ctoRoster.teams.list");
  }
  const rosterTeam = rosterTeams.find(t => t.name === "Team 1")!;
  let members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  let addedMemberId: number | null = null;
  if (!members.some(m => m.cin === cin)) {
    const r = await call("ctoRoster.members.add", {
      cin,
      teamId: rosterTeam.id,
    });
    addedMemberId = r.result?.data.json.memberId ?? null;
    members = (await get("ctoRoster.members.list")) as typeof members;
  }
  const member = members.find(m => m.cin === cin)!;
  const rosterShift = async () => {
    const rows = (await get("ctoRoster.roster.getRange", {
      startDate: W,
      endDate: W,
    })) as {
      memberId: number;
      shiftDate: string;
      shiftCode: string;
      shiftTime: string | null;
    }[];
    return rows.find(r => r.memberId === member.id && r.shiftDate === W);
  };

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // On the roster: a Day shift (06:00). On the tasking: Team 1 starts 14:00.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "1400-2200",
      primaryTask: "RAVEN",
    });

    await page.setViewportSize({ width: 1400, height: 900 });
    const openWeek = async () => {
      await page.goto("/operation-manager");
      await page.getByText(/CTO Weekly Tasking — 04 Jun/).click();
    };
    const question = page.getByRole("dialog", {
      name: "Update the roster too?",
    });
    const whoToNotify = page.getByRole("dialog", {
      name: "Select who to notify",
    });

    // Post: the roster question comes first.
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("Team 1");
    await expect(question).toContainText("06:00 to 14:00");
    await expect(question).toContainText("1 change between Day and Arvo");
    // No: the roster is left alone and the notify step carries on.
    await question.getByRole("button", { name: "No" }).click();
    await expect(whoToNotify).toBeVisible();
    expect(await rosterShift()).toMatchObject({ shiftCode: "d" });
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // A No is not remembered: the next Post asks again while they differ.
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // Yes updates the roster: an Arvo from 14:00.
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(question).toBeVisible();
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "a",
      shiftTime: "14:00",
    });

    // Now they agree, so there is nothing to ask.
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(whoToNotify).toBeVisible();
    await expect(question).toHaveCount(0);
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // A team's rest day on the roster that the tasking now has working: the
    // question is asked too, and Yes makes it a working shift.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "r",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("on a rest day to 14:00");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "a",
      shiftTime: "14:00",
    });

    // The team's shift is taken off the tasking again (RDO): the roster goes
    // back to the rest day it was, after the question.
    const tasked = async (shiftTime: string) =>
      call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex: 0,
        teamRow: "surv1",
        shiftTime,
        primaryTask: shiftTime === "RDO" ? null : "RAVEN",
      });
    await tasked("RDO");
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("back to a rest day");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "r",
      shiftTime: null,
    });

    // A shift anyone set by hand is not touched: with the roster on a Day
    // shift the team being RDO on the tasking asks nothing.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(whoToNotify).toBeVisible();
    await expect(question).toHaveCount(0);
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // Rest on-call ("o") works the same way: it becomes Arvo on-call, and goes
    // back to Rest on-call when the tasking has no shift again.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "o",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await tasked("1400-2200");
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("on Rest on-call to 14:00");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "aoc",
      shiftTime: "14:00",
    });
    await tasked("RDO");
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/ }).click();
    await expect(question).toContainText("back to Rest on-call");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "o",
      shiftTime: null,
    });
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking Timeline: Save after sliding a bar asks about the roster, Yes moves the on-duty member's start", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const W = "2040-06-11"; // a Monday, a made-up week
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";
  let rosterTeams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  let addedTeam = false;
  if (!rosterTeams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    addedTeam = true;
    rosterTeams = await get("ctoRoster.teams.list");
  }
  const rosterTeam = rosterTeams.find(t => t.name === "Team 1")!;
  let members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  let addedMemberId: number | null = null;
  if (!members.some(m => m.cin === cin)) {
    const r = await call("ctoRoster.members.add", {
      cin,
      teamId: rosterTeam.id,
    });
    addedMemberId = r.result?.data.json.memberId ?? null;
    members = (await get("ctoRoster.members.list")) as typeof members;
  }
  const member = members.find(m => m.cin === cin)!;

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // The roster and the tasking agree: Day shift, 06:00.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });
    await page.addInitScript(() =>
      localStorage.setItem("runlog.taskingView", "cal-timeline")
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 11 Jun/).click();
    const editBtn = page.getByRole("button", {
      name: "Edit Tasking",
      exact: true,
    });
    await editBtn.click();

    // Slide Team 1's bar two hours later, then Save.
    const bar = page.locator(".tcv-bar", { hasText: "RAVEN" }).first();
    const box = (await bar.boundingBox())!;
    const lane = (await bar.locator("xpath=..").boundingBox())!;
    const hour = lane.width / 19;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + hour,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.move(
      box.x + box.width / 2 + 2 * hour,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.up();
    await expect(bar).toContainText("0800–1700");
    const question = page.getByRole("dialog", {
      name: "Update the roster too?",
    });
    const rosterRow = async () =>
      (
        (await get("ctoRoster.roster.getRange", {
          startDate: W,
          endDate: W,
        })) as {
          memberId: number;
          shiftCode: string;
          shiftTime: string | null;
        }[]
      ).find(r => r.memberId === member.id);

    // The week is not posted, so it is a draft: the button says Save draft,
    // and saving only saves. No roster question, no change to the roster.
    await expect(page.getByTestId("week-draft-badge")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save draft" }).first()
    ).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).first().click();
    await expect(page.getByText(/Draft saved/)).toBeVisible();
    await expect(question).toHaveCount(0);
    expect(await rosterRow()).toMatchObject({
      shiftCode: "d",
      shiftTime: null,
    });

    // Once posted, Save is a plain Save and asks the roster question.
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.reload();
    await page.getByText(/CTO Weekly Tasking — 11 Jun/).click();
    await expect(page.getByTestId("week-draft-badge")).toHaveCount(0);
    await editBtn.click();
    {
      const b = (await bar.boundingBox())!;
      const l = (await bar.locator("xpath=..").boundingBox())!;
      const h = l.width / 19;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + h / 2, b.y + b.height / 2, {
        steps: 4,
      });
      await page.mouse.move(b.x + b.width / 2 + h, b.y + b.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
    }
    await expect(bar).toContainText("0900–1800");
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(
      0
    );
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("06:00 to 09:00");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();

    // Still a Day shift (09:00 is before midday), now starting at 09:00.
    expect(await rosterRow()).toMatchObject({
      shiftCode: "d",
      shiftTime: "09:00",
    });

    // Every save asks again: slide on, Save, No; slide on, Save, No; and then
    // back to a start already answered No to, which asks as well.
    const slideLater = async (hours: number) => {
      await editBtn.click(); // Save leaves edit mode: Edit again
      const b = (await bar.boundingBox())!;
      const l = (await bar.locator("xpath=..").boundingBox())!;
      const h = l.width / 19;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        b.x + b.width / 2 + (h * hours) / 2,
        b.y + b.height / 2,
        { steps: 4 }
      );
      await page.mouse.move(b.x + b.width / 2 + h * hours, b.y + b.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
      await page
        .getByRole("button", { name: /^Save( draft)?$/ })
        .first()
        .click();
    };
    await slideLater(1); // 10:00
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(question).toHaveCount(0); // closed, the bar is free again
    await slideLater(1); // 11:00
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(question).toHaveCount(0);
    await slideLater(-1); // 10:00 again, answered No before
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(question).toHaveCount(0);
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking: an EA breach on the roster shows as a red dot on the team-day in every layout, with the issue in a popover", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2040-07-02"; // a Monday, a made-up week
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";
  let rosterTeams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  let addedTeam = false;
  if (!rosterTeams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    addedTeam = true;
    rosterTeams = await get("ctoRoster.teams.list");
  }
  const rosterTeam = rosterTeams.find(t => t.name === "Team 1")!;
  let members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  let addedMemberId: number | null = null;
  if (!members.some(m => m.cin === cin)) {
    const r = await call("ctoRoster.members.add", {
      cin,
      teamId: rosterTeam.id,
    });
    addedMemberId = r.result?.data.json.memberId ?? null;
    members = (await get("ctoRoster.members.list")) as typeof members;
  }
  const member = members.find(m => m.cin === cin)!;

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // A 14-hour Day shift on the Monday breaks the 12-hour limit; Team 1 is
    // tasked that day.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      shiftDurationHours: 14,
      memberName: "E2E Officer",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    // The server finds the breach, and a plain (non-admin) read works too.
    const found = (await get("ctoRoster.eba.taskingBreaches")) as {
      memberId: number;
      dates: string[];
    }[];
    expect(
      found.some(f => f.memberId === member.id && f.dates.includes(W))
    ).toBe(true);

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 02 Jul/).click();
    await expect(page.getByTestId("tasking-breach-chip")).toContainText(
      /EA breach/
    );
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    for (const layout of [
      "Banded columns",
      "Schedule tables",
      "Calendar",
      "Timeline",
    ]) {
      await picker.click();
      await page.getByRole("option", { name: layout }).click();
      await expect(page.getByTestId("tasking-breach-dot")).toHaveCount(1);
    }

    // Click the dot: the rule, its reference and who it is about.
    await page.getByTestId("tasking-breach-dot").click();
    const pop = page.getByTestId("tasking-breach-popover");
    await expect(pop).toContainText("EA compliance issue");
    await expect(pop).toContainText("Open Mon on the roster");

    // It is the same on a phone.
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByTestId("tasking-breach-dot")).toHaveCount(1);

    // The roster link opens the roster.
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.getByTestId("tasking-breach-dot").click();
    await page.getByRole("button", { name: "Open Mon on the roster" }).click();
    await expect(page).toHaveURL(/\/cto-roster\?date=2040-07-02/);
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      shiftDurationHours: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking Timeline: a Day shift is 9 hours (0600-1500) and choosing Admin makes it 8 hours (0700-1500), and back", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-09-03"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  // A real operation, so it is one of the menu's choices to switch back to.
  const opName = `E2E NINE HOUR ${Date.now()}`;
  const createdName = `E2E CREATED ${Date.now()}`;
  const made = (
    await (await call("operation.create", { name: opName })).json()
  )[0].result.data.json;
  const opId = typeof made === "number" ? made : (made.id ?? made.operationId);
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: opName,
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 1,
      teamRow: "surv1",
      shiftTime: "1300-2200",
      primaryTask: opName,
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 2,
      teamRow: "surv1",
      shiftTime: "0600-1400",
      primaryTask: "Admin",
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 03 Sep/).click();
    await page.getByRole("combobox", { name: "Calendar view" }).click();
    await page.getByRole("option", { name: "Timeline" }).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    const monday = page.locator(".tcv-bar", { hasText: "0600–1500" });
    const tuesday = page.locator(".tcv-bar", { hasText: "1300–2200" });
    await expect(monday).toHaveCount(1);
    await expect(tuesday).toHaveCount(1);
    const menu = page.getByRole("menu", { name: /Operation for/ });

    // Admin on the 9-hour Day shift: 8 hours, 0700-1500.
    await monday.click();
    await menu.getByRole("menuitemradio", { name: "Admin" }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "Admin" }).first()
    ).toContainText("0700–1500");
    // And back to an operation: the 9-hour Day shift again.
    const admin = page.locator(".tcv-bar", { hasText: "Admin" }).first();
    await admin.click();
    await menu.getByRole("menuitemradio", { name: opName }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: opName }).first()
    ).toContainText("0600–1500");

    // An Arvo shift chosen as Admin keeps its start and is 8 hours.
    await tuesday.click();
    await menu.getByRole("menuitemradio", { name: "Admin" }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "Admin" }).first()
    ).toContainText("1300–2100");

    // An 8-hour Admin shift at another start (0600-1400) gains its hour back
    // when changed to an operation.
    // (Team 1's Admin bar only: PTT and Capability's standard shift is 0600-1400.)
    const wed = page
      .locator(".tcv-bar", { hasText: "0600–1400" })
      .filter({ hasText: "Admin" });
    await expect(wed).toHaveCount(1);
    // Scroll it into view first and let the scroll settle: a scroll that lands
    // after the click would close the menu again.
    await wed.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await wed.click();
    await menu.getByRole("menuitemradio", { name: opName }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "0600–1500" })
    ).toHaveCount(2);
    await expect(wed).toHaveCount(0);

    // None (under the line, with Admin and Other) clears the operation.
    const first = page.locator(".tcv-bar", { hasText: opName }).first();
    await first.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await first.click();
    await menu.getByRole("menuitemradio", { name: "None" }).click();
    await expect(
      page.getByRole("region", { name: "Unsaved timeline changes" })
    ).toContainText(`operation ${opName} to none`);

    // Create (above the line, with the operations) makes a new operation and
    // puts it on the bar.
    const bar = page
      .locator(".tcv-bar")
      .filter({ hasNotText: opName })
      .filter({ hasNotText: "Admin" })
      .first();
    await bar.click();
    await menu.getByRole("menuitem", { name: /Create operation/ }).click();
    await menu.getByLabel("New operation name").fill(createdName);
    await menu.getByRole("button", { name: "Create", exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(
      page.locator(".tcv-bar", { hasText: createdName })
    ).toHaveCount(1);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
    await call("operation.delete", { id: opId });
    const all = await (
      await page.request.get(
        `/api/trpc/operation.list?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: null } }))}`
      )
    ).json();
    const rows = (all[0]?.result?.data?.json ?? []) as {
      id: number;
      name: string;
    }[];
    for (const r of rows.filter(r => r.name === createdName))
      await call("operation.delete", { id: r.id });
  }
});

test("Team Duty Roster: the operation a team is tasked on shows on the tile of people on duty, once the week is posted", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2026-12-07"; // a Monday inside the roster's dates
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";
  let rosterTeams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  let addedTeam = false;
  if (!rosterTeams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    addedTeam = true;
    rosterTeams = await get("ctoRoster.teams.list");
  }
  const rosterTeam = rosterTeams.find(t => t.name === "Team 1")!;
  let members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  let addedMemberId: number | null = null;
  if (!members.some(m => m.cin === cin)) {
    const r = await call("ctoRoster.members.add", {
      cin,
      teamId: rosterTeam.id,
    });
    addedMemberId = r.result?.data.json.memberId ?? null;
    members = (await get("ctoRoster.members.list")) as typeof members;
  }
  const member = members.find(m => m.cin === cin)!;
  const name = "GREYFIN AURORA";

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: name,
    });
    await page.setViewportSize({ width: 1400, height: 900 });

    // Saved but not posted: no name on the tile.
    await page.goto(`/cto-roster?date=${W}`);
    await expect(page.getByText("E2E Officer").first()).toBeVisible();
    await expect(page.locator(".roster-cell-op")).toHaveCount(0);

    // Posted: the name shows in the middle of the tile, the second word on a
    // second line, and the tooltip has the whole name.
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.goto(`/cto-roster?date=${W}`);
    const tile = page.locator(".roster-cell-op", { hasText: name }).first();
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute("title", `Tasked: ${name}`);
    const lines = await tile.locator("span").evaluate(el => {
      const r = el.getBoundingClientRect();
      return Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight));
    });
    expect(lines).toBe(2);

    // Not on duty that day (a rest day): no name.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "r",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await page.goto(`/cto-roster?date=${W}`);
    await expect(page.getByText("E2E Officer").first()).toBeVisible();
    await expect(
      page.locator(".roster-cell-op", { hasText: name })
    ).toHaveCount(0);
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking Timeline on a phone and an iPad: a finger slides a bar sideways, drags up or down scroll the page, a tap opens the menu", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const W = "2040-11-05"; // a Monday, a made-up week
  for (const view of [
    { name: "phone", width: 390, height: 844 },
    { name: "iPad", width: 820, height: 1180 },
  ]) {
    const context = await browser.newContext({
      baseURL: baseURL ?? "http://localhost:3000",
      storageState: "e2e/.auth/user.json",
      viewport: { width: view.width, height: view.height },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const call = (proc: string, input: unknown) =>
      page.request.post(`/api/trpc/${proc}?batch=1`, {
        data: { "0": { json: input } },
      });
    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      });
    const drag = async (x0: number, y0: number, dx: number, dy: number) => {
      await touch("touchStart", x0, y0);
      for (let i = 1; i <= 12; i++) {
        await touch("touchMove", x0 + (dx * i) / 12, y0 + (dy * i) / 12);
        await page.waitForTimeout(16);
      }
      await touch("touchEnd", 0, 0);
    };
    await call("opManager.deleteWeek", { weekStart: W });
    try {
      await call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex: 0,
        teamRow: "surv1",
        shiftTime: "0600-1500",
        primaryTask: "RAVEN",
      });
      await page.goto("/operation-manager");
      await page.getByText(/CTO Weekly Tasking — 05 Nov/).click();
      await page.getByRole("combobox", { name: "Calendar view" }).click();
      await page.getByRole("option", { name: "Timeline" }).click();
      await page
        .getByRole("button", { name: "Edit Tasking", exact: true })
        .click();
      // Some browsers (iOS Safari) do not honour touch-action on the bar: the
      // slide must work without it.
      await page.addStyleTag({
        content: ".tcv-bar.tcv-edit{touch-action:auto !important}",
      });
      const bar = page.locator(".tcv-bar", { hasText: "RAVEN" }).first();
      await bar.evaluate(el => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(500);
      const mid = async () => {
        const b = (await bar.boundingBox())!;
        return { x: b.x + Math.min(b.width / 2, 120), y: b.y + b.height / 2 };
      };
      const saveBar = page.getByRole("region", {
        name: "Unsaved timeline changes",
      });

      // Sideways (a little off level, as a finger is): the bar moves.
      let p = await mid();
      await drag(p.x, p.y, 80, 12);
      await expect(bar, view.name).toContainText("0800–1700");
      await expect(saveBar, view.name).toContainText("1 change");
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(bar, view.name).toContainText("0600–1500");
      await page
        .getByRole("button", { name: "Edit Tasking", exact: true })
        .click();
      await page.addStyleTag({
        content: ".tcv-bar.tcv-edit{touch-action:auto !important}",
      });

      // Up or down: the page scrolls, the bar stays.
      const scrolled = () =>
        page.evaluate(
          () =>
            window.scrollY +
            (document.querySelector(".app-canvas")?.scrollTop ?? 0)
        );
      await bar.evaluate(el => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      const before = await scrolled();
      p = await mid();
      await drag(p.x, p.y, 0, -70);
      await expect(bar, view.name).toContainText("0600–1500");
      await expect(saveBar, view.name).toHaveCount(0);
      expect(await scrolled(), view.name).toBeGreaterThan(before);

      // A tap opens the operation menu.
      await bar.evaluate(el => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      p = await mid();
      await touch("touchStart", p.x, p.y);
      await touch("touchEnd", 0, 0);
      await expect(
        page.getByRole("menu", { name: /Operation for/ }),
        view.name
      ).toBeVisible();
    } finally {
      await call("opManager.deleteWeek", { weekStart: W });
      await context.close();
    }
  }
});

test("CTO Weekly Tasking Timeline: the time sits at the right by the team count on a phone, tablet and laptop, and never prints over long or two operation names", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-11-12"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    const cells: [number, string, string, string, string | null][] = [
      [0, "surv1", "1300-2200", "RAVEN", "GREYFIN"],
      [1, "surv1", "1100-2000", "OPERATION PINNACLE", "GREYFIN"],
      [2, "surv1", "0600-1500", "RAVEN", null],
    ];
    for (const [
      dayIndex,
      teamRow,
      shiftTime,
      primaryTask,
      secondaryTask,
    ] of cells)
      await call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex,
        teamRow,
        shiftTime,
        primaryTask,
        secondaryTask,
      });
    for (const teamRow of ["surv1", "surv2"])
      await call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex: 4,
        teamRow,
        shiftTime: "0600-1500",
        primaryTask: "RAVEN",
        secondaryTask: "GREYFIN",
        blended: true,
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 12 Nov/).click();
    await page.getByRole("combobox", { name: "Calendar view" }).click();
    await page.getByRole("option", { name: "Timeline" }).click();
    // The four saved bars, and PTT and Capability's standard shift Monday to Friday.
    await expect(page.locator(".tcv-bar")).toHaveCount(14);
    for (const [width, height] of [
      [390, 844],
      [820, 1180],
      [1400, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator(".tcv-bar")).toHaveCount(14);
      const clashes = await page.evaluate(() => {
        const out: string[] = [];
        for (const bar of Array.from(document.querySelectorAll(".tcv-bar"))) {
          const t = bar.querySelector(".t");
          if (!t) continue;
          const tb = t.getBoundingClientRect();
          const count = bar.querySelector(".tcv-count, .tcv-count-pair");
          // The time is at the right, after the operations and before the count.
          for (const e of Array.from(
            bar.querySelectorAll(".tcv-op, .ab, .tcv-count, .tcv-count-pair")
          )) {
            const r = e.getBoundingClientRect();
            const apart =
              r.right <= tb.left + 0.5 ||
              r.left >= tb.right - 0.5 ||
              r.bottom <= tb.top ||
              r.top >= tb.bottom;
            if (!apart) out.push(`${bar.textContent} / ${e.className}`);
          }
          const bb = bar.getBoundingClientRect();
          if (count && tb.right > count.getBoundingClientRect().left + 0.5)
            out.push(`${bar.textContent}: time is not before the count`);
          if (tb.left < bb.left)
            out.push(`${bar.textContent}: time outside bar`);
        }
        return out;
      });
      expect(clashes, `at ${width}px`).toEqual([]);
    }
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("CTO Weekly Tasking: Edit makes every layout editable in place, Cancel puts it back, Save keeps the changes and leaves edit mode", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const W = "2040-10-08"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  const opName = `E2E EDIT ${Date.now()}`;
  const made = (
    await (await call("operation.create", { name: opName })).json()
  )[0].result.data.json;
  const opId = typeof made === "number" ? made : (made.id ?? made.operationId);
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: opName,
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 1,
      teamRow: "ptt",
      shiftTime: "0600-1500",
      primaryTask: opName,
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 08 Oct/).click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    const choose = async (layout: string) => {
      await picker.click();
      await page.getByRole("option", { name: layout }).click();
    };
    const edit = page.getByRole("button", {
      name: "Edit Tasking",
      exact: true,
    });
    const summary = page.getByRole("region", {
      name: "Unsaved timeline changes",
    });
    const menu = page.getByRole("menu", { name: /Operation for/ });

    // Read only until Edit: no drop-downs.
    await choose("Banded columns");
    await expect(page.locator(".tcv-sel")).toHaveCount(0);
    await edit.click();
    await expect(page.getByLabel("Shift T1 · Mon")).toHaveValue("0600-1500");
    await expect(
      page.getByRole("button", { name: /^Save( draft)?$/ }).first()
    ).toBeDisabled();

    // Banded: a shift from the drop-down, and an operation from the menu.
    await page.getByLabel("Shift T1 · Mon").selectOption("1300-2200");
    await expect(summary).toContainText("1 change");
    await expect(summary).toContainText("0600–1500 to 1300–2200");
    // The banner has its own Save (as well as the one at the top), on every
    // screen size, so an admin never has to scroll up to save.
    await expect(
      summary.getByRole("button", { name: /^Save( draft)?$/ })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Primary operation T1 · Mon" })
      .click();
    await menu.getByRole("menuitemradio", { name: "None" }).click();
    await expect(summary).toContainText(`operation ${opName} to none`);

    // Schedule tables: the same changes are there, and a second one is made.
    await choose("Schedule tables");
    await expect(page.getByLabel("Shift T1 · Mon")).toHaveValue("1300-2200");
    await page.getByLabel("Shift T2 · Wed").selectOption("0600-1500");
    await expect(summary).toContainText("3 changes");

    // Calendar view: tap a team line for the editor; the shift chips change it.
    await choose("Calendar");
    await page.getByRole("button", { name: "Edit Team 2 Thu" }).click();
    await page.getByRole("button", { name: /^1000–1800/ }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(summary).toContainText("4 changes");

    // Timeline: its bars are editable too.
    await choose("Timeline");
    await expect(page.locator(".tcv-bar.tcv-edit").first()).toBeVisible();

    // A new operation can be made from the menu and set in one step.
    await choose("Banded columns");
    const wedOp = page.getByRole("button", {
      name: "Primary operation T2 · Wed",
    });
    // Scroll to it first and let that settle: a scroll that lands after the
    // click would close the menu again.
    await wedOp.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await wedOp.click();
    await menu.getByRole("menuitem", { name: /Create operation/ }).click();
    const created = `E2E EDIT NEW ${Date.now()}`;
    await menu.getByLabel("New operation name").fill(created);
    await menu.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Primary operation T2 · Wed" })
    ).toContainText(created);

    // Cancel: every change goes and edit mode ends.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(summary).toHaveCount(0);
    await expect(page.locator(".tcv-sel")).toHaveCount(0);
    await edit.click();
    await expect(page.getByLabel("Shift T1 · Mon")).toHaveValue("0600-1500");
    await expect(page.getByLabel("Shift T2 · Wed")).toHaveValue("");

    // Save: kept, and edit mode ends.
    await page.getByLabel("Shift T1 · Mon").selectOption("1300-2200");
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(page.getByText(/Saved 1 change\.|Draft saved/)).toBeVisible();
    await expect(edit).toBeVisible();
    await expect(page.locator(".tcv-sel")).toHaveCount(0);
    await page.reload();
    await page.getByText(/CTO Weekly Tasking — 08 Oct/).click();
    await choose("Banded columns");
    await expect(
      page.locator(".tcv-pa-col", { hasText: "1300–2200" }).first()
    ).toBeVisible();
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
    await call("operation.delete", { id: opId });
    const all = await (
      await page.request.get(
        `/api/trpc/operation.list?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: null } }))}`
      )
    ).json();
    const rows = (all[0]?.result?.data?.json ?? []) as {
      id: number;
      name: string;
    }[];
    for (const r of rows.filter(r => r.name.startsWith("E2E EDIT NEW")))
      await call("operation.delete", { id: r.id });
  }
});

test("CTO Weekly Tasking: PTT and Capability start the week at 0600-1400 Monday to Friday and RDO at the weekend, even when only other cells were saved", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-12-03"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // Only one Team 1 cell is saved, so PTT and Capability have no saved cells.
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
    });
    await call("opManager.savePriorityBoard", {
      weekStart: W,
      rows: [
        { category: "WC", priority: 1, operationName: "RAVEN", sortOrder: 0 },
      ],
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 03 Dec/).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    for (const team of ["PTT", "CAP"]) {
      await expect(page.getByLabel(`Shift ${team} · Mon`)).toHaveValue(
        "0600-1400"
      );
      await expect(page.getByLabel(`Shift ${team} · Fri`)).toHaveValue(
        "0600-1400"
      );
      await expect(page.getByLabel(`Shift ${team} · Sat`)).toHaveValue("RDO");
      await expect(page.getByLabel(`Shift ${team} · Sun`)).toHaveValue("RDO");
    }
    // Showing them is not a change: there is nothing unsaved.
    await expect(
      page.getByRole("region", { name: "Unsaved timeline changes" })
    ).toHaveCount(0);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("CTO Weekly Tasking: the full view has Edit Tasking and Edit Contacts & Priorities and no Delete; the details page has no Tasking tab and Save takes you back to the full view", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-11-19"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("opManager.savePriorityBoard", {
      weekStart: W,
      rows: [
        { category: "WC", priority: 1, operationName: "RAVEN", sortOrder: 0 },
      ],
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 19 Nov/).click();
    await expect(
      page.getByRole("button", { name: "Edit Tasking", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Edit Contacts & Priorities/ })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await page
      .getByRole("button", { name: /Edit Contacts & Priorities/ })
      .click();
    await expect(page.getByRole("tab", { name: "On-Call" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Priority" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tasking" })).toHaveCount(0);
    // Delete stays here, on the details page.
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

    // Save (on any tab) saves on-call, contacts and priority, then shows the full view.
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Tasking", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Weekly Tasking Calendar")).toBeVisible();
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("Team Duty Roster: a roster that is already open picks up a tasking change by itself within about half a minute", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2026-12-14"; // a Monday inside the roster's dates
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";
  let rosterTeams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  let addedTeam = false;
  if (!rosterTeams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    addedTeam = true;
    rosterTeams = await get("ctoRoster.teams.list");
  }
  const rosterTeam = rosterTeams.find(t => t.name === "Team 1")!;
  let members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  let addedMemberId: number | null = null;
  if (!members.some(m => m.cin === cin)) {
    const r = await call("ctoRoster.members.add", {
      cin,
      teamId: rosterTeam.id,
    });
    addedMemberId = r.result?.data.json.memberId ?? null;
    members = (await get("ctoRoster.members.list")) as typeof members;
  }
  const member = members.find(m => m.cin === cin)!;
  const cell = (primaryTask: string) =>
    call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask,
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await cell("FIRST");
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`/cto-roster?date=${W}`);
    await expect(
      page.locator(".roster-cell-op", { hasText: "FIRST" }).first()
    ).toBeVisible();

    // The tasking changes somewhere else; this screen is left alone.
    await cell("SECOND");
    await expect(
      page.locator(".roster-cell-op", { hasText: "SECOND" }).first()
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      page.locator(".roster-cell-op", { hasText: "FIRST" })
    ).toHaveCount(0);
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("Side menu: the main folders have a helper line under their name", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.locator("[data-sidebar='menu']").first();
  for (const [name, helper] of [
    ["Operations", "Running Sheets & Summaries"],
    ["Governance", "Outstanding Actions"],
    ["Mapping", "Map & Map Settings"],
    ["Images", "All Images"],
    ["Intelligence", "Profiles & Reports"],
    ["Target Registry", "Add & Edit"],
  ]) {
    const item = menu
      .getByRole("button")
      .filter({ hasText: helper })
      .filter({ hasText: name })
      .first();
    await expect(item, `${name} shows "${helper}"`).toBeVisible();
  }
});
