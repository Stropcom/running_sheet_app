// The Draft Roster page (client/src/pages/CtoRoster/DraftRosterPage.tsx): a
// standalone draft with one team and one member opens, a cell's shift sheet
// saves a shift into the draft, and Bulk Edit applies one shift to two cells.
// A safety net for moving the page's pieces into their own files
// (docs/features/dev-and-ops.md, phase 3).
//
// Needs a running instance and an admin account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("Draft Roster: a cell's shift sheet saves a shift into the draft, Bulk Edit applies one to two cells", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    const body = (await res.json())[0];
    expect(body.result, JSON.stringify(body)).toBeTruthy();
    return body.result.data.json;
  };
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "Australia/Perth",
    });
  const { draftId } = await call("ctoRoster.draft.createStandalone", {
    name: `Draft page ${Date.now()}`,
    startDate: day(-3),
    endDate: day(40),
  });
  const { id: teamId } = await call("ctoRoster.draft.addTeam", {
    draftId,
    name: "Draft Team",
  });
  await call("ctoRoster.draft.addMember", {
    draftId,
    teamId,
    name: "Draftee One",
  });
  const savedShifts = async () => {
    const input = { "0": { json: { draftId } } };
    const res = await page.request.get(
      `/api/trpc/ctoRoster.draft.getShifts?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`
    );
    return (await res.json())[0].result.data.json.length as number;
  };

  await page.goto(`/cto-roster/draft/${draftId}`);
  await expect(page.getByText("Draftee One").first()).toBeVisible();
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);

  const empty = page.locator("[class*='border-dashed']");
  const tap = async (k: number) => {
    const boxes: { x: number; y: number }[] = [];
    for (const el of await empty.all()) {
      const b = await el.boundingBox();
      if (b && b.x > 420 && b.x + b.width < 1200)
        boxes.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
    expect(boxes.length).toBeGreaterThan(k);
    await page.mouse.click(boxes[k].x, boxes[k].y);
  };
  expect(await empty.count()).toBeGreaterThan(8);
  expect(await savedShifts()).toBe(0);

  // 1. A cell's shift sheet: pick Day, one shift is saved into the draft.
  await tap(0);
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Edit Shift \(Draft\)/)).toBeVisible();
  await sheet.getByRole("button", { name: "D Day", exact: true }).click();
  await sheet.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect.poll(savedShifts).toBe(1);

  // 2. Bulk Edit: drag across two empty cells (a plain tap on a cell selects
  // and then unselects it on this page — see docs/features/dev-and-ops.md,
  // phase 3k), Apply, pick Rest Day, apply to both.
  await page.getByRole("button", { name: "Bulk Edit" }).click();
  const cells: { x: number; y: number }[] = [];
  for (const el of await empty.all()) {
    const b = await el.boundingBox();
    if (b && b.x > 420 && b.x + b.width < 1200)
      cells.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }
  expect(cells.length).toBeGreaterThan(2);
  await page.mouse.move(cells[0].x, cells[0].y);
  await page.mouse.down();
  await page.mouse.move(cells[1].x, cells[1].y, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: /^Apply \(2\)/ }).click();
  const bulk = page.getByRole("dialog");
  await bulk.getByRole("button", { name: "R Rest Day", exact: true }).click();
  await bulk.getByRole("button", { name: /^Apply to 2 cells/i }).click();
  await expect(bulk).toBeHidden();
  await expect.poll(savedShifts).toBe(3);
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);
});
