// Search on the Operations page finds the running sheet LINE, not just the
// operation: each result shows the sheet, the time and the officer's own words
// with the match picked out, and opens that sheet scrolled to that line.
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

test("Search finds a running sheet line and opens the sheet at that line", async ({
  page,
}) => {
  const word = `zqsuit${Date.now().toString(36)}`;
  const { sheetId } = await createOperationAndSheet(page);
  await addRowWithObservation(
    page,
    `FRASER retrieved the ${word} from the boot.`,
    word
  );
  await addRowWithObservation(
    page,
    "WATANABE walked to the shop.",
    "walked to the shop"
  );
  await addRowWithObservation(
    page,
    `A male carried a second ${word} to the car.`,
    "second " + word
  );
  const saved = page.waitForResponse(
    r => /row\.update/.test(r.url()) && r.status() === 200
  );
  await page.mouse.click(700, 90);
  await saved;

  await page.goto("/");
  await page.getByPlaceholder(/Search operations, sheets/).fill(word);
  const hits = page.getByTestId("search-hit");
  await expect(hits).toHaveCount(2);
  // Each result: the sheet, the time, and the words with the match picked out.
  await expect(hits.first()).toContainText(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  await expect(hits.first().locator("mark")).toContainText(word);
  await expect(page.getByTestId("search-hits")).toContainText(
    "Running sheet lines"
  );

  // Open the second line: the sheet opens with that line highlighted.
  await hits.nth(1).click();
  await page.waitForURL(new RegExp(`/sheet/${sheetId}`));
  const row = page.locator("tbody tr").filter({ hasText: `second ${word}` });
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/row-check-highlight/);
});
