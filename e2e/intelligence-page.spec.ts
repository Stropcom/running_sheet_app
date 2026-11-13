// The Intelligence page (Intelligence Folder): the Operations tab, the entity
// tabs, and an entity opening its profile page. Written before
// client/src/pages/Intelligence.tsx was split into pieces (v2.83.32) and passed
// on the old code.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD, createOperationAndSheet } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

const SURNAME = Array.from({ length: 8 }, () =>
  String.fromCharCode(65 + Math.floor(Math.random() * 26))
).join("");
const STREET = `${10 + Math.floor(Math.random() * 80)} Intelpage Street`;
const INTRO = `Observed Lawrence ${SURNAME} (${SURNAME}) walking to ${STREET}, PERTH WA (${STREET}).`;

test("the Intelligence page lists the operation, switches tabs, opens an entity's profile", async ({
  page,
}) => {
  const { sheetId } = await createOperationAndSheet(page);
  const made = await page.request.post("/api/trpc/row.create", {
    data: { json: { sheetId, observation: INTRO } },
  });
  expect(made.ok(), await made.text()).toBeTruthy();

  await page.goto("/intelligence");
  await expect(page.getByText("Intelligence Folder")).toBeVisible();
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);

  // Operations tab: the search box and the sort choices.
  await expect(page.getByPlaceholder("Search operations…")).toBeVisible();
  await expect(page.getByRole("button", { name: "A → Z" })).toBeVisible();
  const card = page
    .locator("div")
    .filter({ hasText: /Smoke \d+/i })
    .filter({ hasText: /1\s*sheet/i })
    .first();
  await expect(card).toBeVisible();

  // Each of the other tabs opens without the error screen.
  for (const name of [
    "Targets",
    "Associates",
    "Vehicles",
    "Locations",
    "Operations",
  ]) {
    await page.locator("div.grid-cols-5 button", { hasText: name }).click();
    await expect(page.getByText("An unexpected error occurred.")).toHaveCount(
      0
    );
  }

  // Locations: the address typed on the sheet, and its profile dialog.
  await page
    .locator("div.grid-cols-5 button", { hasText: "Locations" })
    .click();
  await page.getByPlaceholder(/Search entities/).fill(STREET);
  const place = page.getByText(STREET, { exact: false }).first();
  await expect(place).toBeVisible();
  await place.click();

  // A list item opens that entity's own profile page.
  await page.waitForURL(/\/intelligence\/location\//);
  await expect(page.getByText(STREET, { exact: false }).first()).toBeVisible();
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);
});
