// On a phone or tablet the observation opens WITHOUT the on-screen keyboard (so
// the shortcut chips and the row stay in view while chips are tapped), and the
// keyboard icon in the sheet's toolbar switches the keyboard on and off — off by
// default and again whenever a row closes, and every new row opens by itself
// with the cursor in it. Tapping in the text does nothing special (the old "tap again for the
// keyboard" is gone). On a laptop / desktop the cell types straight away and
// there is no keyboard icon. The keyboard itself cannot be seen in a test, so
// this checks the field's `inputmode`, which is what tells the browser whether to
// raise it ("none" = no keyboard).
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD, createOperationAndSheet } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe("touch device", () => {
  test.use({ hasTouch: true });

  test("the keyboard icon switches the keyboard on and off, off by default and again whenever a row closes; a second tap in the text does nothing", async ({
    page,
  }) => {
    await createOperationAndSheet(page);
    const toggle = page.getByTestId("keyboard-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // The first row of a sheet opens by itself (with the opening sentence),
    // without the keyboard.
    await page.getByRole("button", { name: "Add Row" }).click();
    const first = page.locator("textarea").first();
    await expect(first).toBeVisible();
    await expect(first).toHaveAttribute("inputmode", "none");
    await first.fill("First row of the sheet");
    await page.mouse.click(700, 620);
    await expect(
      page.locator("tbody tr").filter({ hasText: "First row of the sheet" })
    ).toHaveCount(1);

    // A later row opens by itself, empty, with the cursor in it — no keyboard.
    await page.getByRole("button", { name: "Add Row" }).click();
    const box = page.locator("textarea").first();
    await expect(box).toBeVisible();
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute("inputmode", "none");
    expect(
      await box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)
    ).toBe(0);

    // Tapping in the text again no longer brings the keyboard.
    await box.click();
    await expect(box).toHaveAttribute("inputmode", "none");
    await expect(box).toBeFocused();

    // The icon switches it on for the open cell, which stays open and focused.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => await box.getAttribute("inputmode"))
      .not.toBe("none");
    await expect(box).toBeFocused();
    await box.fill("Typed with the keyboard on");

    // And off again, still the same open cell with its text.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(box).toHaveAttribute("inputmode", "none");
    await expect(box).toBeFocused();
    await expect(box).toHaveValue("Typed with the keyboard on");

    // Nothing was saved or closed by the re-focus; leaving the cell saves it.
    await page.mouse.click(700, 620);
    await expect(
      page.locator("tbody tr").filter({ hasText: "Typed with the keyboard on" })
    ).toHaveCount(1);

    // The keyboard goes back to off when a row closes: switch it on in the next
    // new row, leave the row, and the icon is off again.
    await page.getByRole("button", { name: "Add Row" }).click();
    const next = page.locator("textarea").first();
    await expect(next).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => await next.getAttribute("inputmode"))
      .not.toBe("none");
    await page.locator("h1").first().click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    // So the next new row opens without the keyboard again.
    await page.getByRole("button", { name: "Add Row" }).click();
    const again = page.locator("textarea").first();
    await expect(again).toBeVisible();
    await expect(again).toHaveAttribute("inputmode", "none");
  });
});

test.describe("laptop / desktop", () => {
  test("the observation types straight away, no keyboard switch", async ({
    page,
  }) => {
    await createOperationAndSheet(page);
    await expect(page.getByTestId("keyboard-toggle")).toHaveCount(0);
    // The first row of a sheet opens by itself, ready to type.
    await page.getByRole("button", { name: "Add Row" }).click();
    const first = page.locator("textarea").first();
    await expect(first).toBeVisible();
    expect(await first.getAttribute("inputmode")).not.toBe("none");
    await first.fill("First row of the sheet");
    await page.mouse.click(700, 620);
    await expect(
      page.locator("tbody tr").filter({ hasText: "First row of the sheet" })
    ).toHaveCount(1);
    // A later row opens by itself, empty, the cursor in it.
    await page.getByRole("button", { name: "Add Row" }).click();
    const box = page.locator("textarea").first();
    await expect(box).toBeVisible();
    await expect(box).toBeFocused();
    expect(await box.getAttribute("inputmode")).not.toBe("none");
  });
});
