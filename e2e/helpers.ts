import zlib from "node:zlib";
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

/**
 * Adds a row to the open sheet and types its observation. The new row is the
 * last one with an empty observation, so this works for the second and third
 * row as well as the first. Returns the row's locator (matched by its text).
 * Text an officer types is tidied on save (capitals, punctuation), so pass
 * `match` for any text that tidy-up would change.
 */
export async function addRowWithObservation(
  page: Page,
  text: string,
  /** Text to find the saved row by, when the app tidies what was typed. */
  match: string = text
) {
  await page.getByRole("button", { name: "Add Row" }).click();
  await page.getByText("Enter observation…").first().click();
  await page.locator("textarea").first().fill(text);
  // Click an empty part of the page so the cell saves (it saves on click-out).
  await page.mouse.click(700, 620);
  const row = page.locator("tbody tr").filter({ hasText: match }).first();
  await expect(row).toBeVisible();
  return row;
}

/**
 * A small valid PNG (a grey square), built in memory so the tests carry no
 * binary fixture. Big enough for the browser's image resize to accept.
 */
export function makePng(size = 96): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3, 0x80 + (y % 32));
    row[0] = 0; // filter: none
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
