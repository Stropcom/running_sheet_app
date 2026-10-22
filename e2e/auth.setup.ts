// Signs in once per run through the real login page and saves the session, so
// the other tests start already signed in. (The login endpoint is rate
// limited to 20 attempts per 15 minutes per IP, so one sign-in per run — not
// one per test — also keeps repeated local runs from locking themselves out.)
import { test as setup } from "@playwright/test";
import { USERNAME, PASSWORD, signIn } from "./helpers";

export const AUTH_FILE = "e2e/.auth/user.json";

setup("sign in", async ({ page }) => {
  setup.skip(
    !USERNAME || !PASSWORD,
    "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
  );
  await signIn(page);
  await page.context().storageState({ path: AUTH_FILE });
});
