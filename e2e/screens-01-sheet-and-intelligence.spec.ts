// Rows, Intelligence, the operation page, Governance, Add Target and the sheet toolbar.
// Split out of the old e2e/screens.spec.ts (v2.83.4); the tests are unchanged.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import {
  USERNAME,
  PASSWORD,
  addRowWithObservation,
  createOperationAndSheet,
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
