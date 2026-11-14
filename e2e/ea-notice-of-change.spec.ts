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
