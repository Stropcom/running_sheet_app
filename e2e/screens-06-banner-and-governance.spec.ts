// The top banner, tasking notifications and counts, and Governance Imagery.
// Split out of the old e2e/screens.spec.ts (v2.83.4); the tests are unchanged.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD, createOperationAndSheet } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe.configure({ mode: "serial" });

test("Top banner: the operation name is a Show & Share switch, green while on", async ({
  page,
}) => {
  const created = await createOperationAndSheet(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // The operation is selected on the Map, and sharing starts off.
  await page.evaluate(opId => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith("runlog_sharing_u")) localStorage.removeItem(k);
    localStorage.setItem(
      "runlog_map_settings",
      JSON.stringify({ selectedOpIds: [opId], opsExplicitlySet: true })
    );
  }, created.opId);
  await page.goto("/intelligence/mapping");

  const banner = page
    .locator("header.app-chrome button[aria-pressed]")
    .filter({ hasText: /smoke/i });
  const colour = () =>
    banner.evaluate(el => getComputedStyle(el).color as string);
  const flag = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find(k =>
        k.startsWith("runlog_sharing_u")
      );
      return k ? localStorage.getItem(k) : null;
    });
  // The side panel's own Show & Share switch, which the banner must agree with.
  const paneSwitch = page.getByRole("button", { name: /Show & Share/ }).first();
  if (!(await paneSwitch.isVisible()))
    await page.getByRole("button", { name: "Toggle side panel" }).click();
  await expect(paneSwitch).toBeVisible();

  await expect(banner).toHaveAttribute("aria-pressed", "false");
  const white = await colour();

  await banner.click();
  await expect(banner).toHaveAttribute("aria-pressed", "true");
  await expect(paneSwitch).toHaveAttribute("aria-pressed", "true");
  expect(await flag()).toBe("true");
  // Phosphor green: the same colour the --share-on variable resolves to.
  const green = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--share-on)";
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  // The colour fades in, so wait for it to settle.
  await expect.poll(colour).toBe(green);
  expect(green).not.toBe(white);

  // The side-panel switch turns it off again too, and the banner follows.
  await paneSwitch.click();
  await expect(banner).toHaveAttribute("aria-pressed", "false");
  await expect.poll(colour).toBe(white);
  expect(await flag()).toBe("false");

  // And the banner turns it off when it was on.
  await banner.click();
  await expect(paneSwitch).toHaveAttribute("aria-pressed", "true");
  await banner.click();
  await expect(paneSwitch).toHaveAttribute("aria-pressed", "false");
  expect(await flag()).toBe("false");
});

test("A 'tasking posted' notification opens that week's tasking, not just the folder", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-07-02"; // a Monday, a made-up week
  const call = async (proc: string, input: unknown) => {
    const res = await page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
    return (await res.json())[0];
  };
  const me = await (await page.request.get("/api/trpc/auth.me")).json();
  const myId = me.result.data.json.id as number;

  await call("opManager.deleteWeek", { weekStart: W });
  try {
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1400",
      primaryTask: "RAVEN",
    });
    // Posted to this officer only.
    await call("opManager.postWeek", { weekStart: W, userIds: [myId] });

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto("/");
    await page
      .locator('button[aria-label="Notifications"]:visible')
      .first()
      .click();
    await page
      .getByText(/CTO Tasking for the week of 02 Jul\w* 2040 has been posted\./)
      .first()
      .click();

    // The document itself: the week's full view (it has Post & Notify), not
    // the folder list. The address is tidied so Back does not reopen it.
    await expect(
      page.getByRole("button", { name: /Post & Notify/i })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/operation-manager$/);

    // A week that is not in the list (deleted) leaves the folder showing.
    await call("opManager.deleteWeek", { weekStart: W });
    await page.goto(`/operation-manager?week=${W}`);
    await expect(
      page.getByRole("heading", { name: "CTO Weekly Tasking" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Post & Notify/i })
    ).toHaveCount(0);
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("CTO Weekly Tasking: every layout shows each team's on-duty count, a combined day shows both", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const W = "2040-09-03"; // a Monday, a made-up week
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  await call("opManager.deleteWeek", { weekStart: W });
  try {
    // Monday: Team 1 and Team 2 combined. Tuesday: apart.
    for (const teamRow of ["surv1", "surv2"])
      await call("opManager.saveTaskingCell", {
        weekStart: W,
        dayIndex: 0,
        teamRow,
        shiftTime: "0600-1500",
        primaryTask: "AMBERLINE",
        blended: true,
      });
    await call("opManager.saveTaskingCell", {
      weekStart: W,
      dayIndex: 1,
      teamRow: "surv1",
      shiftTime: "0600-1500",
      primaryTask: "RAVEN",
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    const open = async (layout: string) => {
      await page.goto("/");
      await page.evaluate(
        v => localStorage.setItem("runlog.taskingView", v),
        layout
      );
      await page.goto("/operation-manager");
      await page.getByText(/CTO Weekly Tasking — 03 Sep/).click();
    };
    const counts = /\d+\/\d+/;

    // Team Rows and Team Tables: a count in each team's own day.
    for (const [layout, root] of [
      ["panel-banded", ".tcv"],
      ["panel-tables", ".tcv-pb"],
    ] as const) {
      await open(layout);
      const first = page.locator(`${root} .tcv-cover`).first();
      await expect(first).toBeVisible();
      await expect(first).toContainText(counts);
      // The combined Monday shows both teams' numbers, in either team's panel.
      const pair = page.locator(`${root} .tcv-cover-pair`).first();
      await expect(pair).toContainText(/T1\s*\S*\s*\d+\/\d+/);
      await expect(pair).toContainText(/T2\s*\S*\s*\d+\/\d+/);
    }

    // Calendar: a single day shows its count, a combined day shows T1 and T2.
    await open("tile-days");
    const tiles = page.locator(".tcv-ta .tcv-tile");
    const combined = tiles.nth(0).locator(".tcv-tl-cover").first();
    // "T1 + T2" without the word "combined".
    await expect(tiles.nth(0)).toContainText("T1 + T2");
    await expect(tiles.nth(0)).not.toContainText(/combined/i);
    await expect(combined).toContainText(/T1\s*\S*\s*\d+\/\d+/);
    await expect(combined).toContainText(/T2\s*\S*\s*\d+\/\d+/);
    await expect(tiles.nth(1).locator(".tcv-tl-cover").first()).toContainText(
      counts
    );
  } finally {
    await call("opManager.deleteWeek", { weekStart: W });
  }
});

test("Governance Imagery: a row marked Saved shows the CIN and name of the officer who saved it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const op = await post("operation.create", { name: `Imagery ${Date.now()}` });
  const opId = op.id ?? op.operationId ?? op;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  // The officer is flagged as having taken imagery, so the Imagery section has
  // a row for them.
  const sheet = await post("sheet.create", {
    operationId: opId,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: true, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation:
      "Surveillance commenced in the vicinity of 12 Smith Street, PERTH WA (12 Smith Street).",
  });

  // Marked saved (the screen asks for photos to be linked first; this goes to
  // the server directly, which is what stamps who it was). A name sent along
  // is not trusted.
  await post("governance.update", {
    sheetId,
    imageryEntries: [
      {
        cin,
        rowTime: "",
        type: "",
        saved: true,
        savedByCIN: "FORGED",
        savedByName: "Not Me",
      },
    ],
  });

  await page.goto(`/governance/${sheetId}`);
  await page.getByText("Operative — Imagery").click();
  const stamp = page.getByTestId("imagery-saved-by");
  await expect(stamp).toBeVisible();
  await expect(stamp).toContainText(cin);
  await expect(stamp).not.toContainText("FORGED");
  await expect(stamp).not.toContainText("Not Me");

  // Marked saved again by someone else's save of another change keeps the
  // first officer; un-saving clears the name.
  await post("governance.update", {
    sheetId,
    imageryEntries: [{ cin, rowTime: "", type: "photo", saved: true }],
  });
  await page.reload();
  await page.getByText("Operative — Imagery").click();
  await expect(page.getByTestId("imagery-saved-by")).toContainText(cin);
  await post("governance.update", {
    sheetId,
    imageryEntries: [{ cin, rowTime: "", type: "photo", saved: false }],
  });
  await page.reload();
  await page.getByText("Operative — Imagery").click();
  await expect(page.getByTestId("imagery-saved-by")).toHaveCount(0);
});

test("Top banner: the operation name shows on an iPad held sideways and clears the RunLog wordmark", async ({
  page,
}) => {
  const created = await createOperationAndSheet(page);
  await page.goto("/");
  await page.evaluate(opId => {
    localStorage.setItem(
      "runlog_map_settings",
      JSON.stringify({ selectedOpIds: [opId], opsExplicitlySet: true })
    );
  }, created.opId);
  const banner = page
    .locator("header.app-chrome button[aria-pressed]")
    .filter({ hasText: /smoke/i });
  const wordmark = page
    .locator("header.app-chrome span")
    .filter({ hasText: /^RunLog$/ });
  // 1024 / 1080 / 1180 / 1194 are the iPad widths held sideways.
  for (const width of [1024, 1080, 1180, 1194]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/intelligence/mapping");
    await expect(banner).toBeVisible();
    const b = (await banner.boundingBox())!;
    const w = (await wordmark.boundingBox())!;
    // Clear of the wordmark, and inside the screen.
    expect(b.x).toBeGreaterThanOrEqual(w.x + w.width + 8);
    expect(b.x + b.width).toBeLessThanOrEqual(width);
  }
  // Held upright there is no room for it, as before.
  await page.setViewportSize({ width: 820, height: 1100 });
  await page.goto("/intelligence/mapping");
  await expect(banner).toBeHidden();
});
