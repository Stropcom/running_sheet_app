// The Target Logger when the target steps out the front of a place and stays
// there (phone call): the card says he is out the front, offers "Returned
// inside" (walked back to the place) and keeps "Walked to another location" and
// the walk to the vehicle — but not "Entered a location" or "Inside"
// (shared/outFront.ts).
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("out the front: Returned inside, Walked to another location and the vehicle, no Entered / Inside", async ({
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
    name: `Out front ${Date.now()}`,
  });
  const opId = op.id ?? op.operationId ?? op;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const target = await post("target.create", {
    operationId: opId,
    name: `SANTOS Front ${Date.now()}`,
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
    "Vehicle 1EMB303, SANTOS driver and sole occupant, arrived at 21 Hope Road, PERTH WA (21 Hope Road) and parked on the street."
  );
  await row(
    "SANTOS exited the vehicle, entered 21 Hope Road and continued out of sight."
  );
  await row(
    "SANTOS exited 21 Hope Road, stood out the front was talking on a mobile phone."
  );
  await page.goto(`/sheet/${sheetId}`);
  await page.getByText("Target Logger", { exact: true }).first().click();

  // Out the front of 21 Hope Road, not "departed on foot".
  await expect(page.getByText("Out the front", { exact: true })).toBeVisible();
  await expect(page.getByText("Departed on foot")).toHaveCount(0);
  await expect(
    page.getByText(/Out the front of 21 Hope Road/).first()
  ).toBeVisible();

  // The buttons: back inside, on elsewhere, or to the vehicle.
  const back = page.getByRole("button", {
    name: "Returned inside",
    exact: true,
  });
  await expect(back).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Walked to another location",
      exact: true,
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Walked to 1EMB303$/ })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entered a location", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Inside", exact: true })
  ).toHaveCount(0);

  // Returned inside writes the sentence for the officer to save.
  await back.click();
  const box = page.locator("textarea").first();
  await expect(box).toBeVisible();
  await expect(box).toHaveValue(
    "SANTOS walked back to 21 Hope Road and continued out of sight."
  );
  await page.mouse.click(700, 620);

  // He is inside 21 Hope Road again: the out-the-front card is gone and the
  // vehicle's card has him inside the address.
  await expect(page.getByText("Out the front", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SANTOS inside the address")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Left address", exact: true })
  ).toBeVisible();
});
