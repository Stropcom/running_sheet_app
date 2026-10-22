// Smoke tests for the main officer workflow, driven through the real UI:
// sign in → create an operation → create a running sheet → add a row with an
// observation and a CIN → see it saved and locked. They only prove the pages
// load and the core path holds together; the rules behind each step are
// covered by the unit tests in server/*.test.ts.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect, type Locator } from "@playwright/test";
import { USERNAME, PASSWORD, createOperationAndSheet } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

// A CIN on a row is shown as a pill that may be an input or plain text, so
// look at both the text and the values of any inputs in the row.
async function expectCin(row: Locator, cin: string) {
  await expect
    .poll(async () => {
      const text = await row.innerText();
      const values = await row
        .locator("input")
        .evaluateAll(els => els.map(e => (e as HTMLInputElement).value));
      return [text, ...values].join(" ").includes(cin);
    })
    .toBe(true);
}

test("create an operation and a sheet, add a row and certify it", async ({
  page,
}) => {
  // The signed-in officer's own CIN, added to a row below.
  const cin = process.env.E2E_CIN ?? "E2E1";
  const observation = "Surveillance commenced at the test location";

  await createOperationAndSheet(page);
  await expect(page.getByText("No rows yet")).toBeVisible();

  // Row: the observation, then the CIN of whoever was present
  await page.getByRole("button", { name: "Add Row" }).click();
  await page.getByText("Enter observation…").first().click();
  const textarea = page.locator("textarea").first();
  await textarea.fill(observation);
  // Click an empty part of the page so the cell saves (it saves on click-out).
  await page.mouse.click(700, 620);
  const row = page.locator("tbody tr").first();
  await expect(row).toContainText(observation);

  await row.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByPlaceholder("Enter CIN").fill(cin);
  // The CIN is checked against registered users (a green tick), then the
  // round "+" button next to it adds it to the row.
  await row.locator("button:has(svg.lucide-plus)").click();
  await expectCin(row, cin);

  // Saved, not just shown: reload and the row is still there with its CIN.
  await page.reload();
  const saved = page.locator("tbody tr").first();
  await expect(saved).toContainText(observation);
  await expectCin(saved, cin);

  // Certify: the CIN shows red until its owner clicks it. Once every CIN on
  // the row has certified the row shows "Locked" and the observation can no
  // longer be edited.
  await saved.getByText(cin, { exact: true }).click();
  await expect(saved.getByText("Locked", { exact: true })).toBeVisible();
  await saved.getByText(observation).click();
  await expect(page.locator("textarea")).toHaveCount(0);
});

// Every page that doesn't need Google Maps should open without the error
// screen or an uncaught script error. This is the check that would have
// caught a blank-screen deploy (see ops-notes.md, 2026-09-06).
const PAGES = [
  "/",
  "/todo",
  "/shortcuts",
  "/intelligence",
  "/governance",
  "/target-registry",
  "/images",
  "/calendar",
  "/court/statements",
  "/court/witness-list",
  "/court/wipc",
  "/help",
  "/recycle-bin",
  "/draft",
  "/audit",
  "/admin",
  "/profile",
];

test("main pages open without an error screen", async ({ page }) => {
  const scriptErrors: string[] = [];
  page.on("pageerror", e => scriptErrors.push(`${page.url()} — ${e.message}`));

  for (const path of PAGES) {
    await page.goto(path);
    // The app shell (sidebar) is up and the error boundary is not showing.
    await expect(page.getByText("Operations").first()).toBeVisible();
    await expect(
      page.getByText("An unexpected error occurred."),
      `${path} shows the error screen`
    ).toHaveCount(0);
  }
  expect(scriptErrors).toEqual([]);
});

// The address the uptime monitor points at. It must answer without signing in
// and must not be the app's own page (which would always look "up").
test("the health address answers ok, with no sign-in", async ({ browser }) => {
  const context = await browser.newContext(); // no saved session
  const res = await context.request.get("/healthz");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  await context.close();
});
