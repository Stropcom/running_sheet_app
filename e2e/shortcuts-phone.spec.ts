// The Shortcuts page on a phone: every row fits the screen (the trigger and its
// buttons on one line, the text stacked underneath at full width), nothing is cut
// off at the right, and on a laptop a row stays on one line.
//
// Needs a running instance and an admin account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("Shortcuts: on a phone each row fits and stacks, on a laptop it stays on one line", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: null } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const stamp = String(Date.now()).slice(-6);
  const triggers = [`zp${stamp}a`, `zp${stamp}b`];
  const long =
    "had a mobile phone to his ear and appeared to be in conversation on the phone.";
  await call("shortcuts.create", { trigger: triggers[0], expansion: long });
  await call("shortcuts.create", { trigger: triggers[1], expansion: "short" });
  const made = (await get("shortcuts.list")).filter((s: { trigger: string }) =>
    triggers.includes(s.trigger)
  ) as { id: number; trigger: string }[];
  try {
    for (const [width, height, stacked] of [
      [390, 844, true],
      [1280, 800, false],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/shortcuts");
      const row = page
        .getByText(triggers[0], { exact: true })
        .locator("xpath=ancestor::div[contains(@class,'flex')][1]");
      await expect(row).toBeVisible();
      await row.scrollIntoViewIfNeeded();

      // Nothing runs off the right-hand edge: the page does not scroll sideways
      // and the row's last button (delete) is wholly on screen.
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1
      );
      expect(fits, `${width}px: the page scrolls sideways`).toBe(true);
      const del = row.getByRole("button").last();
      const box = (await del.boundingBox())!;
      expect(
        box.x + box.width,
        `${width}px: delete is cut off`
      ).toBeLessThanOrEqual(width);

      // Stacked on a phone (the text sits below the trigger); one line on a laptop.
      const trig = (await page
        .getByText(triggers[0], { exact: true })
        .boundingBox())!;
      const text = (await page.getByText(long).first().boundingBox())!;
      if (stacked)
        expect(text.y, "phone: the text is under the trigger").toBeGreaterThan(
          trig.y + trig.height - 2
        );
      else
        expect(
          Math.abs(text.y - trig.y),
          "laptop: the text is on the trigger's line"
        ).toBeLessThan(40);
    }
  } finally {
    for (const s of made) await call("shortcuts.delete", { id: s.id });
  }
});
