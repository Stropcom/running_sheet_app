// The Map page: Search (the old Target Predictor), with the Google parts answered by the test.
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

// The pane's Search button starts a search for the team and is shaded while
// Search is on; pressing it while on leaves Search on this screen. This makes
// sure it is on without pressing it twice.
async function searchOn(page: import("@playwright/test").Page) {
  const button = page.getByRole("button", { name: "Search", exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true")
    await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

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
