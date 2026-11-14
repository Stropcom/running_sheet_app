// EA compliance, s.33(16)(a): "a minimum of 24 hours notice of any change to
// their normal pattern of attendance". A shift changed on the live roster less
// than 24 hours before it starts is found by the EA check, whether it was
// changed one shift at a time (the audit log has the old and new shift) or in a
// bulk edit (only the shift's own last-changed time is left).
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("EA check finds a shift changed with under 24 hours notice, single edit and bulk edit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    const body = (await res.json())[0];
    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    return body.result.data.json;
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "Australia/Perth",
    });
  const today = day(0);
  const yesterday = day(-1);
  const farFuture = day(40);

  // The rule is there (seeded on first read) and on.
  const rules = (await get("ctoRoster.eba.listRules")) as {
    ruleKey: string;
    eaReference: string | null;
    isActive: boolean;
    thresholdValue: number | null;
  }[];
  const rule = rules.find(r => r.ruleKey === "min_notice_of_change");
  expect(rule).toMatchObject({
    eaReference: "s.33(16)(a)",
    isActive: true,
    thresholdValue: 24,
  });

  // A roster team with a fresh roster entry for the test officer.
  let teams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  if (!teams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    teams = await get("ctoRoster.teams.list");
  }
  const team = teams.find(t => t.name === "Team 1")!;
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
  const member = ((await get("ctoRoster.members.list")) as any[]).find(
    m => m.cin === cin
  );
  const memberId = member.id as number;
  const memberName = member.name as string;

  // Single edits: a rest day today becomes a Day shift (a change with under 24
  // hours to go), and a far-future shift is changed with weeks of notice.
  const edit = (shiftDate: string, shiftCode: string) =>
    call("ctoRoster.roster.updateShift", {
      memberId,
      memberName,
      shiftDate,
      shiftCode,
    });
  await edit(today, "r"); // first filling in — not a change
  await edit(today, "d"); // the change
  await edit(farFuture, "r");
  await edit(farFuture, "d"); // plenty of notice

  // Bulk edit: a shift yesterday set, then (after the row has existed a few
  // seconds) changed in bulk — only the row's own times say when.
  await call("ctoRoster.roster.bulkUpdate", {
    memberId,
    memberName,
    dates: [yesterday],
    shiftCode: "r",
  });
  await page.waitForTimeout(6500);
  await call("ctoRoster.roster.bulkUpdate", {
    memberId,
    memberName,
    dates: [yesterday],
    shiftCode: "a",
  });

  const result = await call("ctoRoster.eba.runCheck", {
    scope: "custom",
    startDate: yesterday,
    endDate: farFuture,
  });
  const mine = (result.findings as any[]).filter(
    f => f.ruleKey === "min_notice_of_change" && f.memberId === memberId
  );
  const forDate = (d: string) => mine.filter(f => f.dates.includes(d));

  // Today: from r to d, found from the audit log.
  expect(forDate(today)).toHaveLength(1);
  expect(forDate(today)[0].detail).toContain("from r to d");
  expect(forDate(today)[0].eaReference).toBe("s.33(16)(a)");
  // Yesterday: the bulk edit, earlier shift not recorded, after it started.
  expect(forDate(yesterday)).toHaveLength(1);
  expect(forDate(yesterday)[0].detail).toContain(
    "the earlier shift is not recorded"
  );
  expect(forDate(yesterday)[0].detail).toContain("after the shift had started");
  // Weeks ahead: enough notice, nothing found.
  expect(forDate(farFuture)).toHaveLength(0);

  // The EA Compliance page lists the rule under Manage Rules.
  await page.goto("/cto-roster/ea-compliance");
  await page.getByRole("tab", { name: "Manage Rules" }).click();
  await expect(
    page.getByText("Minimum notice of a change to attendance").first()
  ).toBeVisible();
});

test("A dismissed breach clears from the roster dots and the Weekly Tasking, is recorded in the roster Audit Log, and can be restored", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    const body = (await res.json())[0];
    expect(body.error, JSON.stringify(body.error)).toBeUndefined();
    return body.result.data.json;
  };
  const get = async (proc: string, input: unknown = null) => {
    const res = await page.request.get(
      `/api/trpc/${proc}?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}`
    );
    return (await res.json())[0].result.data.json;
  };
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });

  let teams = (await get("ctoRoster.teams.list")) as {
    id: number;
    name: string;
  }[];
  if (!teams.some(t => t.name === "Team 1")) {
    await call("ctoRoster.teams.add", { name: "Team 1" });
    teams = await get("ctoRoster.teams.list");
  }
  const team = teams.find(t => t.name === "Team 1")!;
  const existing = ((await get("ctoRoster.members.list")) as any[]).find(
    m => m.cin === cin
  );
  if (existing)
    await call("ctoRoster.members.delete", {
      memberId: existing.id,
      deleteShifts: true,
    });
  await call("ctoRoster.members.add", { cin, teamId: team.id });
  const member = ((await get("ctoRoster.members.list")) as any[]).find(
    m => m.cin === cin
  );
  const memberId = member.id as number;
  const memberName = member.name as string;
  const edit = (shiftCode: string) =>
    call("ctoRoster.roster.updateShift", {
      memberId,
      memberName,
      shiftDate: today,
      shiftCode,
    });
  await edit("r");
  await edit("d"); // a change today: under 24 hours notice

  const mine = (r: { findings: any[] }) =>
    r.findings.filter(
      f =>
        f.ruleKey === "min_notice_of_change" &&
        f.memberId === memberId &&
        f.dates.includes(today)
    );
  // The red dots' two sources both show it.
  expect(mine(await get("ctoRoster.eba.liveFindings"))).toHaveLength(1);
  expect(
    (await get("ctoRoster.eba.taskingBreaches")).filter(
      (f: any) =>
        f.memberId === memberId && f.ruleKey === "min_notice_of_change"
    )
  ).toHaveLength(1);

  // Dismiss it.
  const found = mine(await get("ctoRoster.eba.liveFindings"))[0];
  const key = {
    ruleKey: found.ruleKey,
    memberId,
    dates: found.dates as string[],
  };
  const r1 = await call("ctoRoster.eba.dismissFindings", {
    scope: "main",
    findings: [key],
  });
  expect(r1.dismissed).toBe(1);
  // Gone from both dot sources, and listed as dismissed with who.
  expect(mine(await get("ctoRoster.eba.liveFindings"))).toHaveLength(0);
  expect(
    (await get("ctoRoster.eba.taskingBreaches")).filter(
      (f: any) =>
        f.memberId === memberId && f.ruleKey === "min_notice_of_change"
    )
  ).toHaveLength(0);
  const after = await call("ctoRoster.eba.runCheck", { scope: "main" });
  const dismissed = after.dismissed.filter(
    (f: any) => f.memberId === memberId && f.ruleKey === "min_notice_of_change"
  );
  expect(dismissed).toHaveLength(1);
  expect(dismissed[0].dismissedBy).toBeTruthy();
  // Dismissing something that is not a finding does nothing.
  const r2 = await call("ctoRoster.eba.dismissFindings", {
    scope: "main",
    findings: [{ ruleKey: "max_hours_7day", memberId, dates: [today] }],
  });
  expect(r2.dismissed).toBe(0);

  // The roster Audit Log records it: who, the rule, the dates and the shifts.
  const audit = await get("ctoRoster.audit.list", {
    limit: 20,
    offset: 0,
    action: "dismiss_ea_breach",
  });
  const entry = audit.entries.find((e: any) => e.memberId === memberId);
  expect(entry).toBeTruthy();
  expect(entry.userName).toBeTruthy();
  expect(entry.shiftDate).toBe(today);
  expect(entry.detail).toContain("Dismissed EA breach");
  expect(entry.detail).toContain("s.33(16)(a)");
  expect(entry.detail).toContain(memberName);
  expect(entry.detail).toContain(`dates: ${today}`);
  expect(entry.detail).toContain(`Shifts: ${today} d`);

  // Restore it from the EA Compliance page.
  await page.goto("/cto-roster/ea-compliance");
  await page
    .getByRole("button", { name: /run check/i })
    .first()
    .click();
  await expect(page.getByText(/Dismissed — \d+ breach/)).toBeVisible();
  await page.getByRole("button", { name: "Restore all" }).click();
  await expect
    .poll(async () => mine(await get("ctoRoster.eba.liveFindings")).length)
    .toBe(1);
  const restored = await get("ctoRoster.audit.list", {
    limit: 20,
    offset: 0,
    action: "restore_ea_breach",
  });
  expect(
    restored.entries.some((e: any) => e.memberId === memberId && e.userName)
  ).toBe(true);

  // And dismiss it again from the same page, with the button on the finding.
  await page
    .getByRole("button", { name: /run check/i })
    .first()
    .click();
  await page
    .locator("div.cursor-pointer")
    .filter({ hasText: memberName })
    .first()
    .click(); // open the member's card
  const card = page
    .locator("div.rounded-md")
    .filter({ hasText: "Minimum notice of a change to attendance" });
  await card
    .getByTitle("Dismiss this issue (recorded in the roster Audit Log)")
    .first()
    .click();
  await expect
    .poll(async () => mine(await get("ctoRoster.eba.liveFindings")).length)
    .toBe(0);
  await expect(page.getByText(/Dismissed — \d+ breach/)).toBeVisible();
});
