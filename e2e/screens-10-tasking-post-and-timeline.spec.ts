// The side menu, posting a tasking, Timeline save, EA breaches and shift lengths.
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

test("Side menu: CTO Roster opens the roster, and its tools are grouped under Roster tools (folded by default)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/cto-roster");
  const tools = page.getByRole("button", { name: "Roster tools", exact: true });
  await expect(tools).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "My Shifts", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Outlook", exact: true })
  ).toBeVisible();
  for (const name of [
    "Drafts",
    "Saved Rosters",
    "EA Compliance",
    "Audit Log",
    "Members",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0
    );

  await tools.click();
  await expect(tools).toHaveAttribute("aria-expanded", "true");
  for (const name of [
    "Drafts",
    "Saved Rosters",
    "EA Compliance",
    "Audit Log",
    "Members",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();

  // Going to a tool leaves the group open so you can see where you are.
  await page.getByRole("button", { name: "Audit Log", exact: true }).click();
  await expect(page).toHaveURL(/\/cto-roster\/audit/);
  await expect(
    page.getByRole("button", { name: "Roster tools", exact: true })
  ).toHaveAttribute("aria-expanded", "true");

  // The CTO Roster entry itself opens the main roster page.
  await page.getByRole("button", { name: "CTO Roster", exact: true }).click();
  await expect(page).toHaveURL(/\/cto-roster$/);
});

test("Side menu: Weekly Activity (the Weekly Surveillance Report) keeps Op Manager open and does not open Procedures or Administration", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/reports/weekly-activity");
  // Op Manager is open with Weekly Activity in it.
  await expect(
    page.getByRole("button", { name: "Weekly Activity", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "CTO Weekly Tasking", exact: true })
  ).toBeVisible();
  // Procedures and Administration stay folded.
  for (const name of [
    "Vehicle Crash",
    "UCO Guide",
    "SMEAC Briefings",
    "Archive",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
      0
    );
});

test("CTO Weekly Tasking: Post asks whether to carry a different start time to the roster, again each time while they differ; Yes updates the on-duty members", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const W = "2040-06-04"; // a Monday, a made-up week
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

  // A roster team called "Team 1" with the e2e officer in it (kept if there).
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
  const rosterShift = async () => {
    const rows = (await get("ctoRoster.roster.getRange", {
      startDate: W,
      endDate: W,
    })) as {
      memberId: number;
      shiftDate: string;
      shiftCode: string;
      shiftTime: string | null;
    }[];
    return rows.find(r => r.memberId === member.id && r.shiftDate === W);
  };

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // On the roster: a Day shift (06:00). On the tasking: Team 1 starts 14:00.
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
      shiftTime: "1400-2200",
      primaryTask: "RAVEN",
    });

    await page.setViewportSize({ width: 1400, height: 900 });
    const openWeek = async () => {
      await page.goto("/operation-manager");
      await page.getByText(/CTO Weekly Tasking — 04 Jun/).click();
    };
    const question = page.getByRole("dialog", {
      name: "Update the roster too?",
    });
    const whoToNotify = page.getByRole("dialog", {
      name: "Select who to notify",
    });

    // Post: the roster question comes first.
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("Team 1");
    await expect(question).toContainText("06:00 to 14:00");
    await expect(question).toContainText("1 change between Day and Arvo");
    // No: the roster is left alone and the notify step carries on.
    await question.getByRole("button", { name: "No" }).click();
    await expect(whoToNotify).toBeVisible();
    expect(await rosterShift()).toMatchObject({ shiftCode: "d" });
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // A No is not remembered: the next Post asks again while they differ.
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // Yes updates the roster: an Arvo from 14:00.
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(question).toBeVisible();
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "a",
      shiftTime: "14:00",
    });

    // Now they agree, so there is nothing to ask.
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(whoToNotify).toBeVisible();
    await expect(question).toHaveCount(0);
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // A team's rest day on the roster that the tasking now has working: the
    // question is asked too, and Yes makes it a working shift.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "r",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("on a rest day to 14:00");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "a",
      shiftTime: "14:00",
    });

    // The team's shift is taken off the tasking again (RDO): the roster goes
    // back to the rest day it was, after the question.
    const tasked = async (shiftTime: string) =>
      call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex: 0,
        teamRow: "surv1",
        shiftTime,
        primaryTask: shiftTime === "RDO" ? null : "RAVEN",
      });
    await tasked("RDO");
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("back to a rest day");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "r",
      shiftTime: null,
    });

    // A shift anyone set by hand is not touched: with the roster on a Day
    // shift the team being RDO on the tasking asks nothing.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(whoToNotify).toBeVisible();
    await expect(question).toHaveCount(0);
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();

    // Rest on-call ("o") works the same way: it becomes Arvo on-call, and goes
    // back to Rest on-call when the tasking has no shift again.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "o",
      shiftTime: null,
      memberName: "E2E Officer",
    });
    await tasked("1400-2200");
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("on Rest on-call to 14:00");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "aoc",
      shiftTime: "14:00",
    });
    await tasked("RDO");
    await openWeek();
    await page.getByRole("button", { name: /Post & Notify/i }).click();
    await expect(question).toContainText("back to Rest on-call");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(whoToNotify).toBeVisible();
    await whoToNotify.getByRole("button", { name: "Cancel" }).click();
    expect(await rosterShift()).toMatchObject({
      shiftCode: "o",
      shiftTime: null,
    });
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

test("CTO Weekly Tasking Timeline: Save after sliding a bar asks about the roster, Yes moves the on-duty member's start", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const W = "2040-06-11"; // a Monday, a made-up week
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

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // The roster and the tasking agree: Day shift, 06:00.
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
      primaryTask: "RAVEN",
    });
    await page.addInitScript(() =>
      localStorage.setItem("runlog.taskingView", "cal-timeline")
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 11 Jun/).click();
    const editBtn = page.getByRole("button", {
      name: "Edit Tasking",
      exact: true,
    });
    await editBtn.click();

    // Slide Team 1's bar two hours later, then Save.
    const bar = page.locator(".tcv-bar", { hasText: "RAVEN" }).first();
    const box = (await bar.boundingBox())!;
    const lane = (await bar.locator("xpath=..").boundingBox())!;
    const hour = lane.width / 19;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + hour,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.move(
      box.x + box.width / 2 + 2 * hour,
      box.y + box.height / 2,
      { steps: 5 }
    );
    await page.mouse.up();
    await expect(bar).toContainText("0800–1700");
    const question = page.getByRole("dialog", {
      name: "Update the roster too?",
    });
    const rosterRow = async () =>
      (
        (await get("ctoRoster.roster.getRange", {
          startDate: W,
          endDate: W,
        })) as {
          memberId: number;
          shiftCode: string;
          shiftTime: string | null;
        }[]
      ).find(r => r.memberId === member.id);

    // The week is not posted, so it is a draft: the button says Save draft,
    // and saving only saves. No roster question, no change to the roster.
    await expect(page.getByTestId("week-draft-badge")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save draft" }).first()
    ).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).first().click();
    await expect(page.getByText(/Draft saved/)).toBeVisible();
    await expect(question).toHaveCount(0);
    expect(await rosterRow()).toMatchObject({
      shiftCode: "d",
      shiftTime: null,
    });

    // Once posted, Save is a plain Save and asks the roster question.
    await call("opManager.postWeek", { weekStart: W, userIds: [] });
    await page.reload();
    await page.getByText(/CTO Weekly Tasking — 11 Jun/).click();
    await expect(page.getByTestId("week-draft-badge")).toHaveCount(0);
    await editBtn.click();
    {
      const b = (await bar.boundingBox())!;
      const l = (await bar.locator("xpath=..").boundingBox())!;
      const h = l.width / 19;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 + h / 2, b.y + b.height / 2, {
        steps: 4,
      });
      await page.mouse.move(b.x + b.width / 2 + h, b.y + b.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
    }
    await expect(bar).toContainText("0900–1800");
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(
      0
    );
    await page
      .getByRole("button", { name: /^Save( draft)?$/ })
      .first()
      .click();
    await expect(question).toBeVisible();
    await expect(question).toContainText("06:00 to 09:00");
    await question
      .getByRole("button", { name: "Yes, update the roster" })
      .click();
    await expect(page.getByText(/Roster updated: 1 shift/)).toBeVisible();

    // Still a Day shift (09:00 is before midday), now starting at 09:00.
    expect(await rosterRow()).toMatchObject({
      shiftCode: "d",
      shiftTime: "09:00",
    });

    // Every save asks again: slide on, Save, No; slide on, Save, No; and then
    // back to a start already answered No to, which asks as well.
    const slideLater = async (hours: number) => {
      await editBtn.click(); // Save leaves edit mode: Edit again
      const b = (await bar.boundingBox())!;
      const l = (await bar.locator("xpath=..").boundingBox())!;
      const h = l.width / 19;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        b.x + b.width / 2 + (h * hours) / 2,
        b.y + b.height / 2,
        { steps: 4 }
      );
      await page.mouse.move(b.x + b.width / 2 + h * hours, b.y + b.height / 2, {
        steps: 4,
      });
      await page.mouse.up();
      await page
        .getByRole("button", { name: /^Save( draft)?$/ })
        .first()
        .click();
    };
    await slideLater(1); // 10:00
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(question).toHaveCount(0); // closed, the bar is free again
    await slideLater(1); // 11:00
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(question).toHaveCount(0);
    await slideLater(-1); // 10:00 again, answered No before
    await expect(question).toBeVisible();
    await question.getByRole("button", { name: "No" }).click();
    await expect(question).toHaveCount(0);
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

test("CTO Weekly Tasking: an EA breach on the roster shows as a red dot on the team-day in every layout, with the issue in a popover", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const W = "2040-07-02"; // a Monday, a made-up week
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

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // A 14-hour Day shift on the Monday breaks the 12-hour limit; Team 1 is
    // tasked that day.
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "d",
      shiftTime: null,
      shiftDurationHours: 14,
      memberName: "E2E Officer",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    // The server finds the breach, and a plain (non-admin) read works too.
    const found = (await get("ctoRoster.eba.taskingBreaches")) as {
      memberId: number;
      dates: string[];
    }[];
    expect(
      found.some(f => f.memberId === member.id && f.dates.includes(W))
    ).toBe(true);

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 02 Jul/).click();
    await expect(page.getByTestId("tasking-breach-chip")).toContainText(
      /EA breach/
    );
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    for (const layout of ["Team Rows", "Team Tables", "Calendar", "Timeline"]) {
      await picker.click();
      await page.getByRole("option", { name: layout }).click();
      await expect(page.getByTestId("tasking-breach-dot")).toHaveCount(1);
    }

    // Click the dot: the rule, its reference and who it is about.
    await page.getByTestId("tasking-breach-dot").click();
    const pop = page.getByTestId("tasking-breach-popover");
    await expect(pop).toContainText("EA compliance issue");
    await expect(pop).toContainText("Open Mon on the roster");

    // It is the same on a phone.
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByTestId("tasking-breach-dot")).toHaveCount(1);

    // The roster link opens the roster.
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.getByTestId("tasking-breach-dot").click();
    await page.getByRole("button", { name: "Open Mon on the roster" }).click();
    await expect(page).toHaveURL(/\/cto-roster\?date=2040-07-02/);
  } finally {
    await call("ctoRoster.roster.updateShift", {
      memberId: member.id,
      shiftDate: W,
      shiftCode: "",
      shiftTime: null,
      shiftDurationHours: null,
      memberName: "E2E Officer",
    });
    await call("opManager.deleteWeek", { weekStart: W });
    if (addedMemberId !== null)
      await call("ctoRoster.members.delete", { memberId: addedMemberId });
    if (addedTeam)
      await call("ctoRoster.teams.delete", { teamId: rosterTeam.id });
  }
});

test("CTO Weekly Tasking Timeline: a Day shift is 9 hours (0600-1500) and choosing Admin makes it 8 hours (0700-1500), and back", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-09-03"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  // A real operation, so it is one of the menu's choices to switch back to.
  const opName = `E2E NINE HOUR ${Date.now()}`;
  const createdName = `E2E CREATED ${Date.now()}`;
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
      teamRow: "surv1",
      shiftTime: "1300-2200",
      primaryTask: opName,
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 2,
      teamRow: "surv1",
      shiftTime: "0600-1400",
      primaryTask: "Admin",
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/operation-manager");
    await page.getByText(/CTO Weekly Tasking — 03 Sep/).click();
    await page.getByRole("combobox", { name: "Calendar view" }).click();
    await page.getByRole("option", { name: "Timeline" }).click();
    await page
      .getByRole("button", { name: "Edit Tasking", exact: true })
      .click();
    const monday = page.locator(".tcv-bar", { hasText: "0600–1500" });
    const tuesday = page.locator(".tcv-bar", { hasText: "1300–2200" });
    await expect(monday).toHaveCount(1);
    await expect(tuesday).toHaveCount(1);
    const menu = page.getByRole("menu", { name: /Operation for/ });

    // Admin on the 9-hour Day shift: 8 hours, 0700-1500.
    await monday.click();
    await menu.getByRole("menuitemradio", { name: "Admin" }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "Admin" }).first()
    ).toContainText("0700–1500");
    // And back to an operation: the 9-hour Day shift again.
    const admin = page.locator(".tcv-bar", { hasText: "Admin" }).first();
    await admin.click();
    await menu.getByRole("menuitemradio", { name: opName }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: opName }).first()
    ).toContainText("0600–1500");

    // An Arvo shift chosen as Admin keeps its start and is 8 hours.
    await tuesday.click();
    await menu.getByRole("menuitemradio", { name: "Admin" }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "Admin" }).first()
    ).toContainText("1300–2100");

    // An 8-hour Admin shift at another start (0600-1400) gains its hour back
    // when changed to an operation.
    // (Team 1's Admin bar only: PTT and Capability's standard shift is 0600-1400.)
    const wed = page
      .locator(".tcv-bar", { hasText: "0600–1400" })
      .filter({ hasText: "Admin" });
    await expect(wed).toHaveCount(1);
    // Scroll it into view first and let the scroll settle: a scroll that lands
    // after the click would close the menu again.
    await wed.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await wed.click();
    await menu.getByRole("menuitemradio", { name: opName }).click();
    await expect(
      page.locator(".tcv-bar", { hasText: "0600–1500" })
    ).toHaveCount(2);
    await expect(wed).toHaveCount(0);

    // None (under the line, with Admin and Other) clears the operation.
    const first = page.locator(".tcv-bar", { hasText: opName }).first();
    await first.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await first.click();
    await menu.getByRole("menuitemradio", { name: "None" }).click();
    await expect(
      page.getByRole("region", { name: "Unsaved timeline changes" })
    ).toContainText(`operation ${opName} to none`);

    // Create (above the line, with the operations) makes a new operation and
    // puts it on the bar.
    const bar = page
      .locator(".tcv-bar")
      .filter({ hasNotText: opName })
      .filter({ hasNotText: "Admin" })
      .first();
    await bar.click();
    await menu.getByRole("menuitem", { name: /Create operation/ }).click();
    await menu.getByLabel("New operation name").fill(createdName);
    await menu.getByRole("button", { name: "Create", exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(
      page.locator(".tcv-bar", { hasText: createdName })
    ).toHaveCount(1);
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
    for (const r of rows.filter(r => r.name === createdName))
      await call("operation.delete", { id: r.id });
  }
});
