// The side menu (client/src/components/DashboardLayout.tsx and the nav pieces it
// is split into): in tile view a tile opens its page, a tile with children opens
// a menu of them (Op Manager, Administration, User Management), and the folder
// view's Op Manager folder opens to its items. A safety net for moving the nav
// components into their own files (docs/features/dev-and-ops.md, phase 3). The
// folder view's items are also covered in screens-10-tasking-post-and-timeline.
//
// Needs a running instance and an admin account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("the side menu: tile view tiles open pages and menus, folder view opens Op Manager", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const noError = () =>
    expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);
  const setMode = async (mode: "tile" | "folder") => {
    await page.evaluate(m => localStorage.setItem("viewMode", m), mode);
    await page.goto("/governance");
    await expect(
      page.getByRole("heading", { name: "Outstanding Actions" })
    ).toBeVisible();
  };

  // ── Tile view ───────────────────────────────────────────────────────────
  await setMode("tile");
  for (const name of [
    "Operations",
    "Governance",
    "Mapping",
    "Op Manager",
    "Administration",
    "User Management",
  ])
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();

  // A plain tile opens its page.
  await page.getByText("Mapping", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/intelligence\/mapping/);
  await noError();

  // A tile with children opens a menu of them.
  await page.goto("/governance");
  await page.getByText("Op Manager", { exact: true }).first().click();
  await expect(page.getByText("CTO Weekly Tasking")).toBeVisible();
  await expect(page.getByText("Weekly Activity")).toBeVisible();
  await page.getByText("Weekly Activity").click();
  await expect(page).not.toHaveURL(/\/governance$/);
  await noError();

  // Administration (an admin tile) lists its pages; one opens.
  await page.goto("/governance");
  await page.getByText("Administration", { exact: true }).first().click();
  await expect(page.getByText("Audit Log")).toBeVisible();
  await expect(page.getByText("Recycle Bin")).toBeVisible();
  await page.getByText("Audit Log").click();
  await expect(page).not.toHaveURL(/\/governance$/);
  await noError();

  // User Management lists its pages too.
  await page.goto("/governance");
  await page.getByText("User Management", { exact: true }).first().click();
  await page.waitForTimeout(400);
  await noError();

  // ── Folder view ─────────────────────────────────────────────────────────
  await setMode("folder");
  await page.getByText("Op Manager", { exact: true }).first().click();
  await expect(page.getByText("CTO Roster").first()).toBeVisible();
  await expect(page.getByText("CTO Weekly Tasking").first()).toBeVisible();
  await noError();
});
