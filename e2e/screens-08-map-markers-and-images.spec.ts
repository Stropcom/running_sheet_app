// Map Target Markers, RS Quick Entry, Add on a row, lifts and the Images folder.
// Split out of the old e2e/screens.spec.ts (v2.83.4); the tests are unchanged.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import {
  USERNAME,
  PASSWORD,
  createOperationAndSheet,
  makePng,
} from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe.configure({ mode: "serial" });

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
