// "Today" is a Perth date everywhere in the app. The New Running Sheet dialog used
// to work it out from the UTC clock, so between midnight and 8 am in Perth a new
// sheet defaulted to YESTERDAY's date (and its rows got no time stamp). The page's
// clock is set here so the test does not depend on the hour it is run at.
//
// Needs a running instance and an account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("the New Running Sheet date is today in Perth, at any hour", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const r = await page.request.post("/api/trpc/operation.create", {
    data: { json: { name: `Perth date ${Date.now()}` } },
  });
  expect(r.ok()).toBeTruthy();
  const op = (await r.json()).result.data.json;
  const opId = op.id ?? op.operationId ?? op;

  const defaultDateAt = async (instant: string) => {
    await page.clock.setFixedTime(new Date(instant));
    await page.goto(`/operation/${opId}`);
    await page
      .getByRole("button", { name: "New Running Sheet" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    const input = dialog.locator("input[type=date]");
    await expect(input).toBeVisible();
    const value = await input.inputValue();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    return value;
  };

  // 23:38 UTC on 12 Nov is 07:38 on 13 Nov in Perth (UTC+8, no daylight saving).
  expect(await defaultDateAt("2026-11-12T23:38:00Z")).toBe("2026-11-13");
  // One minute before Perth midnight is still the 12th; Perth midnight is the 13th.
  expect(await defaultDateAt("2026-11-12T15:59:00Z")).toBe("2026-11-12");
  expect(await defaultDateAt("2026-11-12T16:00:00Z")).toBe("2026-11-13");
  // The year turns over at Perth midnight too.
  expect(await defaultDateAt("2026-12-31T16:30:00Z")).toBe("2027-01-01");
});
