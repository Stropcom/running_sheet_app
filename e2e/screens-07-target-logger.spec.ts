// The first row, Add Row, Cease and the Target Logger walk-in and vehicle rules.
// Split out of the old e2e/screens.spec.ts (v2.83.4); the tests are unchanged.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD, openNewRowCell } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe.configure({ mode: "serial" });

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
  // (It opens by itself, empty, with the cursor in it.)
  const second = page
    .locator("tbody tr")
    .filter({ hasNotText: "Surveillance commenced" });
  await expect(second).toHaveCount(1);
  await expect(second.locator("textarea")).toBeFocused();
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
