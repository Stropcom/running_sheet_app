// The "Jump to" bar on the Intelligence profile pages (components/ProfileKit.tsx,
// JumpBar) must stay pinned at the top while the page scrolls, on a phone too.
//
// On an iPhone it did not: the bar was `position: sticky` AND its own horizontal
// scroller (`overflow-x: auto`), and Safari drops sticky positioning on an element
// that scrolls on its own (the running sheet's toolbar, which has no overflow of
// its own, sticks fine). Chromium keeps it stuck either way, so this test also
// checks the rule that matters for Safari: the element that is sticky must not
// have any overflow set. The chips scroll inside it instead.
//
// Needs a running instance and an account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("the Jump to bar is pinned at the top of a profile on a phone, and the pinned element does not scroll on its own", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const stamp = Date.now();
  const cin = process.env.E2E_CIN ?? "E2E1";
  const op = await post("operation.create", { name: `Jump bar ${stamp}` });
  const opId = op.id ?? op.operationId ?? op;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  // Two targets so the profile has several sections to jump between and is long
  // enough to scroll.
  for (const n of ["JUMPA", "JUMPB"]) {
    const t = await post("target.create", {
      operationId: opId,
      name: `${n} Target ${stamp}`,
      surname: n,
    });
    await post("sheet.create", {
      operationId: opId,
      targetId: t.id ?? t.targetId ?? t,
      sheetDate: today,
      sheetCins: [
        { cin, hasImages: false, isTeamLeader: true, isAuthor: true },
      ],
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/intelligence/operation/${opId}`);
  const bar = page.getByRole("navigation", { name: "Jump to" });
  await expect(bar).toBeVisible();

  // The element that is `position: sticky` (the bar itself or a wrapper around it).
  const sticky = await bar.evaluateHandle(nav => {
    let el: HTMLElement | null = nav as HTMLElement;
    while (el && getComputedStyle(el).position !== "sticky")
      el = el.parentElement;
    return el;
  });
  const stickyEl = sticky.asElement();
  expect(stickyEl, "the bar has a sticky element").not.toBeNull();

  // Safari: the sticky element must not be a scroll container itself.
  const overflow = await stickyEl!.evaluate(el => {
    const cs = getComputedStyle(el);
    return [cs.overflowX, cs.overflowY];
  });
  expect(overflow, "the sticky element has no overflow of its own").toEqual([
    "visible",
    "visible",
  ]);

  // And it stays pinned under the header when the page scrolls.
  const pinned = await page.evaluate(() => {
    const main = document.querySelector("main.app-canvas") as HTMLElement;
    const nav = document.querySelector(
      'nav[aria-label="Jump to"]'
    ) as HTMLElement;
    let el: HTMLElement | null = nav;
    while (el && getComputedStyle(el).position !== "sticky")
      el = el.parentElement;
    main.scrollTop = Math.min(500, main.scrollHeight - main.clientHeight);
    return {
      scrolled: main.scrollTop > 100,
      gap: Math.abs(
        el!.getBoundingClientRect().top - main.getBoundingClientRect().top
      ),
    };
  });
  expect(pinned.scrolled, "the profile is long enough to scroll").toBe(true);
  expect(
    pinned.gap,
    "the bar is pinned to the top of the scroll area"
  ).toBeLessThan(2);

  // A chip still scrolls to its section.
  await bar.getByRole("button").first().click();
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);
});
