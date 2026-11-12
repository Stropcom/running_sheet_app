// New Intelligence at the bottom of the Supervisor Summary: automatic lines
// from the running sheet's own wording (with straight counts), ticking a line
// out of the PDF, adding / editing / removing a hand-added line, the PDF order
// (Issues above Summary, New Intelligence last) and the lock once the summary
// is complete.
//
// Needs a running instance and a real admin account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import {
  USERNAME,
  PASSWORD,
  addRowWithObservation,
  createOperationAndSheet,
} from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("New Intelligence: lines from the sheet, tick out of the PDF, add / edit / remove, order, lock", async ({
  page,
}) => {
  const { sheetId } = await createOperationAndSheet(page);
  await addRowWithObservation(
    page,
    "FRASER retrieved the brown suitcase from the boot.",
    "brown suitcase"
  );
  await addRowWithObservation(
    page,
    "WATANABE carried a black suitcase.",
    "black suitcase"
  );
  await addRowWithObservation(
    page,
    "FRASER did not use his phone.",
    "did not use"
  );
  // The last row saves when its cell closes — wait for that before leaving.
  const saved = page.waitForResponse(
    r => /row\.update/.test(r.url()) && r.status() === 200
  );
  await page.mouse.click(700, 90);
  await saved;
  await expect(page.locator("textarea")).toHaveCount(0);

  await page.goto(`/summary/${sheetId}`);
  const section = page.getByTestId("new-intelligence");
  await expect(section).toBeVisible();

  // Two automatic lines, both the same item (a suitcase).
  const lines = section.getByTestId("intel-line");
  await expect(lines).toHaveCount(2);
  // No count pill on the lines (taken out in v2.79.8).
  await expect(section).not.toContainText(/×\d+ on this sheet/);
  // The officer's sentence with the matched words picked out, nothing added.
  await expect(section.locator("mark").first()).toContainText(/suitcase/i);
  await expect(section).not.toContainText(/seen .* before/i);
  // The "did not use his phone" sentence is listed as left out on purpose.
  await expect(
    section.getByText(/1 sentence left out on purpose/)
  ).toBeVisible();
  await expect(section).toContainText("2 of 2 in the PDF");

  // Untick the brown suitcase: it stays on screen but leaves the PDF.
  await lines
    .filter({ hasText: "Brown suitcase" })
    .getByRole("checkbox")
    .click();
  await expect(section).toContainText("1 of 2 in the PDF");
  await page.reload();
  await expect(page.getByTestId("new-intelligence")).toContainText(
    "1 of 2 in the PDF"
  );

  // Add a line by hand.
  await section.getByRole("button", { name: "Add item" }).click();
  const form = section.getByTestId("intel-line-form");
  await form.getByLabel("Heading").fill("Suitcase handed over");
  await form.getByLabel("Wording").fill("Seen handing a suitcase to a male.");
  await form.getByRole("button", { name: "Add line" }).click();
  const mine = lines.filter({ hasText: "Suitcase handed over" });
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText(/Added by/);

  // Edit it, then look at the PDF.
  await mine.getByRole("button", { name: "Edit" }).click();
  await section
    .getByTestId("intel-line-form")
    .getByLabel("Wording")
    .fill("Seen handing a suitcase to a male at the gate.");
  await section.getByRole("button", { name: "Save line" }).click();
  await expect(section).toContainText("at the gate");

  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await page.waitForEvent("popup");
  await pop.waitForLoadState();
  const html = await pop.content();
  // Not a certified record: the notice is at the top and repeats in the footer.
  const notice =
    "This summary document is not a certified running sheet. All information should be checked and verified against the certified corresponding running sheet.";
  expect(html.split(notice).length - 1).toBeGreaterThanOrEqual(2);
  await expect(pop.locator(".disclaimer")).toContainText(notice);
  const at = (s: string) => html.indexOf(s);
  // New Intelligence is last of the sections; Issues now sits above Summary.
  expect(at("New Intelligence")).toBeGreaterThan(0);
  expect(at(">Issues<") === -1 || at(">Issues<") < at(">Summary<")).toBe(true);
  expect(at(">Summary<")).toBeLessThan(at("New Intelligence"));
  // Ticked and hand-added lines are in; the unticked one is out (the Summary
  // table above still lists every row, so look only at the New Intelligence part).
  const intel = html.slice(at("New Intelligence"));
  expect(intel).toContain("Black suitcase");
  expect(intel).toContain("Suitcase handed over");
  expect(intel).toContain("Added by");
  expect(intel).not.toContain("Brown suitcase");
  expect(intel).not.toContain("retrieved the brown suitcase");
  await pop.close();

  // Complete the summary: the section locks.
  await page.getByLabel("Summary Complete").click();
  await expect(section.getByText("Locked")).toBeVisible();
  await expect(section.getByRole("button", { name: "Add item" })).toHaveCount(
    0
  );
  await expect(section.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(lines.first().getByRole("checkbox")).toBeDisabled();

  // Reopen: editing is back; remove the hand-added line.
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(section.getByRole("button", { name: "Add item" })).toBeVisible();
  page.once("dialog", d => d.accept());
  await mine.getByRole("button", { name: "Remove" }).click();
  await expect(mine).toHaveCount(0);
});

test("Weekly Report: Actions and items this week — heading, one grey line, day boxes, straight count, hand-added tag", async ({
  page,
}) => {
  const operations = [
    {
      operationId: 1,
      operationName: "AURORA",
      sheetsCount: 2,
      rowsCount: 9,
      targets: [
        {
          targetId: 11,
          targetName: "Amadou TRAORE",
          officers: ["459"],
          teamLabel: "Team 1",
          days: ["2026-10-21"],
          coverageHours: 7,
          shifts: [
            { date: "2026-10-21", startMinutes: 420, finishMinutes: 840 },
          ],
          investigator: null,
          intelSupport: null,
          contacted: null,
          specialProjects: [],
          objectives: [],
          criticalDecisions: [],
          issues: [],
          targetActivity: [],
          newIntel: {
            persons: [],
            vehicles: [],
            locations: [],
            images: [],
            actions: [
              {
                category: "items",
                heading: "Brown suitcase",
                group: "suitcase",
                line: "FRASER retrieved the brown suitcase from the boot",
                dates: ["2026-10-20", "2026-10-22"],
                count: 3,
              },
              {
                category: "devices",
                heading: "Second phone",
                group: "second phone",
                line: "Seen by 4A1 using a second mobile phone.",
                dates: ["2026-10-22"],
                count: 1,
                addedByCIN: "4A1",
              },
            ],
          },
        },
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
  await page.getByRole("button", { name: /AURORA/ }).click();
  const actions = page.getByTestId("wk-actions");
  await expect(actions).toBeVisible();
  await expect(actions).toContainText("Actions and items this week");
  await expect(actions).toContainText("Brown suitcase");
  // No "N times this week" — the day boxes show which days it happened.
  await expect(actions).not.toContainText(/times? this week/);
  await expect(actions).toContainText(
    "FRASER retrieved the brown suitcase from the boot"
  );
  await expect(actions).toContainText("Added by 4A1");
  // Straight counts only: nothing about other sheets or first-time.
  await expect(actions).not.toContainText(
    /sheets in all|first time|seen .* before/i
  );
  // Seven day boxes, Monday to Sunday, lit for the days it happened.
  const firstItem = actions.locator("div.rounded-lg").first();
  await expect(firstItem.locator('span[title^="2026-10-"]')).toHaveCount(7);

  const popupP = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await popupP;
  await pop.waitForLoadState();
  await expect(pop.locator(".act-item")).toHaveCount(2);
  await expect(pop.locator(".act-item").first()).not.toContainText(
    /times? this week/
  );
  await expect(
    pop.locator(".act-item").first().locator(".act-day")
  ).toHaveCount(7);
  await expect(
    pop.locator(".act-item").first().locator(".act-day.on")
  ).toHaveCount(2);
  await expect(pop.locator(".act-added")).toHaveText("Added by 4A1");
  await pop.close();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Deployment Summaries (the roll-up): each sheet reads like the Supervisor Summary — Issues above Summary, New Intelligence last, read only", async ({
  page,
}) => {
  const { opId, sheetId } = await createOperationAndSheet(page);
  await addRowWithObservation(
    page,
    "FRASER retrieved the brown suitcase from the boot.",
    "brown suitcase"
  );
  // The roll-up lists a sheet once its Summary tab has been opened; wait for
  // the row to be saved (the summary then shows its line).
  await page.goto(`/summary/${sheetId}`);
  await expect(async () => {
    await page.reload();
    await expect(
      page.getByTestId("new-intelligence").getByTestId("intel-line")
    ).toHaveCount(1, { timeout: 3000 });
  }).toPass({ timeout: 20000 });
  // Issues is a list like Objectives and Critical Decisions: "Add Issue".
  await page.getByRole("button", { name: "Add Issue" }).click();
  const issues = page
    .getByText("Issues", { exact: true })
    .locator("xpath=following::textarea[1]");
  await issues.fill("Radio dropped out twice.");
  await page.getByRole("button", { name: "Add Issue" }).click();
  // Typing saves after a short pause (800 ms), and "Add Issue" saves at once,
  // so "any summary save" is not the save that holds this text. Wait for the
  // save that carries it, or the page is left before it is stored (this was
  // the cause of the roll-up test failing now and then on GitHub).
  const lastIssueSaved = page.waitForResponse(
    r =>
      /summary\.update/.test(r.url()) &&
      r.status() === 200 &&
      (r.request().postData() ?? "").includes("Vehicle low on fuel.")
  );
  await page
    .getByText("Issues", { exact: true })
    .locator("xpath=following::textarea[2]")
    .fill("Vehicle low on fuel.");
  await lastIssueSaved;

  // The roll-up is read from the server when the sheet is opened; on a slow
  // machine a save or the roll-up can land a moment late, so open it again
  // until it shows everything (instead of failing on the first look).
  const intel = page.getByTestId("rollup-intel");
  await expect(async () => {
    await page.goto(`/operation/${opId}`);
    await page.getByRole("tab", { name: "Deployment Summaries" }).click();
    await page
      .getByRole("button", { name: /\d{1,2} \w+ \d{2}/ })
      .first()
      .click();
    await expect(page.getByText("Radio dropped out twice.")).toBeVisible({
      timeout: 4000,
    });
    await expect(page.getByText("Vehicle low on fuel.")).toBeVisible({
      timeout: 4000,
    });
    await expect(intel).toBeVisible({ timeout: 4000 });
    await expect(intel).toContainText("Brown suitcase", { timeout: 4000 });
  }).toPass({ timeout: 40_000 });
  await expect(intel.locator("mark").first()).toContainText(/suitcase/i);
  // Read only: no ticks, no Add item, no Edit.
  await expect(intel.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add item" })).toHaveCount(0);

  // Section order inside the card: Issues, then Summary, then New Intelligence.
  const text = await page.locator("main, body").first().innerText();
  const at = (s: string) => text.search(new RegExp(`^${s}$`, "im"));
  expect(at("Issues")).toBeGreaterThan(0);
  expect(at("Issues")).toBeLessThan(at("Summary"));
  expect(at("Summary")).toBeLessThan(at("New Intelligence"));

  // The export carries it too, in the same order.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const popupP = page.waitForEvent("popup");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Export PDF" })
    .click();
  const pop = await popupP;
  await pop.waitForLoadState();
  const html = await pop.content();
  await expect(pop.locator(".disclaimer")).toContainText(
    "not a certified running sheet"
  );
  const i = (s: string) => html.indexOf(`>${s}<`);
  expect(i("Issues")).toBeGreaterThan(0);
  expect(i("Issues")).toBeLessThan(i("Summary"));
  expect(i("Summary")).toBeLessThan(i("New Intelligence"));
  expect(html.slice(i("New Intelligence"))).toContain("Brown suitcase");
  await pop.close();
});

test("Exported intelligence reports carry the not-a-certified-evidentiary-document notice (Operation Profile)", async ({
  page,
}) => {
  const { opId } = await createOperationAndSheet(page);
  await page.goto(`/operation/${opId}`);
  await page.getByRole("tab", { name: "Operation Profile" }).click();
  const popupP = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF" }).click();
  const pop = await popupP;
  await pop.waitForLoadState();
  await expect(pop.locator(".disclaimer")).toContainText(
    "This document is not a certified evidentiary document. All information should be checked and verified against the certified evidentiary running sheets."
  );
  await pop.close();
});

test("New Intelligence: one thing in one sentence is one line, with what was folded in shown", async ({
  page,
}) => {
  const { sheetId } = await createOperationAndSheet(page);
  // A plain first row, so the row that matters is the last one saved below.
  await addRowWithObservation(page, "SANTOS arrived at the shop.", "arrived");
  await addRowWithObservation(
    page,
    "SANTOS, carrying the new laptop box, exited the shop and placed the box in the rear seat.",
    "new laptop box"
  );
  // Both rows are saved once they show after a reload.
  await expect(async () => {
    await page.reload();
    await expect(
      page.locator("tbody tr").filter({ hasText: "new laptop box" }).first()
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });

  await page.goto(`/summary/${sheetId}`);
  const section = page.getByTestId("new-intelligence");
  await expect(section).toBeVisible();
  // "new laptop box", the "box" and the "laptop" inside it: one line.
  const lines = section.getByTestId("intel-line");
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toContainText("New laptop box");
  // Nothing is dropped: the shorter pickups are named on the line.
  const also = lines.first().getByTestId("intel-also");
  await expect(also).toContainText("Also picked up in this sentence");
  await expect(also).toContainText("Box");
  await expect(also).toContainText("New laptop (Devices)");
  await expect(section).toContainText("1 of 1 in the PDF");
});
