// Typing a measurement does not bracket it as a vehicle.
// Split out of the old e2e/screens.spec.ts (v2.83.4); the tests are unchanged.
//
// Needs a running instance and a real account — see e2e/README.md.
import { test, expect } from "@playwright/test";
import {
  USERNAME,
  PASSWORD,
  addRowWithObservation,
  createOperationAndSheet,
  openNewRowCell,
} from "./helpers";

test.skip(
  !USERNAME || !PASSWORD,
  "E2E_USERNAME/E2E_PASSWORD not set — see e2e/README.md"
);

test.describe.configure({ mode: "serial" });

test("Typing a measurement (30cm) does not bracket it as a vehicle, and a real rego still does", async ({
  page,
}) => {
  await createOperationAndSheet(page);
  // A second row starts empty (the first comes with "Surveillance commenced…").
  await addRowWithObservation(page, "Surveillance commenced.", "commenced");
  await openNewRowCell(page);
  const box = page.locator("textarea").first();
  // Typed key by key, so the Space-bar rego bracket gets its chance to fire.
  await box.pressSequentially("The package was approx 30cm x 30cm x 30cm ", {
    delay: 15,
  });
  await expect(box).not.toHaveValue(/\(Vehicle/);
  await expect(box).toHaveValue(/approx 30cm x 30cm x 30cm/);
  // Control: a real plate typed the same way is still bracketed.
  await box.pressSequentially("then 1ZQK91 ", { delay: 15 });
  await expect(box).toHaveValue(/1ZQK91 \(Vehicle 1ZQK91\)/);
});
