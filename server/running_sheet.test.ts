import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getRunningSheets: vi.fn().mockResolvedValue([]),
  getRunningSheetById: vi.fn().mockResolvedValue({
    id: 1,
    title: "Test Sheet",
    description: null,
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createRunningSheet: vi.fn().mockResolvedValue(1),
  updateRunningSheet: vi.fn().mockResolvedValue(undefined),
  deleteRunningSheet: vi.fn().mockResolvedValue(undefined),
  getRowsBySheetId: vi.fn().mockResolvedValue([]),
  getRowById: vi.fn().mockResolvedValue({
    id: 1,
    sheetId: 1,
    rowNumber: 1,
    time: null,
    observation: null,
    isLocked: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createSheetRow: vi.fn().mockResolvedValue(1),
  updateSheetRow: vi.fn().mockResolvedValue(undefined),
  deleteSheetRow: vi.fn().mockResolvedValue(undefined),
  setRowLocked: vi.fn().mockResolvedValue(undefined),
  insertTravelledViaRow: vi.fn().mockResolvedValue(999),
  textHasContinuedVia: vi.fn(
    (text: string | null | undefined) => !!text && /continued via:?/i.test(text)
  ),
  getMembersByRowId: vi.fn().mockResolvedValue([]),
  getMembersByRowIds: vi.fn().mockResolvedValue([]),
  addRowMember: vi.fn().mockResolvedValue(1),
  removeRowMember: vi.fn().mockResolvedValue(undefined),
  getCertificationsByRowId: vi.fn().mockResolvedValue([]),
  getCertificationsByRowIds: vi.fn().mockResolvedValue([]),
  getCertificationByMember: vi.fn().mockResolvedValue(undefined),
  createCertification: vi.fn().mockResolvedValue(1),
  deactivateCertification: vi.fn().mockResolvedValue(undefined),
  deactivateAllCertificationsForRow: vi.fn().mockResolvedValue(undefined),
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  getAuditLogsBySheet: vi.fn().mockResolvedValue([]),
  getAllAuditLogs: vi.fn().mockResolvedValue([]),
  getAllUsers: vi.fn().mockResolvedValue([]),
  updateUserRole: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getOperations: vi.fn().mockResolvedValue([]),
  getOperationById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Test Op",
    description: null,
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  createOperation: vi.fn().mockResolvedValue(1),
  deleteOperation: vi.fn().mockResolvedValue(undefined),
}));

// ─── Context factories ────────────────────────────────────────────────────────

function makeCtx(role: "observer" | "member" | "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns the current user when authenticated", async () => {
    const ctx = makeCtx("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result?.role).toBe("admin");
  });

  it("returns null when not authenticated", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

// ─── Sheet tests ──────────────────────────────────────────────────────────────

describe("sheet.list", () => {
  it("returns sheets for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    const result = await caller.sheet.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.sheet.list()).rejects.toThrow(TRPCError);
  });
});

describe("sheet.create", () => {
  it("allows observers to create sheets", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    const result = await caller.sheet.create({
      operationId: 1,
      sheetDate: "2026-08-07",
    });
    expect(result.id).toBe(1);
  });
});

describe("sheet.delete", () => {
  it("allows admin to delete a sheet", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.sheet.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("member"));
    await expect(caller.sheet.delete({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN for observer users", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(caller.sheet.delete({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── Row tests ────────────────────────────────────────────────────────────────

describe("row.update", () => {
  it("throws FORBIDDEN when row is locked", async () => {
    const { getRowById } = await import("./db");
    vi.mocked(getRowById).mockResolvedValueOnce({
      id: 1,
      sheetId: 1,
      rowNumber: 1,
      time: null,
      observation: null,
      isLocked: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx("member"));
    await expect(
      caller.row.update({ id: 1, observation: "test" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows update when row is unlocked", async () => {
    const caller = appRouter.createCaller(makeCtx("member"));
    const result = await caller.row.update({ id: 1, observation: "updated" });
    expect(result.success).toBe(true);
  });
});

// guardActiveSheet (row.create/row.update's first check) resolves the
// sheet's operation and requires status "active" — the file's default
// getRunningSheetById/getOperationById mocks don't set operationId/status
// at all, so every test below sets them explicitly rather than relying on
// the defaults.
async function mockActiveSheetAndOperation() {
  const { getRunningSheetById, getOperationById } = await import("./db");
  vi.mocked(getRunningSheetById).mockResolvedValueOnce({
    id: 1,
    title: "Test Sheet",
    description: null,
    operationId: 1,
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
  vi.mocked(getOperationById).mockResolvedValueOnce({
    id: 1,
    name: "Test Op",
    description: null,
    status: "active",
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
}

describe("row.create/row.update — travelled-via auto-insertion", () => {
  it("row.create inserts a travelled-via row when the observation already contains 'continued via:'", async () => {
    const { insertTravelledViaRow } = await import("./db");
    vi.mocked(insertTravelledViaRow).mockClear();
    await mockActiveSheetAndOperation();
    const caller = appRouter.createCaller(makeCtx("member"));
    await caller.row.create({
      sheetId: 1,
      time: "10:00",
      timeMinutes: 600,
      observation:
        "Vehicle 1ABC123, KENNEDY driver, departed 27 Olding Way and continued via:",
    });
    expect(insertTravelledViaRow).toHaveBeenCalledTimes(1);
    expect(insertTravelledViaRow).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 1, time: "10:00", timeMinutes: 600 })
    );
  });

  it("row.create does not insert a travelled-via row for an ordinary observation", async () => {
    const { insertTravelledViaRow } = await import("./db");
    vi.mocked(insertTravelledViaRow).mockClear();
    await mockActiveSheetAndOperation();
    const caller = appRouter.createCaller(makeCtx("member"));
    await caller.row.create({
      sheetId: 1,
      observation: "Nothing of note observed.",
    });
    expect(insertTravelledViaRow).not.toHaveBeenCalled();
  });

  it("row.update inserts a travelled-via row the first time 'continued via:' appears", async () => {
    const { getRowById, insertTravelledViaRow } = await import("./db");
    vi.mocked(insertTravelledViaRow).mockClear();
    await mockActiveSheetAndOperation();
    vi.mocked(getRowById).mockResolvedValueOnce({
      id: 1,
      sheetId: 1,
      rowNumber: 5,
      time: "10:00",
      timeMinutes: 600,
      dayOffset: 0,
      rowDate: "2026-09-06",
      observation: "Vehicle 1ABC123, KENNEDY driver, departed 27 Olding Way",
      isLocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx("member"));
    await caller.row.update({
      id: 1,
      observation:
        "Vehicle 1ABC123, KENNEDY driver, departed 27 Olding Way and continued via:",
    });
    expect(insertTravelledViaRow).toHaveBeenCalledTimes(1);
    expect(insertTravelledViaRow).toHaveBeenCalledWith(
      expect.objectContaining({ sheetId: 1, time: "10:00", timeMinutes: 600 })
    );
  });

  it("row.update does not re-insert when the row already had 'continued via:' before this edit", async () => {
    const { getRowById, insertTravelledViaRow } = await import("./db");
    vi.mocked(insertTravelledViaRow).mockClear();
    await mockActiveSheetAndOperation();
    vi.mocked(getRowById).mockResolvedValueOnce({
      id: 1,
      sheetId: 1,
      rowNumber: 5,
      time: "10:00",
      timeMinutes: 600,
      dayOffset: 0,
      rowDate: "2026-09-06",
      observation:
        "Vehicle 1ABC123, KENNEDY driver, departed 27 Olding Way and continued via:",
      isLocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx("member"));
    await caller.row.update({
      id: 1,
      observation:
        "Vehicle 1ABC123, KENNEDY driver, departed 27 Olding Way and continued via: Argyle Street.",
    });
    expect(insertTravelledViaRow).not.toHaveBeenCalled();
  });
});

// ─── Certification tests ──────────────────────────────────────────────────────

describe("certification.certify", () => {
  it("allows certifier to certify a member", async () => {
    const caller = appRouter.createCaller(makeCtx("member"));
    const result = await caller.certification.certify({
      rowId: 1,
      memberId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for observer role", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(
      caller.certification.certify({ rowId: 1, memberId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CONFLICT if member is already certified", async () => {
    const { getCertificationByMember } = await import("./db");
    vi.mocked(getCertificationByMember).mockResolvedValueOnce({
      id: 1,
      rowId: 1,
      memberId: 1,
      certifiedByUserId: 1,
      certifiedByName: "Test",
      certifiedAt: Date.now(),
      isActive: true,
    });
    const caller = appRouter.createCaller(makeCtx("member"));
    await expect(
      caller.certification.certify({ rowId: 1, memberId: 1 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("certification.uncertify", () => {
  it("allows certifier to uncertify", async () => {
    const caller = appRouter.createCaller(makeCtx("member"));
    const result = await caller.certification.uncertify({
      rowId: 1,
      memberId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for observer", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(
      caller.certification.uncertify({ rowId: 1, memberId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Admin tests ──────────────────────────────────────────────────────────────

describe("admin.listUsers", () => {
  it("allows admin to list users", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.listUsers();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws FORBIDDEN for certifier", async () => {
    const caller = appRouter.createCaller(makeCtx("member"));
    await expect(caller.admin.listUsers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws FORBIDDEN for observer", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(caller.admin.listUsers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin.updateUserRole", () => {
  it("allows admin to update user role", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.updateUserRole({
      userId: 2,
      role: "member",
    });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx("member"));
    await expect(
      caller.admin.updateUserRole({ userId: 2, role: "observer" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Audit log tests ──────────────────────────────────────────────────────────

describe("auditLog.all", () => {
  it("returns audit logs for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    const result = await caller.auditLog.all();
    expect(Array.isArray(result)).toBe(true);
  });
});
