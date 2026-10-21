import { expect, type Page } from "@playwright/test";

export const USERNAME = process.env.E2E_USERNAME;
export const PASSWORD = process.env.E2E_PASSWORD;

/**
 * Signs in through the real login page and waits until the app shell has
 * loaded. The login page is shown for a moment before the client knows
 * whether a session already exists, so wait for the form before filling it
 * and for the Operations page after pressing Sign In.
 */
export async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").waitFor();
  await page.getByLabel("Username").fill(USERNAME!);
  await page.getByLabel("Password").fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(
    page.getByRole("button", { name: "New Operation" }).first()
  ).toBeVisible();
}

/**
 * Creates an operation and a running sheet through the real screens and
 * returns their ids (read from the page addresses). Ends on the new sheet.
 * Each call makes a new operation named "Smoke <timestamp>".
 */
export async function createOperationAndSheet(
  page: Page
): Promise<{ opId: number; sheetId: number }> {
  const opName = `Smoke ${Date.now()}`;

  await page.goto("/");
  await page.getByRole("button", { name: "New Operation" }).first().click();
  const opDialog = page.getByRole("dialog");
  await opDialog.locator("input").first().fill(opName);
  await opDialog.getByRole("button", { name: "Create Operation" }).click();
  await expect(page.getByText("Operation created")).toBeVisible();
  await page.getByText(opName, { exact: false }).first().click();
  await page.waitForURL(/\/operation\/\d+/);
  const opId = Number(new URL(page.url()).pathname.split("/").pop());

  await page.getByRole("button", { name: "New Running Sheet" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create Sheet" })
    .click();
  await page.waitForURL(/\/sheet\/\d+/);
  const sheetId = Number(new URL(page.url()).pathname.split("/").pop());
  return { opId, sheetId };
}
