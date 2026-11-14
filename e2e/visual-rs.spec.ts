// Visual RS (Intelligence → Reports, first tab): a picture at every flag
// change, text entries for the rest, the flag drawn as on the Map page, and a
// vehicle only where it has its own marker.
//
// Google Maps and Nearmap cannot be reached from the test environment, so the
// base map picture is a tiny stand-in; the rules, the frames and the overlay
// are the real ones. Needs a running instance and a real account — see
// e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("Visual RS is the first report; frames at flag changes, text entries between, vehicle only with a marker", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const stamp = Date.now();
  const op = await post("operation.create", { name: `Visual RS ${stamp}` });
  const opId = op.id ?? op.operationId ?? op;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const target = await post("target.create", {
    operationId: opId,
    name: `SANTOS Visual ${stamp}`,
    firstNames: "Miguel",
    surname: "SANTOS",
  });
  const sheet = await post("sheet.create", {
    operationId: opId,
    targetId: target.id ?? target.targetId ?? target,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  const place = `${stamp % 900} Marker Place`;
  const full = `${place}, TESTVILLE WA (${place})`;
  // The place has a marker (so it can be located without a geocoder); the
  // vehicle 1VRS11 has its own marker, 1VRS22 has none.
  await post("customMarker.create", {
    lat: -31.95,
    lng: 115.86,
    markerIcon: "house_filled",
    markerColour: "red",
    label: place,
    address: full,
    operationId: opId,
  });
  await post("customMarker.create", {
    lat: -31.9503,
    lng: 115.8603,
    markerIcon: "sedan",
    markerColour: "purple",
    label: "1VRS11",
    operationId: opId,
  });
  const row = (observation: string) =>
    post("row.create", { sheetId, observation });
  await row(`Surveillance commenced in the vicinity of ${full}.`);
  await row(
    `Vehicle 1VRS11, SANTOS driver and sole occupant, arrived at ${full} and parked on the street.`
  );
  await row("Nothing further observed at the premises.");
  await row(
    `SANTOS exited the vehicle, entered ${place} and continued out of sight.`
  );

  await page.route(/\/api\/trpc\/rsMapping\.getStaticMapImage/, async route => {
    const n = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",").length;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        Array.from({ length: n }, () => ({
          result: { data: { json: { dataUrl: PNG } } },
        }))
      ),
    });
  });

  await page.goto("/intelligence");
  // First among the reports.
  const reports = page.getByRole("button", {
    name: /^(Visual RS|Ego Network|Heat Map|Places|Day Route|Pattern of Life|Packages)$/,
  });
  await expect(reports.first()).toHaveText("Visual RS");
  await page.getByRole("button", { name: "Visual RS", exact: true }).click();
  await page.getByText("Select an operation…").click();
  await page.getByRole("option", { name: `Visual RS ${stamp}` }).click();
  await page.getByText("Select a running sheet…").click();
  await page.getByRole("option").first().click();

  // Three frames (commenced, in the vehicle, inside) and one text entry.
  await expect(page.locator(".vrs-item")).toHaveCount(4);
  await expect(page.getByText("3 pictures · 1 text-only entry")).toBeVisible();
  await expect(page.getByText("No flag change, no picture")).toHaveCount(1);
  // Each row's own observation is on the page, unaltered.
  await expect(
    page.getByText("Nothing further observed at the premises.")
  ).toBeVisible();

  // The flag, as the Map page words it.
  const flags = page.locator("svg[role=img]");
  await expect(flags.nth(0)).toHaveAttribute(
    "aria-label",
    /SANTOS · Commenced/
  );
  await expect(flags.nth(1)).toHaveAttribute(
    "aria-label",
    /SANTOS · in 1VRS11, vehicle 1VRS11 marked/
  );
  await expect(flags.nth(2)).toHaveAttribute("aria-label", /SANTOS · inside$/);
  // The vehicle has a marker: said so. After he is inside, no vehicle is shown.
  await expect(
    page.getByText("is shown: it has a marker on the map.").first()
  ).toBeVisible();

  // Export PDF opens the report in its own window with the notice, with no
  // controls and no "Why" buttons in it.
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await popupPromise;
  await pop.waitForLoadState("domcontentloaded");
  await expect(pop.locator(".vrs-item")).toHaveCount(4);
  await expect(pop.locator("body")).toContainText(
    "Not a certified evidentiary document"
  );
  await expect(pop.getByText("Why this frame?")).toHaveCount(0);
  await pop.close();

  // Switching the entries off leaves only the pictures.
  await page.getByLabel("Observations with no flag change").uncheck();
  await expect(page.locator(".vrs-item")).toHaveCount(3);
});
