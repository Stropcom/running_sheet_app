// Roster tiles, the Timeline on a phone and iPad, tasking Edit mode and the tasking list on a phone.
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

test("Team Duty Roster: the operation a team is tasked on shows on the tile of people on duty, once the week is posted", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2026-12-07"; // a Monday inside the roster's dates
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";
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
  let members = (await get("ctoRoster.members.list")) as {
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
    members = (await get("ctoRoster.members.list")) as typeof members;
  }
  const member = members.find(m => m.cin === cin)!;
  const name = "GREYFIN AURORA";

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: name,
    });
    await page.setViewportSize({ width: 1400, height: 900 });

    // Saved but not posted: no name on the tile.
    await page.goto(`/cto-roster?date=${W}`);
    await expect(page.getByText("E2E Officer").first()).toBeVisible();
    await expect(page.locator(".roster-cell-op")).toHaveCount(0);

    // Posted: the name shows in the middle of the tile, the second word on a
    // second line, and the tooltip has the whole name.
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.goto(`/cto-roster?date=${W}`);
    const tile = page.locator(".roster-cell-op", { hasText: name }).first();
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute("title", `Tasked: ${name}`);
    const lines = await tile.locator("span").evaluate(el => {
      const r = el.getBoundingClientRect();
      return Math.round(r.height / parseFloat(getComputedStyle(el).lineHeight));
    });
    expect(lines).toBe(2);

    // Not on duty that day (a rest day): no name.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "r",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await page.goto(`/cto-roster?date=${W}`);
    await expect(page.getByText("E2E Officer").first()).toBeVisible();
    await expect(
      page.locator(".roster-cell-op", { hasText: name })
    ).toHaveCount(0);
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking Timeline on a phone and an iPad: a finger slides a bar sideways, drags up or down scroll the page, a tap opens the menu", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const W = "2040-11-05"; // a Monday, a made-up week
  for (const view of [
    { name: "phone", width: 390, height: 844 },
    { name: "iPad", width: 820, height: 1180 },
  ]) {
    const context = await browser.newContext({
      baseURL: baseURL ?? "http://localhost:3000",
      storageState: "e2e/.auth/user.json",
      viewport: { width: view.width, height: view.height },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const call = (proc: string, input: unknown) =>
      page.request.post(`/api/trpc/${proc}?batch=1`, {
        data: { "0": { json: input } },
      });
    const cdp = await context.newCDPSession(page);
    const touch = (type: string, x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      });
    const drag = async (x0: number, y0: number, dx: number, dy: number) => {
      await touch("touchStart", x0, y0);
      for (let i = 1; i <= 12; i++) {
        await touch("touchMove", x0 + (dx * i) / 12, y0 + (dy * i) / 12);
        await page.waitForTimeout(16);
      }
      await touch("touchEnd", 0, 0);
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
      await page.goto("/operation-manager");
      await page.getByText(/CTO Weekly Tasking — 05 Nov/).click();
      await page.getByRole("combobox", { name: "Calendar view" }).click();
      await page.getByRole("option", { name: "Timeline" }).click();
      await page
        .getByRole("button", { name: "Edit Tasking", exact: true })
        .click();
      // Some browsers (iOS Safari) do not honour touch-action on the bar: the
      // slide must work without it.
      await page.addStyleTag({
        content: ".tcv-bar.tcv-edit{touch-action:auto !important}",
      });
      const bar = page.locator(".tcv-bar", { hasText: "RAVEN" }).first();
      await bar.evaluate(el => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(500);
      const mid = async () => {
        const b = (await bar.boundingBox())!;
        return { x: b.x + Math.min(b.width / 2, 120), y: b.y + b.height / 2 };
      };
      const saveBar = page.getByRole("region", {
        name: "Unsaved timeline changes",
      });

      // Sideways (a little off level, as a finger is): the bar moves.
      let p = await mid();
      await drag(p.x, p.y, 80, 12);
      await expect(bar, view.name).toContainText("0800–1700");
      await expect(saveBar, view.name).toContainText("1 change");
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(bar, view.name).toContainText("0600–1500");
      await page
        .getByRole("button", { name: "Edit Tasking", exact: true })
        .click();
      await page.addStyleTag({
        content: ".tcv-bar.tcv-edit{touch-action:auto !important}",
      });

      // Up or down: the page scrolls, the bar stays.
      const scrolled = () =>
        page.evaluate(
          () =>
            window.scrollY +
            (document.querySelector(".app-canvas")?.scrollTop ?? 0)
        );
      await bar.evaluate(el => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      const before = await scrolled();
      p = await mid();
      await drag(p.x, p.y, 0, -70);
      await expect(bar, view.name).toContainText("0600–1500");
      await expect(saveBar, view.name).toHaveCount(0);
      expect(await scrolled(), view.name).toBeGreaterThan(before);

      // A tap opens the operation menu.
      await bar.evaluate(el => el.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(300);
      p = await mid();
      await touch("touchStart", p.x, p.y);
      await touch("touchEnd", 0, 0);
      await expect(
        page.getByRole("menu", { name: /Operation for/ }),
        view.name
      ).toBeVisible();
    } finally {
      await call("opManager.deleteWeek", { weekStart: W });
      await context.close();
    }
  }
});

test("CTO Weekly Tasking Timeline: the time sits at the right by the team count on a phone, tablet and laptop, and never prints over long or two operation names", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-11-12"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    const cells: [number, string, string, string, string | null][] = [
      [0, "surv1", "1300-2200", "RAVEN", "GREYFIN"],
      [1, "surv1", "1100-2000", "OPERATION PINNACLE", "GREYFIN"],
      [2, "surv1", "0600-1500", "RAVEN", null],
    ];
    for (const [
      dayIndex,
      teamRow,
      shiftTime,
      primaryTask,
      secondaryTask,
    ] of cells)
      await call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex,
        teamRow,
        shiftTime,
        primaryTask,
        secondaryTask,
      });
    for (const teamRow of ["surv1", "surv2"])
      await call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex: 4,
        teamRow,
        shiftTime: "0600-1500",
        primaryTask: "RAVEN",
        secondaryTask: "GREYFIN",
        blended: true,
      });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 12 Nov/).click();
    await page.getByRole("combobox", { name: "Calendar view" }).click();
    await page.getByRole("option", { name: "Timeline" }).click();
    // The four saved bars, and PTT and Capability's standard shift Monday to Friday.
    await expect(page.locator(".tcv-bar")).toHaveCount(14);
    for (const [width, height] of [
      [390, 844],
      [820, 1180],
      [1400, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator(".tcv-bar")).toHaveCount(14);
      const clashes = await page.evaluate(() => {
        const out: string[] = [];
        for (const bar of Array.from(document.querySelectorAll(".tcv-bar"))) {
          const t = bar.querySelector(".t");
          if (!t) continue;
          const tb = t.getBoundingClientRect();
          const count = bar.querySelector(".tcv-count, .tcv-count-pair");
          // The time is at the right, after the operations and before the count.
          for (const e of Array.from(
            bar.querySelectorAll(".tcv-op, .ab, .tcv-count, .tcv-count-pair")
          )) {
            const r = e.getBoundingClientRect();
            const apart =
              r.right <= tb.left + 0.5 ||
              r.left >= tb.right - 0.5 ||
              r.bottom <= tb.top ||
              r.top >= tb.bottom;
            if (!apart) out.push(`${bar.textContent} / ${e.className}`);
          }
          const bb = bar.getBoundingClientRect();
          if (count && tb.right > count.getBoundingClientRect().left + 0.5)
            out.push(`${bar.textContent}: time is not before the count`);
          if (tb.left < bb.left)
            out.push(`${bar.textContent}: time outside bar`);
        }
        return out;
      });
      expect(clashes, `at ${width}px`).toEqual([]);
    }
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("CTO Weekly Tasking: Edit makes every layout editable in place, Cancel puts it back, Save keeps the changes and leaves edit mode", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const W = "2040-10-08"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  const opName = `E2E EDIT ${Date.now()}`;
  const made = (
    await (await call("operation.create", { name: opName })).json()
  )[0].result.data.json;
  const opId = typeof made === "number" ? made : (made.id ?? made.operationId);
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: opName,
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 1,
      teamRow: "ptt",
      shiftTime: "0600-1500",
      primaryTask: opName,
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 08 Oct/).click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    const choose = async (layout: string) => {
      await picker.click();
      await page.getByRole("option", { name: layout }).click();
    };
    const edit = page.getByRole("button", {
      name: "Edit Tasking",
      exact: true,
    });
    const summary = page.getByRole("region", {
      name: "Unsaved timeline changes",
    });
    const menu = page.getByRole("menu", { name: /Operation for/ });

    // Read only until Edit: no drop-downs.
    await choose("Team Rows");
    await expect(page.locator(".tcv-sel")).toHaveCount(0);
    await edit.click();
    await expect(page.getByLabel("Shift T1 · Mon")).toHaveValue("0600-1500");
    await expect(
      page.getByRole("button", { name: /^Save( draft)?$/ }).first()
    ).toBeDisabled();

    // Team Rows: a shift from the drop-down, and an operation from the menu.
    await page.getByLabel("Shift T1 · Mon").selectOption("1300-2200");
    await expect(summary).toContainText("1 change");
    await expect(summary).toContainText("0600–1500 to 1300–2200");
    // The banner has its own Save (as well as the one at the top), on every
    // screen size, so an admin never has to scroll up to save.
    await expect(
      summary.getByRole("button", { name: /^Save( draft)?$/ })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Primary operation T1 · Mon" })
      .click();
    await menu.getByRole("menuitemradio", { name: "None" }).click();
    await expect(summary).toContainText(`operation ${opName} to none`);

    // Team Tables: the same changes are there, and a second one is made.
    await choose("Team Tables");
    await expect(page.getByLabel("Shift T1 · Mon")).toHaveValue("1300-2200");
    await page.getByLabel("Shift T2 · Wed").selectOption("0600-1500");
    await expect(summary).toContainText("3 changes");

    // Calendar view: tap a team line for the editor; the shift chips change it.
    await choose("Calendar");
    await page.getByRole("button", { name: "Edit Team 2 Thu" }).click();
    await page.getByRole("button", { name: /^1000–1800/ }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(summary).toContainText("4 changes");

    // Timeline: its bars are editable too.
    await choose("Timeline");
    await expect(page.locator(".tcv-bar.tcv-edit").first()).toBeVisible();

    // A new operation can be made from the menu and set in one step.
    await choose("Team Rows");
    const wedOp = page.getByRole("button", {
      name: "Primary operation T2 · Wed",
    });
    // Scroll to it first and let that settle: a scroll that lands after the
    // click would close the menu again.
    await wedOp.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await wedOp.click();
    await menu.getByRole("menuitem", { name: /Create operation/ }).click();
    const created = `E2E EDIT NEW ${Date.now()}`;
    await menu.getByLabel("New operation name").fill(created);
    await menu.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Primary operation T2 · Wed" })
    ).toContainText(created);

    // Cancel: every change goes and edit mode ends.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(summary).toHaveCount(0);
    await expect(page.locator(".tcv-sel")).toHaveCount(0);
    await edit.click();
    await expect(page.getByLabel("Shift T1 · Mon")).toHaveValue("0600-1500");
    await expect(page.getByLabel("Shift T2 · Wed")).toHaveValue("");

    // Save: kept, and edit mode ends.
    await page.getByLabel("Shift T1 · Mon").selectOption("1300-2200");
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(page.getByText(/Saved 1 change\.|Draft saved/)).toBeVisible();
    await expect(edit).toBeVisible();
    await expect(page.locator(".tcv-sel")).toHaveCount(0);
    await page.reload();
    await page.getByText(/CTO Weekly Tasking — 08 Oct/).click();
    await choose("Team Rows");
    await expect(
      page.locator(".tcv-pa-col", { hasText: "1300–2200" }).first()
    ).toBeVisible();
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
    await call("operation.delete", { id: opId });
    const all = await (
      await page.request.get(
        `/api/trpc/operation.list?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: null } }))}`
      )
    ).json();
    const rows = (all[0]?.result?.data?.json ?? []) as {
      id: number;
      name: string;
    }[];
    for (const r of rows.filter(r => r.name.startsWith("E2E EDIT NEW")))
      await call("operation.delete", { id: r.id });
  }
});

test("CTO Weekly Tasking: PTT and Capability start the week at 0600-1400 Monday to Friday and RDO at the weekend, even when only other cells were saved", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-12-03"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // Only one Team 1 cell is saved, so PTT and Capability have no saved cells.
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
    });
    await call("opManager.savePriorityBoard", {
      weekStart: W,
      rows: [
        { category: "WC", priority: 1, operationName: "RAVEN", sortOrder: 0 },
      ],
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 03 Dec/).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    for (const team of ["PTT", "CAP"]) {
      await expect(page.getByLabel(`Shift ${team} · Mon`)).toHaveValue(
        "0600-1400"
      );
      await expect(page.getByLabel(`Shift ${team} · Fri`)).toHaveValue(
        "0600-1400"
      );
      await expect(page.getByLabel(`Shift ${team} · Sat`)).toHaveValue("RDO");
      await expect(page.getByLabel(`Shift ${team} · Sun`)).toHaveValue("RDO");
    }
    // Showing them is not a change: there is nothing unsaved.
    await expect(
      page.getByRole("region", { name: "Unsaved timeline changes" })
    ).toHaveCount(0);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("CTO Weekly Tasking: the full view has Edit Tasking and Edit Contacts & Priorities and no Delete; the details page has no Tasking tab and Save takes you back to the full view", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-11-19"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("opManager.savePriorityBoard", {
      weekStart: W,
      rows: [
        { category: "WC", priority: 1, operationName: "RAVEN", sortOrder: 0 },
      ],
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 19 Nov/).click();
    await expect(
      page.getByRole("button", { name: "Edit Tasking", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Edit Contacts & Priorities/ })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await page
      .getByRole("button", { name: /Edit Contacts & Priorities/ })
      .click();
    await expect(page.getByRole("tab", { name: "On-Call" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Priority" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tasking" })).toHaveCount(0);
    // Delete stays here, on the details page.
    await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

    // Save (on any tab) saves on-call, contacts and priority, then shows the full view.
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Edit Tasking", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Weekly Tasking Calendar")).toBeVisible();
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("Team Duty Roster: a roster that is already open picks up a tasking change by itself within about half a minute", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2026-12-14"; // a Monday inside the roster's dates
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const cin = process.env.E2E_CIN ?? "E2E1";
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
  let members = (await get("ctoRoster.members.list")) as {
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
    members = (await get("ctoRoster.members.list")) as typeof members;
  }
  const member = members.find(m => m.cin === cin)!;
  const cell = (primaryTask: string) =>
    call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask,
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await cell("FIRST");
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(`/cto-roster?date=${W}`);
    await expect(
      page.locator(".roster-cell-op", { hasText: "FIRST" }).first()
    ).toBeVisible();

    // The tasking changes somewhere else; this screen is left alone.
    await cell("SECOND");
    await expect(
      page.locator(".roster-cell-op", { hasText: "SECOND" }).first()
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      page.locator(".roster-cell-op", { hasText: "FIRST" })
    ).toHaveCount(0);
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking list on a phone: the title stays on one line, the New button sits under it, and the Latest / Posted pills stay inside their card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.route(/\/api\/trpc\//, async route => {
    const resp = await route.fetch();
    const json = await resp.json();
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      if (name !== "opManager.listAllWeeks") return;
      delete entry.error;
      entry.result = {
        data: {
          json: [
            { weekStart: "2026-11-09", posted: true, postedAt: 1794000000000 },
            { weekStart: "2026-11-02", posted: false, postedAt: null },
          ],
        },
      };
    };
    if (Array.isArray(json)) json.forEach((e, i) => patch(e, procs[i]));
    else patch(json, procs[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });
  await page.goto("/operation-manager");
  const card = page
    .getByRole("button")
    .filter({ hasText: "CTO Weekly Tasking —" })
    .first();
  await expect(card).toBeVisible();

  // One line for the heading (it used to wrap to three beside the button).
  const heading = page.getByRole("heading", { name: "CTO Weekly Tasking" });
  const hb = (await heading.boundingBox())!;
  expect(hb.height).toBeLessThan(34);
  // The New button is under the heading, not squeezed beside it.
  const newBtn = (await page
    .getByRole("button", { name: "New CTO Weekly Tasking" })
    .first()
    .boundingBox())!;
  expect(newBtn.y).toBeGreaterThanOrEqual(hb.y + hb.height - 1);

  // Every pill is inside its card; nothing runs under the delete button.
  const cb = (await card.boundingBox())!;
  for (const pill of await card.locator("span.rounded-full").all()) {
    const pb = (await pill.boundingBox())!;
    expect(pb.x).toBeGreaterThanOrEqual(cb.x);
    expect(pb.x + pb.width).toBeLessThanOrEqual(cb.x + cb.width);
  }
  await page.unrouteAll({ behavior: "ignoreErrors" });
});
