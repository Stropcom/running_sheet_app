// Golden Rule regression test (see CLAUDE.md): RunLog must never call any
// external AI/LLM API — or any external host at all — during operational
// runtime. This proves that guarantee at the network layer for the voice
// observation feature specifically: once the app has finished loading,
// killing all connectivity (airplane mode) and then exercising RS Quick
// Entry's Voice button must produce ZERO requests to any origin other
// than the app's own — the same thing an officer's phone losing signal
// mid-shift would do.
//
// Deliberately does NOT attempt a real transcription. That needs the
// real, deployment-only ONNX model weight files (see
// scripts/dev/voice-model-setup.md) manually placed on the server — not
// vendored in the repo, and not guaranteed present in every environment
// this test might run in (including CI). Whether transcription actually
// succeeds offline is a separate, weights-dependent concern; this test
// only proves the network-isolation contract that CLAUDE.md's Golden Rule
// actually cares about, which holds regardless of whether the model
// weights happen to be installed — the Voice button legitimately renders
// in a disabled "not installed"/"incomplete" state on most environments,
// and that's fine for what's being asserted here.
//
// Needs a real logged-in session against a running instance of the app —
// see e2e/README.md for the required env vars. No seeded operation/sheet
// is required beyond that: this opens RS Quick Entry via the same
// window.__intelRsQuickEntry hook the app's own intel-pin popup uses
// (IntelligenceMapping.tsx), bypassing the need for a pre-existing
// operation/sheet/map marker to click through to it.
import { test, expect } from "@playwright/test";

const USERNAME = process.env.E2E_USERNAME;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test("voice input on RS Quick Entry makes no external network calls while offline", async ({
  page,
  context,
  baseURL,
}) => {
  const appOrigin = new URL(baseURL!).origin;

  await page.goto("/login");
  await page.getByLabel("Username").fill(USERNAME!);
  await page.getByLabel("Password").fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(
    url => url.pathname === "/" || url.pathname === "/change-password"
  );

  await page.goto("/intelligence/mapping");
  // Registered in a useEffect on mount, independent of any map/marker data
  // existing — see IntelligenceMapping.tsx's __intelRsQuickEntry handler.
  await page.waitForFunction(
    () => typeof (window as any).__intelRsQuickEntry === "function"
  );

  // Airplane mode from here on — every request that isn't already served
  // from cache will fail, and none of them should ever target an
  // external host regardless of that.
  await context.setOffline(true);

  const externalRequests: string[] = [];
  page.on("request", req => {
    const url = new URL(req.url());
    if (url.origin !== appOrigin) externalRequests.push(req.url());
  });

  // Open RS Quick Entry the same way an intel pin's popup does.
  await page.evaluate(() => {
    (window as any).__intelRsQuickEntry(
      "123 Test Street, TESTVILLE (123 TEST STREET)"
    );
  });

  const voiceButton = page.getByRole("button", { name: /voice/i });
  await expect(voiceButton).toBeVisible();

  // The button legitimately renders disabled ("model not installed"/
  // "incomplete") on any environment without the real weight files
  // present — expected, and still exercises getVoiceModelStatus()'s
  // same-origin HEAD requests either way. Only click if interactive,
  // since a disabled button intentionally ignores taps.
  if (await voiceButton.isEnabled()) {
    await voiceButton.click();
    // Give getUserMedia/recording a moment to attempt whatever it does —
    // in a headless browser with no real mic this typically fails fast
    // with a permission error, which is fine; only the absence of any
    // external request is being asserted here.
    await page.waitForTimeout(1000);
  }

  expect(externalRequests).toEqual([]);
});
