// A shortcut chip marked "Own row" on the Shortcuts page (TP, TEXT …): one tap
// adds a new row with the current time that starts with the target's SURNAME
// and then the shortcut's text. Needs a running instance and a real admin
// account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import { USERNAME, PASSWORD } from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("An Own row shortcut chip adds a row with the time and the target's surname first", async ({
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
  const get = async (path: string) => {
    const r = await page.request.get(`/api/trpc/${path}`);
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).result.data.json;
  };

  // A shortcut for a whole observation, switched to "Own row".
  const trigger = `tp${Date.now().toString().slice(-6)}`;
  const text =
    "had a mobile phone to his ear and appeared to be in conversation on the phone.";
  await post("shortcuts.create", { trigger, expansion: text });
  const made = (await get("shortcuts.list")).find(
    (s: { trigger: string }) => s.trigger === trigger
  );
  expect(made).toBeTruthy();
  expect(made.startsRow).toBe(false);
  await post("shortcuts.update", { id: made.id, startsRow: true });

  // A sheet whose target is SANTOS.
  const op = await post("operation.create", {
    name: `Own row ${Date.now()}`,
  });
  const opId = op.id ?? op.operationId ?? op;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Australia/Perth",
  });
  const target = await post("target.create", {
    operationId: opId,
    name: `Miguel Andres SANTOS, born 30 March 1982 (SANTOS) ${Date.now()}`,
    tgt: "SANTOS",
    hbf: "12 Smith Street, PERTH WA",
  });
  const sheet = await post("sheet.create", {
    operationId: opId,
    targetId: target.id ?? target.targetId ?? target,
    sheetDate: today,
    sheetCins: [{ cin, hasImages: false, isTeamLeader: true, isAuthor: true }],
  });
  const sheetId = sheet.id ?? sheet.sheetId;
  await post("row.create", {
    sheetId,
    observation:
      "Surveillance commenced in the vicinity of 12 Smith Street, PERTH WA (12 Smith Street).",
  });

  // The Shortcuts page shows it, and the edit form is where it is switched.
  await page.goto("/shortcuts");
  await expect(page.getByTestId(`own-row-${trigger}`)).toBeVisible();

  await page.goto(`/sheet/${sheetId}`);
  const chip = page.getByRole("button", {
    name: trigger.toUpperCase(),
    exact: true,
  });
  await expect(chip).toBeVisible();
  await chip.click();

  // One tap: a new row — the time, the surname, then the text exactly as saved.
  const row = page.locator("tbody tr").filter({ hasText: `SANTOS ${text}` });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(/\d\d:\d\d [AP]M/);
  await expect(
    page.getByText(`${trigger.toUpperCase()} row added`)
  ).toBeVisible();

  // It is saved, not just drawn: still there after a reload.
  await page.reload();
  await expect(
    page.locator("tbody tr").filter({ hasText: `SANTOS ${text}` })
  ).toHaveCount(1);

  // Clean up: the test shortcut goes away.
  await post("shortcuts.update", { id: made.id, startsRow: false });
  await post("shortcuts.delete", { id: made.id });
});
