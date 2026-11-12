// The Target Registry page (client/src/pages/TargetRegistry.tsx and the pieces
// it is split into): a target's card opens, shows its Associates and Other Home
// Address Residents, and an associate's card opens. A safety net for moving those
// pieces into their own files (docs/features/dev-and-ops.md, phase 3).
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("a registry target opens to show its associates and residents, and an associate opens", async ({
  page,
}) => {
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const stamp = Date.now();
  const op = await post("operation.create", { name: `Registry page ${stamp}` });
  const opId = op.id ?? op.operationId ?? op;
  const targetName = `REGPIECE Target ${stamp}`;
  const target = await post("target.create", {
    operationId: opId,
    name: targetName,
    hbf: "12 Smith Street, PERTH WA",
  });
  const targetId = target.id ?? target.targetId ?? target;
  const associateName = `ASSOCPIECE Person ${stamp}`;
  const residentName = `RESIDPIECE Person ${stamp}`;
  await post("associate.create", {
    targetId,
    name: associateName,
    relationship: "associate",
  });
  await post("associate.create", {
    targetId,
    name: residentName,
    relationship: "resident",
  });

  const noError = async (what: string) =>
    expect(
      page.getByText("An unexpected error occurred."),
      `${what} shows the error screen`
    ).toHaveCount(0);

  await page.goto("/target-registry");
  await page.getByPlaceholder("Search targets…").fill(String(stamp));
  const card = page.getByText(targetName).first();
  await expect(card).toBeVisible();
  await noError("the registry list");

  // Open the target's card: its associates and residents are listed.
  await card.click();
  await expect(
    page.getByText(/other home address residents/i).first()
  ).toBeVisible();
  await expect(page.getByText(associateName).first()).toBeVisible();
  await expect(page.getByText(residentName).first()).toBeVisible();
  await noError("the open target card");

  // Open an associate's card.
  await page.getByText(associateName).first().click();
  await expect(page.getByText(/first name\/s/i).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload Image" }).first()
  ).toBeVisible();
  await noError("the open associate card");
});
