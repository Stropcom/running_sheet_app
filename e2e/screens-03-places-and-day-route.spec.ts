// Places Report, Day Route and the Summary PDF.
// Split out of the old e2e/screens.spec.ts (v2.83.4); the tests are unchanged.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD, createOperationAndSheet } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe.configure({ mode: "serial" });

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
