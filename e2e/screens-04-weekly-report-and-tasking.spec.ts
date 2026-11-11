// The Weekly Surveillance Report PDF, CTO Weekly Tasking Copy Last Week and the Intelligence Package.
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

test("Weekly Surveillance Report PDF: full width, a card for each target, a new page for each next target, rectangular pills", async ({
  page,
}) => {
  const target = (id: number, name: string, withIntel: boolean) => ({
    targetId: id,
    targetName: name,
    officers: ["459", "484"],
    teamLabel: "Team 1",
    days: ["2026-10-21"],
    coverageHours: 8.5,
    shifts: [
      { date: "2026-10-21", startMinutes: 7 * 60, finishMinutes: 14 * 60 },
      {
        date: "2026-10-22",
        startMinutes: 13 * 60,
        finishMinutes: 20 * 60 + 30,
      },
    ],
    investigator: "Ted NUGENT",
    intelSupport: "Ted NUGENT",
    contacted: "Day prior — Text",
    specialProjects: [{ key: "LBS", detail: "AFP" }],
    objectives: ["associate meets"],
    criticalDecisions: [],
    issues: [],
    targetActivity: [
      { label: "9 Etwell Street, EAST VICTORIA PARK", count: 2 },
    ],
    newIntel: {
      persons: withIntel ? ["Lucas Minh NGUYEN (NGUYEN)"] : [],
      vehicles: [],
      locations: withIntel
        ? ["Hawaiian's Park Centre, 789 Albany Highway"]
        : [],
      images: [],
    },
  });
  const operations = [
    {
      operationId: 1,
      operationName: "AURORA",
      sheetsCount: 3,
      rowsCount: 71,
      targets: [
        target(11, "Amadou TRAORE", true),
        target(12, "Kieran DOYLE", false),
        target(13, "Third TARGET", false),
      ],
    },
    {
      operationId: 2,
      operationName: "RAVEN",
      sheetsCount: 1,
      rowsCount: 9,
      targets: [
        target(21, "Sahana MENON", false),
        target(22, "Other PERSON", false),
      ],
    },
  ];
  await page.route(/\/api\/trpc\//, async route => {
    const resp = await route.fetch();
    const json = await resp.json();
    const procs = new URL(route.request().url()).pathname
      .replace(/^.*\/api\/trpc\//, "")
      .split(",");
    const patch = (entry: any, name: string) => {
      if (name !== "reports.weeklyActivity") return;
      delete entry.error;
      entry.result = { data: { json: { operations } } };
    };
    if (Array.isArray(json)) json.forEach((e, i) => patch(e, procs[i]));
    else patch(json, procs[0]);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(json),
    });
  });

  await page.goto("/reports/weekly-activity");
  // On the page: the overview is the first thing inside each operation's dropdown.
  await page.getByRole("button", { name: /AURORA/ }).click();
  await expect(
    page.getByText("Overview", { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.getByText("3 targets · 2 days worked · 25.5 h")
  ).toBeVisible();
  await expect(page.getByText("Wed 21 Oct").first()).toBeVisible();
  await expect(page.getByText("07:00 – 14:00").first()).toBeVisible();
  // The dropdown has sections like the PDF: the overview is its own card and
  // each target is its own card, each section in it under a titled band.
  await expect(page.getByTestId("wk-overview")).toHaveCount(1);
  const wkTargets = page.getByTestId("wk-target");
  await expect(wkTargets).toHaveCount(3);
  await expect(
    wkTargets.first().getByText("Deployment", { exact: true })
  ).toBeVisible();
  const popupP = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await popupP;
  await pop.waitForLoadState();
  await expect(pop.locator(".disclaimer")).toContainText(
    "not a certified evidentiary document"
  );

  // The overview leads the report: every operation, every target, the days and
  // times worked and the hours, before the operations' own pages.
  await expect(pop.locator(".ov-op")).toHaveCount(2);
  await expect(pop.locator(".ov-target")).toHaveCount(5);
  await expect(pop.locator(".ov-op").first()).toContainText("07:00 – 14:00");
  await expect(pop.locator(".ov-op").first()).toContainText("13:00 – 20:30");
  await expect(pop.locator(".ov-hours").first()).toHaveText("8.5 h");
  const overviewTop = await pop.locator(".overview").boundingBox();
  const firstOp = await pop.locator(".op-card").first().boundingBox();
  expect(overviewTop!.y).toBeLessThan(firstOp!.y);
  const blocks = pop.locator(".target-block");
  await expect(blocks).toHaveCount(5);
  // Each target is its own card with its own header band, naming the operation.
  await expect(pop.locator(".target-subhead")).toHaveCount(5);
  await expect(pop.locator(".tgt-op").first()).toHaveText("AURORA");
  // The first target stays on the header page; the next target in an operation
  // starts a new page (a new operation already does).
  const breakOf = (i: number) =>
    blocks.nth(i).evaluate(el => getComputedStyle(el).breakBefore);
  expect(await breakOf(0)).not.toBe("page");
  expect(await breakOf(1)).toBe("page");
  expect(await breakOf(2)).toBe("page");
  expect(await breakOf(3)).not.toBe("page"); // first target of RAVEN: its operation card breaks
  expect(await breakOf(4)).toBe("page");
  expect(
    await pop
      .locator(".op-card")
      .nth(1)
      .evaluate(el => getComputedStyle(el).breakBefore)
  ).toBe("page");
  // As wide as the header band.
  const head = await pop.locator(".cover-header").boundingBox();
  const card = await blocks.first().boundingBox();
  expect(Math.round(card!.x)).toBe(Math.round(head!.x));
  expect(Math.round(card!.width)).toBe(Math.round(head!.width));
  // Pills are rectangles, not circles.
  for (const sel of [".team-pill", ".day-chip", ".coverage-total", ".chip"]) {
    const radius = await pop
      .locator(sel)
      .first()
      .evaluate(el => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(radius).toBeLessThan(8);
  }
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("CTO Weekly Tasking: Copy Last Week copies from the latest week that has contacts, the full view shows every section, a deleted week goes to the Recycle Bin and can be reinstated", async ({
  page,
}) => {
  // Three made-up weeks far from real ones: one with contacts and a priority
  // board, a later one with only its calendar, and the new week the dialog makes.
  const W1 = "2040-01-02";
  const W2 = "2040-01-09";
  const W3 = "2040-01-16";
  const call = (proc: string, input: unknown) =>
    page.request.post(`/api/trpc/${proc}?batch=1`, {
      data: { "0": { json: input } },
    });
  const wipe = async () => {
    for (const w of [W1, W2, W3])
      await call("opManager.deleteWeek", { weekStart: w });
  };
  await wipe();
  try {
    await call("opManager.saveSupervisorContacts", {
      weekStart: W1,
      contacts: [
        {
          role: "CTO Inspector",
          userId: null,
          phone: "0400 111 222",
          sortOrder: 0,
        },
      ],
    });
    await call("opManager.savePriorityBoard", {
      weekStart: W1,
      rows: [
        {
          category: "A-TACC",
          priority: 1,
          operationName: "RAVEN",
          sortOrder: 0,
        },
        { category: "WC", priority: 2, operationName: "AURORA", sortOrder: 1 },
      ],
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W1,
      dayIndex: 1,
      teamRow: "surv2",
      shiftTime: "0700-1500",
      primaryTask: "RAVEN",
    });
    await call("opManager.saveTaskingCell", {
      weekStart: W2,
      dayIndex: 0,
      teamRow: "surv1",
      shiftTime: "0600-1400",
    });

    // New week: copies from the 2 Jan week, not the calendar-only 9 Jan one.
    await page.goto("/operation-manager");
    await page
      .getByRole("button", { name: "New CTO Weekly Tasking" })
      .first()
      .click();
    await expect(
      page.getByText(/Copies contacts & priority board from 02 Jan . 08 Jan/)
    ).toBeVisible();
    await page.getByRole("button", { name: /Copy Last Week/ }).click();
    await expect(
      page.getByText(
        /Copied 1 contact and 2 priority rows from 02 Jan . 08 Jan/
      )
    ).toBeVisible();
    await page.getByRole("tab", { name: "Priority" }).click();
    await page.getByRole("button", { name: "Full View" }).click();
    await expect(page.getByText("RAVEN").first()).toBeAttached();
    await expect(page.getByText("AURORA").first()).toBeAttached();

    // A week with only its calendar still shows the whole page.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 09 Jan – 15 Jan").click();
    await expect(page.getByText("Supervisors & Contacts")).toBeVisible();
    await expect(page.getByText("Priority Board")).toBeVisible();
    await expect(
      page.getByText("No priorities set for this week.")
    ).toBeVisible();
    await expect(page.getByText("Weekly Tasking Calendar")).toBeVisible();

    // Its edit page is not blank: it offers to copy the earlier week in.
    await page.getByRole("button", { name: /Edit Contacts/ }).click();
    await expect(
      page.getByText(/This week has no contacts or priority board yet/)
    ).toBeVisible();
    await page.getByRole("button", { name: "Copy them in" }).click();
    await expect(
      page.getByText(/This week has no contacts or priority board yet/)
    ).toHaveCount(0);

    // The Weekly Tasking Calendar can be laid out four ways, the choice is
    // remembered, and an operation can be highlighted across it.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 02 Jan – 08 Jan").click();
    const picker = page.getByRole("combobox", { name: "Calendar view" });
    await expect(picker).toContainText("Team Rows");
    await expect(page.locator(".tcv-pa").first()).toBeVisible();
    for (const [label, marker] of [
      ["Team Tables", ".tcv-table"],
      ["Calendar", ".tcv-ta"],
      ["Timeline", ".tcv-cb"],
    ] as const) {
      await picker.click();
      await page.getByRole("option", { name: label }).click();
      await expect(picker).toContainText(label);
      await expect(page.locator(marker).first()).toBeVisible();
    }
    const highlight = page.getByRole("group", {
      name: "Highlight an operation",
    });
    const raven = highlight.getByRole("button", { name: "RAVEN", exact: true });
    await expect(raven).toHaveAttribute("aria-pressed", "false");
    await raven.click();
    await expect(raven).toHaveAttribute("aria-pressed", "true");
    await highlight.getByRole("button", { name: "All", exact: true }).click();
    await expect(raven).toHaveAttribute("aria-pressed", "false");
    // Remembered: back at the list and into the week again, it is still the timeline.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 02 Jan – 08 Jan").click();
    await expect(
      page.getByRole("combobox", { name: "Calendar view" })
    ).toContainText("Timeline");
    await expect(page.locator(".tcv-cb").first()).toBeVisible();

    // The full view has Export PDF (the same preview window as every other
    // export), not a bare browser Print.
    await page.goto("/operation-manager");
    await page.getByText("CTO Weekly Tasking — 02 Jan – 08 Jan").click();
    await expect(page.getByRole("button", { name: "Print" })).toHaveCount(0);
    await page.getByRole("button", { name: "Export PDF" }).click();
    // The export asks which layout (one or two): the one on screen is ticked,
    // a third cannot be ticked, and at least one is needed.
    const layouts = page.getByRole("group", {
      name: "Calendar layouts to export",
    });
    const timeline = layouts.getByRole("checkbox", { name: "Timeline" });
    const banded = layouts.getByRole("checkbox", { name: "Team Rows" });
    const tiles = layouts.getByRole("checkbox", { name: "Calendar" });
    await expect(timeline).toBeChecked();
    await banded.click();
    await expect(banded).toBeChecked();
    await expect(tiles).toBeDisabled();
    await timeline.click();
    await expect(tiles).toBeEnabled();
    await banded.click();
    await expect(
      page.getByRole("button", { name: "Export", exact: true })
    ).toBeDisabled();
    await banded.click();
    await timeline.click();
    const exportPopup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pop = await exportPopup;
    await pop.waitForLoadState();
    const html = await pop.content();
    expect(html).toContain("CTO Weekly Tasking");
    expect(html).toContain("Weekly Tasking Calendar · Team Rows");
    expect(html).toContain("Weekly Tasking Calendar · Timeline");
    expect(html).not.toContain("Weekly Tasking Calendar · Calendar");
    expect(html).toContain("02 Jan – 08 Jan 2040");
    expect(html).toContain("0400 111 222");
    expect(html).toContain("RAVEN");
    expect(html).toContain("Weekly Tasking Calendar");
    await expect(
      pop.getByRole("button", { name: /Close Preview/ })
    ).toBeVisible();
    await pop.close();

    // Delete a week from the list.
    await page.goto("/operation-manager");
    await expect(
      page.getByText("CTO Weekly Tasking — 16 Jan – 22 Jan")
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /Delete the weekly tasking for 16 Jan . 22 Jan/,
      })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(
      page.getByText("CTO Weekly Tasking — 16 Jan – 22 Jan")
    ).toHaveCount(0);
    await expect(
      page.getByText("CTO Weekly Tasking — 09 Jan – 15 Jan")
    ).toBeVisible();

    // It went to the Recycle Bin, and Reinstate brings it back with its contents.
    await page.goto("/recycle-bin");
    const binRow = page
      .locator("div")
      .filter({ hasText: "CTO Weekly Tasking — 16 Jan – 22 Jan" })
      .filter({ has: page.getByRole("button", { name: "Reinstate" }) })
      .last();
    await expect(binRow).toContainText("Weekly Tasking");
    await expect(binRow).toContainText("1 contact");
    await expect(binRow).toContainText("2 priority rows");
    await binRow.getByRole("button", { name: "Reinstate" }).click();
    await expect(page.getByText(/reinstated successfully/)).toBeVisible();
    await page.goto("/operation-manager");
    await expect(
      page.getByText("CTO Weekly Tasking — 16 Jan – 22 Jan")
    ).toBeVisible();
  } finally {
    await wipe();
  }
});

test("Intelligence Package has Places as a ticked section between Heat Map and Pattern of Life", async ({
  page,
}) => {
  await page.goto("/intelligence");
  await page.getByRole("button", { name: "Packages", exact: true }).click();
  const contents = page.getByText("Package contents").locator("..");
  const names = await contents.locator("label .font-medium").allTextContents();
  const heat = names.indexOf("Heat Map");
  expect(heat).toBeGreaterThan(-1);
  expect(names[heat + 1]).toBe("Places");
  expect(names[heat + 2]).toBe("Pattern of Life");
  // Like every other section, it is ticked until someone unticks it.
  const places = contents.locator("label", { hasText: "Places" }).first();
  await expect(places.getByRole("checkbox")).toBeChecked();
  await places.click();
  await expect(places.getByRole("checkbox")).not.toBeChecked();
});
