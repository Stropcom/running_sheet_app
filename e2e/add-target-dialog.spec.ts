// The Add Target dialog (client/src/components/AddTargetDialog.tsx and the pieces
// it is split into: addTarget/): fill in the four tabs, add a staged associate,
// save, and the target and its associate are in the registry. A safety net for
// moving the dialog's state and layout into their own files
// (docs/features/dev-and-ops.md, phase 3).
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

// A surname made only of capitals (digits become letters), unique per run.
const letters = (n: number) =>
  String(n)
    .split("")
    .map(d => "ABCDEFGHIJ"[Number(d)])
    .join("");

test("Add Target: the four tabs, a staged associate, Save, and both are in the registry", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const stamp = Date.now();
  const opName = `Add target ${stamp}`;
  await post("operation.create", { name: opName });
  const surname = `ADDT${letters(stamp)}`;
  const associateSurname = `ASSC${letters(stamp)}`;

  await page.goto("/target-registry");
  await page.getByRole("button", { name: "Add Target" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Add Target to Registry")).toBeVisible();

  // Tab 1 — the target: operation, name, MDL, bail, special projects, no address / vehicle.
  await dialog.getByText("Select an operation…").click();
  await page.getByRole("option", { name: opName }).click();
  await dialog.getByPlaceholder("Paul").fill("Zed");
  await dialog.getByPlaceholder("HOGAN").fill(surname);
  await dialog.getByText("Licence status…").click();
  await page.getByRole("option", { name: "None" }).click();
  await dialog.getByText("Select…").first().click();
  await page.getByRole("option", { name: "No", exact: true }).click();
  await dialog.getByText("NONE", { exact: true }).first().click();
  await dialog.getByRole("checkbox", { name: /No known address/ }).click();
  await dialog.getByRole("checkbox", { name: /No known vehicles/ }).click();
  await dialog.getByRole("button", { name: /^Next: Residents/ }).click();

  // Tab 2 — residents: nobody else lives there.
  await dialog.getByRole("checkbox", { name: /No other residents/ }).click();
  await dialog.getByRole("button", { name: /^Next: Associates/ }).click();

  // Tab 3 — one staged associate, filled in by hand.
  await dialog.getByPlaceholder("Paul").last().fill("Ann");
  await dialog.getByPlaceholder("HOGAN").last().fill(associateSurname);
  await dialog
    .getByRole("checkbox", { name: /No known address/ })
    .last()
    .click();
  await dialog
    .getByRole("checkbox", { name: /No known vehicles/ })
    .last()
    .click();
  await dialog.getByRole("button", { name: /^Next: Background/ }).click();

  // Tab 4 — background: nothing to add, then Save.
  const none = dialog.getByRole("checkbox", { name: /No background|nothing/i });
  if (await none.count()) await none.first().click();
  await dialog.getByRole("button", { name: /Save Target/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // The target is in the registry, with its associate.
  await page.getByPlaceholder("Search targets…").fill(surname);
  await expect(page.getByText(new RegExp(surname)).first()).toBeVisible();
  await page.getByText(new RegExp(surname)).first().click();
  await expect(
    page.getByText(new RegExp(associateSurname)).first()
  ).toBeVisible();
  await expect(page.getByText("An unexpected error occurred.")).toHaveCount(0);
});
