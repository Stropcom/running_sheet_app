// The Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx and the
// pieces it is split into): tapping a cell opens the shift sheet and saves a
// shift, Bulk Edit selects cells and applies one shift to them, Bulk Copy readies
// a block to paste. A safety net for moving the page's pieces into their own files
// (docs/features/dev-and-ops.md, phase 3). The grid, zoom, colours and full
// screen are covered in screens-09-roster-and-timeline.spec.ts.
//
// Needs a running instance and an admin account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("Team Duty Roster: a cell's shift sheet saves a shift, Bulk Edit applies one to two cells, Bulk Copy readies a block", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const cin = process.env.E2E_CIN ?? "E2E1";
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
  // How many shifts are saved in a wide window around today (the grid only
  // draws the dates near the scroll position, so counting cells is unreliable).
  const savedShifts = async () => {
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", {
        timeZone: "Australia/Perth",
      });
    const input = {
      "0": { json: { startDate: day(-60), endDate: day(120) } },
    };
    const res = await page.request.get(
      `/api/trpc/ctoRoster.roster.getRange?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`
    );
    const data = (await res.json())[0].result.data.json;
    return (Array.isArray(data) ? data : (data.shifts ?? [])).length as number;
  };
  // A roster team called "Team 1" with the test officer on it (kept if there).
  let teams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  if (!teams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    teams = await get("ctoRoster.teams.list");
  }
  const team = teams.find(t => t.name === "Team 1")!;
  // A fresh roster entry for the test officer, so there are no shifts left over
  // from an earlier run: any existing one is removed (with its shifts) and added
  // again.
  const members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  const existing = members.find(m => m.cin === cin);
  if (existing)
    await call("ctoRoster.members.delete", {
      memberId: existing.id,
      deleteShifts: true,
    });
  await call("ctoRoster.members.add", { cin, teamId: team.id });

  await page.goto("/cto-roster");
  await expect(
    page.getByRole("button", { name: "Collapse Team 1" })
  ).toBeVisible();
  const empty = page.locator("text='+'");
  // Tap the k-th empty cell that is on screen and clear of the frozen Member column.
  const tap = async (k: number) => {
    const boxes: { x: number; y: number }[] = [];
    for (const el of await empty.all()) {
      const b = await el.boundingBox();
      if (b && b.x > 520 && b.x + b.width < 1200)
        boxes.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    }
    expect(boxes.length).toBeGreaterThan(k);
    await page.mouse.click(boxes[k].x, boxes[k].y);
  };

  expect(await empty.count()).toBeGreaterThan(8);
  const shiftsBefore = await savedShifts();

  // 1. A cell's shift sheet: pick Day, one more shift is saved.
  await tap(0);
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/change shift/i)).toBeVisible();
  await sheet.getByRole("button", { name: /Day · 06:00/ }).click();
  await sheet.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect.poll(savedShifts).toBe(shiftsBefore + 1);

  // 2. Bulk Edit: select two empty cells, Apply, pick Rest Day, apply to both.
  await page.getByRole("button", { name: "Bulk Edit" }).click();
  await tap(0);
  await tap(1);
  await page.getByRole("button", { name: /^Apply \(2\)/ }).click();
  const bulk = page.getByRole("dialog");
  await bulk.getByRole("button", { name: /Rest Day/ }).click();
  await bulk.getByRole("button", { name: "Apply to 2 Cells" }).click();
  await expect(bulk).toBeHidden();
  await expect.poll(savedShifts).toBe(shiftsBefore + 3);

  // 3. Bulk Copy: select two cells, Copy; the block is ready to paste.
  await page.getByRole("button", { name: /Bulk Copy/ }).click();
  await tap(0);
  await tap(1);
  await page.getByRole("button", { name: /^Copy \(2\)/ }).click();
  await expect(page.getByText(/Block ready \(2\)/)).toBeVisible();
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);
});
