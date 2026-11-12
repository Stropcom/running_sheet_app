// Appearance, My Profile and the Ego Network on a phone.
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

test("Appearance: the light header and side panel is saved, applied and kept across a reload", async ({
  page,
}) => {
  await page.goto("/profile");
  const html = page.locator("html");
  // Profile sections start closed; open Appearance (kept open after reload).
  await page
    .getByTestId("profile-section-appearance")
    .getByRole("button", { name: /Appearance/ })
    .click();
  await page.getByTestId("chrome-style-light").click();
  await expect(html).toHaveAttribute("data-chrome", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-chrome", "light");
  // The side panel really changed colour (light, not the dark rail).
  const rail = page.locator('[data-sidebar="sidebar"]').first();
  const railColour = () =>
    rail.evaluate(el => getComputedStyle(el).backgroundColor);
  const lightColour = await railColour();
  // Put it back so the next test sees the default.
  await page.getByTestId("chrome-style-dark").click();
  await expect(html).toHaveAttribute("data-chrome", "dark");
  expect(await railColour()).not.toBe(lightColour);
});

test("My Profile sections start closed and stay the way they were left", async ({
  page,
}) => {
  await page.goto("/profile");
  const info = page.getByTestId("profile-section-info");
  const button = info.getByRole("button", { name: /Profile Information/ });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  // Every titled section on the page starts closed.
  for (const b of await page
    .locator('[data-testid^="profile-section-"] h2 button')
    .all()) {
    await expect(b).toHaveAttribute("aria-expanded", "false");
  }
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(info.getByText("Your account details")).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByTestId("profile-section-info")
      .getByRole("button", { name: /Profile Information/ })
  ).toHaveAttribute("aria-expanded", "true");
  // Close it again so the next run starts from the default.
  await page
    .getByTestId("profile-section-info")
    .getByRole("button", { name: /Profile Information/ })
    .click();
  await expect(
    page.getByTestId("profile-section-info").getByText("Your account details")
  ).toBeHidden();
});

test("Ego Network on a phone fits the screen and zooms in and out", async ({
  page,
}) => {
  // A small made-up graph, so the test does not depend on what is in the
  // database: one target with five direct links.
  const node = (id: string, label: string, type: string) => ({
    id,
    label,
    type,
    occurrences: 3,
    operationIds: [1],
    operationNames: ["RAVEN"],
    targetId: null,
  });
  const nodes = [
    node("t", "Sahana Priya MENON (MENON)", "target"),
    node("a", "Terminal 4, Perth Airport WA", "address"),
    node("b", "Belmont Forum, 227 Belmont Avenue", "address"),
    node("c", "Daniel Tomas IBARRA (IBARRA)", "person"),
    node("d", "1MEN83 blue Mercedes-Benz GLC", "vehicle"),
    node("e", "Bunnings Belmont WA", "business"),
  ];
  const edges = ["a", "b", "c", "d", "e"].map(id => ({
    source: "t",
    target: id,
    weight: 3,
  }));
  await page.route(/getAssociationGraph/, async route => {
    const resp = await route.fetch();
    const json = await resp.json();
    const procs = new URL(route.request().url()).pathname
      .replace("/api/trpc/", "")
      .split(",");
    const i = procs.indexOf("intelligence.getAssociationGraph");
    const data = { nodes, edges };
    if (Array.isArray(json)) json[i].result.data.json = data;
    else json.result.data.json = data;
    await route.fulfill({ response: resp, json });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/intelligence?tab=egonet");
  await page.getByText(/Select focus entity/).click();
  await page.getByRole("option", { name: /MENON/ }).first().click();

  const canvas = page.getByTestId("ego-canvas");
  const layer = canvas.locator("> div.absolute.inset-0");
  // The picture fits the screen: nothing sticks out sideways.
  const box = (await canvas.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(0);
  await expect(layer).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)/);

  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(layer).not.toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)/);
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await expect(layer).toHaveCSS("transform", /matrix\(1, 0, 0, 1, 0, 0\)/);
});
