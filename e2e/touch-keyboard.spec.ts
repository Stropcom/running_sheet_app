// On a phone or tablet the first tap on an observation opens it WITHOUT the
// on-screen keyboard (so the shortcut chips and the row stay in view while
// chips are tapped); a second tap in the text brings the keyboard up. On a
// laptop / desktop the cell types straight away. The keyboard itself cannot be
// seen in a test, so this checks the field's `inputmode`, which is what tells
// the browser whether to raise it ("none" = no keyboard).
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

test.describe("touch device", () => {
  test.use({ hasTouch: true });

  test("first tap opens the observation without the keyboard, second tap allows it", async ({
    page,
  }) => {
    await createOperationAndSheet(page);
    // The first row of a sheet opens by itself for typing; the case here is a
    // later, empty row that the officer taps into.
    await addRowWithObservation(page, "First row of the sheet");
    await page.getByRole("button", { name: "Add Row" }).click();
    await page.getByText("Enter observation…").first().click();

    const box = page.locator("textarea").first();
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute("inputmode", "none");
    await expect(box).toBeFocused();

    // Tapping into the text is the officer asking for the keyboard.
    await box.click();
    await expect
      .poll(async () => await box.getAttribute("inputmode"))
      .not.toBe("none");
    await expect(box).toBeFocused();

    // Still the same open cell — nothing was saved or closed by the re-focus.
    await box.fill("Keyboard came up on the second tap");
    await page.mouse.click(700, 620);
    await expect(
      page.locator("tbody tr").filter({ hasText: "second tap" })
    ).toHaveCount(1);
  });
});

test.describe("laptop / desktop", () => {
  test("the observation types straight away, no keyboard switch", async ({
    page,
  }) => {
    await createOperationAndSheet(page);
    // The first row of a sheet opens by itself for typing; the case here is a
    // later, empty row that the officer taps into.
    await addRowWithObservation(page, "First row of the sheet");
    await page.getByRole("button", { name: "Add Row" }).click();
    await page.getByText("Enter observation…").first().click();
    const box = page.locator("textarea").first();
    await expect(box).toBeVisible();
    expect(await box.getAttribute("inputmode")).not.toBe("none");
  });
});
