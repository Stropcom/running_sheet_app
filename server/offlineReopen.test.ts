import { describe, expect, it } from "vitest";
import { offlineReopenView } from "@shared/offlineReopen";

const officer = { id: 7, cin: "123" };

describe("offlineReopenView", () => {
  it("signed in: the app as usual", () => {
    expect(
      offlineReopenView({
        signedIn: true,
        online: false,
        lastOfficer: officer,
        path: "/",
      })
    ).toBe("normal");
  });
  it("online and not signed in: the ordinary sign-in prompt", () => {
    expect(
      offlineReopenView({
        signedIn: false,
        online: true,
        lastOfficer: officer,
        path: "/draft",
      })
    ).toBe("sign-in");
  });
  it("offline with no remembered officer: the sign-in prompt", () => {
    expect(
      offlineReopenView({
        signedIn: false,
        online: false,
        lastOfficer: null,
        path: "/draft",
      })
    ).toBe("sign-in");
  });
  it("offline with a remembered officer: drafts pages show, anything else goes to the drafts hub", () => {
    const base = { signedIn: false, online: false, lastOfficer: officer };
    expect(offlineReopenView({ ...base, path: "/draft" })).toBe("drafts");
    expect(offlineReopenView({ ...base, path: "/draft/sheet/abc" })).toBe(
      "drafts"
    );
    expect(offlineReopenView({ ...base, path: "/operations/5" })).toBe(
      "go-drafts"
    );
    expect(offlineReopenView({ ...base, path: "/drafty" })).toBe("go-drafts");
  });
});
