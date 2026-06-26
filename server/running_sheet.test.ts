import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getRunningSheets: vi.fn().mockResolvedValue([]),
  getRunningSheetById: vi.fn().mockResolvedValue({ id: 1, title: "Test Sheet", description: null, createdBy: 1, createdAt: new Date(), updatedAt: new Date() }),
  createRunningSheet: vi.fn().mockResolvedValue(1),
  updateRunningSheet: vi.fn().mockResolvedValue(undefined),
  deleteRunningSheet: vi.fn().mockResolvedValue(undefined),
  getRowsBySheetId: vi.fn().mockResolvedValue([]),
  getRowById: vi.fn().mockResolvedValue({ id: 1, sheetId: 1, rowNumber: 1, time: null, observation: null, isLocked: false, createdAt: new Date(), updatedAt: new Date() }),
  createSheetRow: vi.fn().mockResolvedValue(1),
  updateSheetRow: vi.fn().mockResolvedValue(undefined),
  deleteSheetRow: vi.fn().mockResolvedValue(undefined),
  setRowLocked: vi.fn().mockResolvedValue(undefined),
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
}));

// ─── Context factories ────────────────────────────────────────────────────────

function makeCtx(role: "observer" | "certifier" | "admin"): TrpcContext {
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
    const result = await caller.sheet.create({ title: "New Sheet" });
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
    const caller = appRouter.createCaller(makeCtx("certifier"));
    await expect(caller.sheet.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN for observer users", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(caller.sheet.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Row tests ────────────────────────────────────────────────────────────────

describe("row.update", () => {
  it("throws FORBIDDEN when row is locked", async () => {
    const { getRowById } = await import("./db");
    vi.mocked(getRowById).mockResolvedValueOnce({
      id: 1, sheetId: 1, rowNumber: 1, time: null, observation: null,
      isLocked: true, createdAt: new Date(), updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx("certifier"));
    await expect(caller.row.update({ id: 1, observation: "test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows update when row is unlocked", async () => {
    const caller = appRouter.createCaller(makeCtx("certifier"));
    const result = await caller.row.update({ id: 1, observation: "updated" });
    expect(result.success).toBe(true);
  });
});

// ─── Certification tests ──────────────────────────────────────────────────────

describe("certification.certify", () => {
  it("allows certifier to certify a member", async () => {
    const caller = appRouter.createCaller(makeCtx("certifier"));
    const result = await caller.certification.certify({ rowId: 1, memberId: 1 });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for observer role", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(caller.certification.certify({ rowId: 1, memberId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws CONFLICT if member is already certified", async () => {
    const { getCertificationByMember } = await import("./db");
    vi.mocked(getCertificationByMember).mockResolvedValueOnce({
      id: 1, rowId: 1, memberId: 1, certifiedByUserId: 1,
      certifiedByName: "Test", certifiedAt: Date.now(), isActive: true,
    });
    const caller = appRouter.createCaller(makeCtx("certifier"));
    await expect(caller.certification.certify({ rowId: 1, memberId: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("certification.uncertify", () => {
  it("allows certifier to uncertify", async () => {
    const caller = appRouter.createCaller(makeCtx("certifier"));
    const result = await caller.certification.uncertify({ rowId: 1, memberId: 1 });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for observer", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(caller.certification.uncertify({ rowId: 1, memberId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    const caller = appRouter.createCaller(makeCtx("certifier"));
    await expect(caller.admin.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("throws FORBIDDEN for observer", async () => {
    const caller = appRouter.createCaller(makeCtx("observer"));
    await expect(caller.admin.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("admin.updateUserRole", () => {
  it("allows admin to update user role", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.updateUserRole({ userId: 2, role: "certifier" });
    expect(result.success).toBe(true);
  });

  it("throws FORBIDDEN for non-admin", async () => {
    const caller = appRouter.createCaller(makeCtx("certifier"));
    await expect(caller.admin.updateUserRole({ userId: 2, role: "observer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
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
