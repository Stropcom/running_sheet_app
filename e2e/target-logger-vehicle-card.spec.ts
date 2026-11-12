// The Target Logger's vehicle card: the buttons are named "Tgt to <rego>" and
// "<rego> Depart", and a depart pressed while the driver is still logged inside
// the address carries on from how the vehicle arrived instead of "unseen
// occupant/s" (shared/vehicleCardWording.ts).
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("Tgt to <rego>, <rego> Depart, and a depart with the driver inside carries on from the arrival", async ({
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
    name: `Vehicle card ${Date.now()}`,
  });
  const opId = op.id ?? op.operationId ?? op;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  // A person target, so SANTOS is "Tgt".
  const target = await post("target.create", {
    operationId: opId,
    name: `SANTOS Vehicle ${Date.now()}`,
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
  const row = (observation: string) =>
    post("row.create", { sheetId, observation });
  await row(
    "Vehicle 1EMB303, SANTOS driver and sole occupant, arrived at 45 Haselmere Circus, ROCKINGHAM WA (45 Haselmere Circus) and parked in the driveway."
  );
  await row(
    "SANTOS exited the vehicle, entered 45 Haselmere Circus and continued out of sight."
  );
  await page.goto(`/sheet/${sheetId}`);
  await page.getByText("Target Logger", { exact: true }).first().click();

  // The buttons.
  await expect(
    page.getByRole("button", { name: "Tgt to 1EMB303", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Walked to Vehicle", exact: true })
  ).toHaveCount(0);
  const depart = page.getByRole("button", {
    name: "1EMB303 Depart",
    exact: true,
  });
  await expect(depart).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vehicle Depart", exact: true })
  ).toHaveCount(0);

  // Depart without "Tgt to" first: the row carries on from the arrival.
  await depart.click();
  const departed = page
    .locator("tbody tr")
    .filter({ hasText: "departed 45 Haselmere Circus" });
  await expect(departed).toHaveCount(1);
  await expect(departed).toContainText(
    "Vehicle 1EMB303, SANTOS driver and sole occupant, departed"
  );
  await expect(departed).not.toContainText("unseen occupant");
});
