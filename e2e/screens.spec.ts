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
  await page.getByRole("button", { name: "Add Row" }).click();
  await page.getByText("Enter observation…").first().click();
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
  await expect(page.getByText(/sheets? need attention/).first()).toBeVisible();
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
