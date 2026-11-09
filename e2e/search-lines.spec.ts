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

test("Search inside an operation finds the lines too, and opens the sheet at that line", async ({
  page,
}) => {
  const word = `zqbag${Date.now().toString(36)}`;
  const { opId, sheetId } = await createOperationAndSheet(page);
  await addRowWithObservation(
    page,
    `WATANABE carried a ${word} to the car.`,
    word
  );
  // The row saves when its cell closes; wait until the sheet list can find it.
  await page.goto(`/operation/${opId}`);
  const box = page.getByPlaceholder(/Search sheets by title/);
  await expect(async () => {
    await box.fill("");
    await box.fill(word);
    await expect(page.getByTestId("search-hit")).toHaveCount(1, {
      timeout: 3000,
    });
  }).toPass({ timeout: 20000 });
  await expect(page.getByTestId("search-hit").locator("mark")).toContainText(
    word
  );

  // A word that is nowhere says so, and a title search still filters sheets.
  await box.fill("zzznothingzzz");
  await expect(
    page.getByText(/No running sheet or line matches/)
  ).toBeVisible();
  await box.fill(word);
  await page.getByTestId("search-hit").click();
  await page.waitForURL(new RegExp(`/sheet/${sheetId}`));
  await expect(page.locator("tbody tr").filter({ hasText: word })).toHaveClass(
    /row-check-highlight/
  );
});

test("Every search box has an X that empties it and keeps the cursor in the box", async ({
  page,
}) => {
  const boxes: Array<[string, RegExp]> = [
    ["/", /Search operations, sheets/],
    ["/target-registry", /Search targets/],
    ["/audit", /Search by user, action/],
    ["/intelligence", /Search (entities, descriptions|operations…)/],
    ["/help", /Search help topics/],
  ];
  for (const [path, placeholder] of boxes) {
    await page.goto(path);
    const box = page.getByPlaceholder(placeholder);
    await expect(box, `${path} search box`).toBeVisible();
    // No X while the box is empty.
    await expect(
      page.getByRole("button", { name: "Clear search" })
    ).toHaveCount(0);
    await box.fill("something");
    const x = page.getByRole("button", { name: "Clear search" });
    await expect(x, `${path} X`).toBeVisible();
    await x.click();
    await expect(box).toHaveValue("");
    await expect(box).toBeFocused();
    await expect(x).toHaveCount(0);
  }
});
