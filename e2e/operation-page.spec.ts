// The operation page (client/src/pages/OperationDetail.tsx and the pieces it is
// split into): the running-sheet cards in both views (folder / tile) with the
// target's name, the Deployment Summaries tab, and the target card that the
// ?tab=target&targetId=… deep link opens expanded. A safety net for moving
// those pieces into their own files (docs/features/dev-and-ops.md, phase 3).
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("the operation page shows its sheet cards in both views, the summaries tab and the target card", async ({
  page,
}) => {
  const cin = process.env.E2E_CIN ?? "E2E1";
  await page.goto("/");
  const post = async (path: string, json: unknown) => {
    const r = await page.request.post(`/api/trpc/${path}`, { data: { json } });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };
  const stamp = Date.now();
  // An address of its own: a shared one ("12 Smith Street") becomes a second
  // entity on other tests' operations that type it (screens-01 expects one).
  const street = `${stamp % 1000} Piecespage Street`;
  const op = await post("operation.create", { name: `Op page ${stamp}` });
  const opId = op.id ?? op.operationId ?? op;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const targetName = `PIECES Target ${stamp}`;
  const target = await post("target.create", {
    operationId: opId,
    name: targetName,
    hbf: `${street}, PERTH WA`,
    v1f: "white Toyota Camry sedan, bearing 1ABC123",
  });
  const targetId = target.id ?? target.targetId ?? target;
  const sheet = await post("sheet.create", {
    operationId: opId,
    targetId,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation: `Surveillance commenced in the vicinity of ${street}.`,
  });

  const noError = async (what: string) =>
    expect(
      page.getByText("An unexpected error occurred."),
      `${what} shows the error screen`
    ).toHaveCount(0);

  // Running sheets, folder view (a card each) then tile view; both name the
  // sheet's target and open the sheet.
  await page.goto(`/operation/${opId}`);
  await page.evaluate(() => localStorage.setItem("viewMode", "folder"));
  await page.reload();
  await expect(page.getByText(targetName).first()).toBeVisible();
  await noError("folder view");
  await page.getByLabel("Tile view").first().click();
  await expect(page.getByText(targetName).first()).toBeVisible();
  await noError("tile view");
  await page.getByLabel("Folder view").first().click();
  await expect(page.getByText(targetName).first()).toBeVisible();
  await expect(
    page.getByText("1 running sheet", { exact: true })
  ).toBeVisible();

  // Deployment Summaries: the panel opens without the error screen.
  await page.getByRole("tab", { name: "Deployment Summaries" }).click();
  await noError("Deployment Summaries");

  // The target card, opened by the deep link: expanded, with its details.
  await page.goto(`/operation/${opId}?tab=target&targetId=${targetId}`);
  await expect(page.getByText(targetName).first()).toBeVisible();
  await expect(page.getByText(/first name\/s/i).first()).toBeVisible();
  await expect(page.getByText(/special projects/i).first()).toBeVisible();
  await expect(page.getByText(/home address/i).first()).toBeVisible();
  await noError("the target card");
});
