// Weekly Tasking blend, the Team Duty Roster, and the Timeline on phone and laptop.
// Split out of the old e2e/screens.spec.ts (v2.83.4); the tests are unchanged.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe.configure({ mode: "serial" });

test("CTO Weekly Tasking: Team 1 and Team 2 on the same shift can be blended, and a blended day shows in every layout and the PDF", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // One made-up week far from real ones; Monday: Team 1 on 0600-1500 (RAVEN),
  // Team 2 on 1300-2200 (FALCON).
  const W = "2040-02-06";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  const cells = async () => {
    const res = await page.request.get(
      `/api/trpc/opManager.getTaskingCalendar?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: { weekStart: W } } }))}`
    );
    const body = await res.json();
    return body[0].result.data.json as {
      dayIndex: number;
      teamRow: string;
      shiftTime: string | null;
      primaryTask: string | null;
      blended: boolean;
    }[];
  };
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv2",
      shiftTime: "1300-2200",
      primaryTask: "FALCON",
    });

    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 06 Feb – 12 Feb").click();
    const layoutPicker = page.getByRole("combobox", { name: "Calendar view" });
    await layoutPicker.click();
    await page.getByRole("option", { name: "Team Rows" }).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    const setT2Shift = (shift: string) =>
      page.getByLabel("Shift T2 · Mon").selectOption(shift);
    const dialog = page.getByRole("dialog");

    // Same shift as Team 1: asked. The tasks differ, so it also asks whose to keep.
    await setT2Shift("0600-1500");
    await expect(
      dialog.getByText("Blend Team 1 and Team 2 on Mon 06 Feb?")
    ).toBeVisible();
    await expect(dialog.getByText("Team 1's tasks")).toBeVisible();
    await expect(dialog.getByText("Team 2's tasks")).toBeVisible();
    // No: kept apart, and not asked again for that shift.
    await dialog.getByRole("button", { name: "No, keep separate" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(0);
    // A different shift and back is a new question.
    await setT2Shift("1000-1800");
    await expect(dialog).toHaveCount(0);
    await setT2Shift("0600-1500");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, blend" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: "Split" }).first()
    ).toBeVisible();

    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(
      page.getByText(/Saved \d+ changes?\.|Draft saved/)
    ).toBeVisible();
    // (If the roster has people in these teams it asks about their start times.)
    await page
      .getByRole("dialog", { name: "Update the roster too?" })
      .getByRole("button", { name: "No" })
      .click({ timeout: 3000 })
      .catch(() => {});
    const saved = await cells();
    const mon = saved.filter(c => c.dayIndex === 0);
    expect(mon.find(c => c.teamRow === "surv1")).toMatchObject({
      blended: true,
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });
    // Team 2 carries the shared entry (Team 1's tasks, as picked by default).
    expect(mon.find(c => c.teamRow === "surv2")).toMatchObject({
      blended: true,
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });

    // The full view shows the blended day in each layout.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 06 Feb – 12 Feb").click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    await picker.click();
    await page.getByRole("option", { name: "Team Rows" }).click();
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(2);
    await picker.click();
    await page.getByRole("option", { name: "Team Tables" }).click();
    await expect(page.locator(".tcv-table tr.bl")).toHaveCount(2);
    await picker.click();
    await page.getByRole("option", { name: "Calendar" }).click();
    await expect(page.locator(".tcv-tl.merged")).toHaveCount(1);
    await picker.click();
    await page.getByRole("option", { name: "Timeline" }).click();
    await expect(page.locator(".tcv-bar.merged")).toHaveCount(1);

    // And in the PDF.
    await page.getByRole("button", { name: "Export PDF" }).click();
    const layouts = page.getByRole("group", {
      name: "Calendar layouts to export",
    });
    await layouts.getByRole("checkbox", { name: "Team Rows" }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pop = await popup;
    await pop.waitForLoadState();
    const html = await pop.content();
    expect(html).toContain("tp-btag");
    expect(html).toContain("tp-bar merged");
    await pop.close();

    // Split puts the day back to two teams.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 06 Feb – 12 Feb").click();
    await layoutPicker.click();
    await page.getByRole("option", { name: "Team Rows" }).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    await page.getByRole("button", { name: "Split" }).first().click();
    await expect(page.locator(".tcv-pa-col.bl")).toHaveCount(0);
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(
      page.getByText(/Saved \d+ changes?\.|Draft saved/)
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "Update the roster too?" })
      .getByRole("button", { name: "No" })
      .click({ timeout: 3000 })
      .catch(() => {});
    const after = (await cells()).filter(c => c.dayIndex === 0);
    expect(after.every(c => !c.blended)).toBe(true);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("Team Duty Roster: zoom, team cards and team colours that follow User Management", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-03-05"; // a made-up CTO Weekly Tasking week
  const NEW_COLOUR = "#00aa55";
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
  const cin = process.env.E2E_CIN ?? "E2E1";

  // A roster team called "Team 1" with one member (kept if it is already there).
  let rosterTeams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  let addedTeam = false;
  if (!rosterTeams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    addedTeam = true;
    rosterTeams = await get("ctoRoster.teams.list");
  }
  const rosterTeam = rosterTeams.find(t => t.name === "Team 1")!;
  const members = (await get("ctoRoster.members.list")) as {
    id: number;
    cin: string;
  }[];
  let addedMemberId: number | null = null;
  if (!members.some(m => m.cin === cin)) {
    const r = await call("ctoRoster.members.add", {
      cin,
      teamId: rosterTeam.id,
    });
    addedMemberId = r.result?.data.json.memberId ?? null;
  }

  // The User Management team called "Team 1" gets a new colour.
  const umTeams = (await get("users.listTeams")) as {
    id: number;
    name: string;
    colour: string | null;
    aiPhones: string[] | null;
    mapVisibility: "always" | "online";
    forceShare: boolean;
    offerOnNewSheet: boolean;
  }[];
  const um = umTeams.find(t => t.name === "Team 1")!;
  const setColour = (colour: string | null) =>
    call("admin.updateTeam", {
      id: um.id,
      name: um.name,
      colour,
      aiPhones: um.aiPhones ?? [],
      mapVisibility: um.mapVisibility,
      forceShare: um.forceShare,
      offerOnNewSheet: um.offerOnNewSheet,
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await setColour(NEW_COLOUR);
    await page.goto("/cto-roster");
    const fold = page.getByRole("button", { name: "Collapse Team 1" });
    await expect(fold).toBeVisible();
    const card = fold.locator(
      "xpath=ancestor::div[contains(@class,'mb-5')][1]"
    );
    // The team's section is drawn in the colour set in User Management.
    // (the colour end at the card's left, which stays on screen when scrolled)
    await expect(card.locator("> div").first()).toHaveCSS(
      "background-color",
      "rgb(0, 170, 85)"
    );

    // Zoom: 100% to start, the slider zooms the grid and it is remembered.
    const grid = card.locator("xpath=..");
    // The percentage is only read out for screen readers now (no number shown).
    const zoomSays = page
      .getByRole("group", { name: "Roster zoom" })
      .locator("[aria-live=polite]");
    await expect(zoomSays).toHaveText("100%");
    await expect(grid).toHaveCSS("zoom", "1");
    await page.getByRole("slider", { name: "Zoom level" }).fill("50");
    await expect(zoomSays).toHaveText("50%");
    await expect(grid).toHaveCSS("zoom", "0.5");
    await page.reload();
    await expect(zoomSays).toHaveText("50%");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(zoomSays).toHaveText("55%");
    // A team folds down to its totals and back.
    await page.getByRole("button", { name: "Collapse Team 1" }).click();
    await expect(
      page.getByRole("button", { name: "Expand Team 1" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Expand Team 1" }).click();
    await expect(
      page.getByRole("button", { name: "Collapse Team 1" })
    ).toBeVisible();

    // The CTO Weekly Tasking draws Team 1 in the same colour.
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1400",
      primaryTask: "RAVEN",
    });
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 05 Mar – 11 Mar").click();
    await expect(page.locator(".tcv-team").first()).toHaveAttribute(
      "style",
      /--tc:\s*(#00aa55|rgb\(0,\s*170,\s*85\))/
    );
  } finally {
    await setColour(um.colour);
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking on a phone: only Calendar and Timeline, no colour or letter key", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-05-07";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    // A saved Team Rows choice (made on a laptop) shows as Calendar on a phone.
    await page.addInitScript(() =>
      localStorage.setItem("runlog.taskingView", "panel-banded")
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 07 May/).click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    await expect(picker).toContainText("Calendar");
    await picker.click();
    await expect(page.getByRole("option")).toHaveText(["Calendar", "Timeline"]);
    await page.keyboard.press("Escape");

    // A laptop still has all four layouts, and no colour key (it was taken
    // out of the screen view).
    await page.setViewportSize({ width: 1400, height: 900 });
    await expect(page.locator(".tcv-legend")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Calendar view" }).click();
    await expect(page.getByRole("option")).toHaveCount(4);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("Calendar: month grid by default, List view is selectable and remembered", async ({
  page,
}) => {
  await page.goto("/calendar");
  await page.evaluate(() => localStorage.removeItem("runlog.calendarView"));
  await page.reload();
  const group = page.getByRole("group", { name: "Calendar layout" });
  await expect(group.getByRole("button", { name: "Month" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".rbc-month-view")).toBeVisible();

  await group.getByRole("button", { name: "List" }).click();
  await expect(group.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".rbc-month-view")).toHaveCount(0);

  // Remembered on this device.
  await page.reload();
  await expect(group.getByRole("button", { name: "List" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("Team Duty Roster on a phone: the month sits in the frozen corner, follows the scroll and stays in full screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cto-roster");
  const corner = page.getByTestId("roster-month-corner");
  await expect(corner).toBeVisible();
  await expect(corner).toHaveText(/^[A-Z][a-z]{2} \d{4}$/);
  const before = (await corner.textContent()) ?? "";
  // Scroll the grid a few weeks sideways: the corner month follows.
  await page.evaluate(() => {
    const el = document.querySelector(".overflow-auto.cursor-grab");
    if (el) el.scrollLeft += 2400;
  });
  await expect(corner).not.toHaveText(before);
  // Still there in Full screen, where the month picker is hidden.
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByText("Showing", { exact: true })).toHaveCount(0);
  await expect(corner).toBeVisible();
});

test("Team Duty Roster full screen: a phone turned sideways has zoom / Today / Exit in the header, a portrait phone keeps the strip", async ({
  page,
}) => {
  const bar = page.getByRole("group", { name: "Roster full screen controls" });
  // Sideways (landscape, both header layouts): the controls are in the header
  // bar, at the very top, not in a strip over the grid.
  for (const [width, height] of [
    [844, 390],
    [740, 360],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/cto-roster");
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect(bar).toBeVisible();
    await expect(bar).toHaveCount(1);
    const box = await bar.boundingBox();
    expect(box?.y ?? 99).toBeLessThan(40);
    await bar.getByRole("button", { name: "Exit full screen" }).click();
    await expect(page.getByText("Team Duty Roster")).toBeVisible();
  }
  // Portrait: still the strip on the page, under the header.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cto-roster");
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(bar).toBeVisible();
  await expect(bar).toHaveCount(1);
  const portrait = await bar.boundingBox();
  expect(portrait?.y ?? 0).toBeGreaterThan(55);
});

test("Team Duty Roster: Full screen hides the toolbar, keeps zoom / Today / Exit in the header, Esc and Exit put it back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/cto-roster");
  await expect(page.getByText("Showing", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toBeVisible();
  // Repeat Cycle is gone; Today sits in the row with Bulk Edit and Bulk Copy.
  await expect(page.getByRole("button", { name: "Repeat Cycle" })).toHaveCount(
    0
  );
  const todayBox = await page
    .getByRole("button", { name: "Today" })
    .boundingBox();
  const editBox = await page
    .getByRole("button", { name: "Bulk Edit" })
    .boundingBox();
  expect(Math.abs((todayBox?.y ?? 0) - (editBox?.y ?? 99))).toBeLessThan(4);

  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByText("Showing", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toHaveCount(0);
  const bar = page.getByRole("group", { name: "Roster full screen controls" });
  await expect(bar.getByRole("button", { name: "Zoom out" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Today" })).toBeVisible();

  // Exit button puts the toolbar back.
  await bar.getByRole("button", { name: "Exit full screen" }).click();
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toBeVisible();
  await expect(page.getByText("Showing", { exact: true })).toBeVisible();

  // Esc does too.
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Bulk Edit" })).toBeVisible();

  // A phone gets the same controls as a strip on the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(
    page
      .getByRole("group", { name: "Roster full screen controls" })
      .getByRole("button", { name: "Exit full screen" })
  ).toBeVisible();
});

test("CTO Weekly Tasking Timeline: an admin slides a bar, sees Save and re-post, and the change is saved", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2040-05-14";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  // Plenty of operations, so the operation menu is long enough to scroll
  // inside itself (it used to close when it did, which hung this test on a
  // database that already had operations).
  const stamp = Date.now();
  const menuOpIds: number[] = [];
  for (let n = 1; n <= 14; n++) {
    const r = await call("operation.create", {
      name: `E2E MENU OP ${stamp} ${n}`,
    });
    const made = (await r.json())[0].result.data.json;
    menuOpIds.push(
      typeof made === "number" ? made : (made.id ?? made.operationId)
    );
  }
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv2",
      shiftTime: "1400-2200",
      primaryTask: "AURORA",
    });
    // Posted already, so the bar offers Save and re-post.
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.addInitScript(() =>
      localStorage.setItem("runlog.taskingView", "cal-timeline")
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 14 May/).click();

    const bar = page.locator(".tcv-bar", { hasText: "RAVEN" }).first();
    await expect(bar).toContainText("0700–1500");
    await expect(
      page.getByRole("region", { name: "Unsaved timeline changes" })
    ).toHaveCount(0);
    // Not editable until Edit is pressed.
    await expect(page.locator(".tcv-bar.tcv-edit")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    await expect(page.locator(".tcv-bar.tcv-edit").first()).toBeVisible();

    // Slide it later in the day: the bar shows its new time, the save bar appears.
    const box = (await bar.boundingBox())!;
    const lane = (await bar.locator("xpath=..").boundingBox())!;
    const hours = lane.width / 19; // 05:00 to 24:00 while editing
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + hours,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.move(
      box.x + box.width / 2 + 2 * hours,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.up();
    await expect(bar).toContainText("0900–1700");
    const saveBar = page.getByRole("region", {
      name: "Unsaved timeline changes",
    });
    await expect(saveBar).toContainText("1 change");
    await expect(saveBar).toContainText("0700–1500 to 0900–1700");
    await expect(
      page.getByRole("button", { name: "Save and re-post" }).first()
    ).toBeVisible();

    // Cancel puts it back and leaves edit mode.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(saveBar).toHaveCount(0);
    await expect(bar).toContainText("0700–1500");
    await expect(page.locator(".tcv-bar.tcv-edit")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();

    // A click (no slide) opens the operation menu.
    await bar.click();
    const menu = page.getByRole("menu", { name: /Operation for/ });
    await expect(
      menu.getByRole("menuitemradio", { name: /RAVEN/ })
    ).toHaveAttribute("aria-checked", "true");
    // Admin and Other (free text) sit under the operations, as in the edit grid.
    await expect(
      menu.getByRole("menuitemradio", { name: "Admin" })
    ).toBeVisible();
    await menu.getByRole("menuitem", { name: /Other/ }).click();
    await menu.getByLabel("Describe the task").fill("Training day");
    await menu.getByRole("button", { name: "Set" }).click();
    await expect(menu).toHaveCount(0);
    const savebar2 = page.getByRole("region", {
      name: "Unsaved timeline changes",
    });
    await expect(savebar2).toContainText("operation RAVEN to Training day");
    await expect(
      page.locator(".tcv-bar", { hasText: "Training day" })
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(bar).toContainText("RAVEN");
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    // Escape closes the menu without changing anything.
    await bar.click();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    // Slide again and Save: it is stored and still there after a reload.
    await bar.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(bar).toContainText("0800–1600");
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(page.getByText(/Saved 1 change\.|Draft saved/)).toBeVisible();
    await expect(saveBar).toHaveCount(0);
    // Save leaves edit mode.
    await expect(
      page.getByRole("button", { name: "Edit Tasking", exact: true })
    ).toBeVisible();
    await expect(page.locator(".tcv-bar.tcv-edit")).toHaveCount(0);
    await page.reload();
    await page.getByText(/CTO Weekly Tasking — 14 May/).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "RAVEN" }).first()
    ).toContainText("0800–1600");
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
    for (const id of menuOpIds) await call("operation.delete", { id });
  }
});
