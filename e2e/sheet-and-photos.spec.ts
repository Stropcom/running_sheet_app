// Safety net for the running sheet screen (client/src/pages/SheetDetail.tsx)
// and the photo paths that hang off it. That screen is thousands of lines and
// is split up a piece at a time, so these tests pin down what an officer sees
// and does: rows save and survive a reload, a row can be edited, the sheet
// fits a phone, and a photo can be linked as an Item and found again in the
// Images folder. A change that breaks any of these should fail here, not on
// the droplet.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import {
  USERNAME,
  PASSWORD,
  addRowWithObservation,
  createOperationAndSheet,
  makePng,
} from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

// The tests below share one operation and sheet, so run them in order.
test.describe.configure({ mode: "serial" });

let opId = 0;
let sheetId = 0;

test("rows save, can be edited, and survive a reload", async ({ page }) => {
  ({ opId, sheetId } = await createOperationAndSheet(page));

  await addRowWithObservation(page, "Target seen leaving the address");
  await addRowWithObservation(page, "PHOTOGRAPHS TAKEN of the front door");
  await expect(page.locator("tbody tr")).toHaveCount(2);

  // Edit the first row's observation in place.
  await page.getByText("Target seen leaving the address").click();
  const box = page.locator("textarea").first();
  await box.fill("Target seen leaving the address on foot");
  await page.mouse.click(700, 620);
  await expect(
    page.locator("tbody tr").filter({ hasText: "on foot" })
  ).toHaveCount(1);

  // Saved, not just shown (the order of rows is not what is being tested).
  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "Target seen leaving the address on foot" })
  ).toHaveCount(1);
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "PHOTOGRAPHS TAKEN of the front door" })
  ).toHaveCount(1);
});

test("the sheet fits a phone and a tablet with no sideways scroll", async ({
  page,
}) => {
  for (const [width, height] of [
    [390, 844],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`/sheet/${sheetId}`);
    await expect(
      page.getByText("PHOTOGRAPHS TAKEN of the front door").first()
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow, `sideways scroll at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test("a photo linked as an Item shows its description and sits in the Images folder", async ({
  page,
}) => {
  await page.goto(`/sheet/${sheetId}`);
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "PHOTOGRAPHS TAKEN" })
    .first();

  // Pick a photo — it opens the link window and nothing is uploaded yet.
  await row.locator('input[type="file"]').setInputFiles({
    name: "bag.png",
    mimeType: "image/png",
    buffer: makePng(),
  });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(row.locator('img[alt="Attached photograph"]')).toHaveCount(0);

  // Describe it as an Item.
  await dialog.getByRole("button", { name: "Item", exact: true }).click();
  await dialog
    .getByLabel("Item description")
    .fill("Grey laptop bag, zip broken");
  await dialog.getByRole("button", { name: /Use this description/ }).click();
  await expect(dialog.getByText(/Will link as this item/)).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm upload" }).click();
  await expect(dialog).toBeHidden();

  // The photo is on the row with an Item pill; tapping it shows the text.
  await expect(row.locator('img[alt="Attached photograph"]')).toHaveCount(1);
  const pill = row.locator('button[aria-label="Item — show description"]');
  await expect(pill).toBeVisible();
  await pill.click();
  await expect(page.getByText("Grey laptop bag, zip broken")).toBeVisible();
  // It did not open the link editor: the only dialog is the small pop-over
  // (Radix gives it role="dialog"), and the link window's tabs are not there.
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Unidentified", exact: false })
  ).toHaveCount(0);

  // The same pill and description are in the Images folder.
  await page.keyboard.press("Escape");
  await page.goto(`/images/${opId}/${sheetId}`);
  const folderPill = page.locator(
    'button[aria-label="Item — show description"]'
  );
  await expect(folderPill).toBeVisible();
  await folderPill.click();
  await expect(page.getByText("Grey laptop bag, zip broken")).toBeVisible();
});
