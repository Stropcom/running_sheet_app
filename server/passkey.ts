// Passkey (device-bound) login — the server side. Rules: shared/passkeyRules.ts.
// The WebAuthn checks are done by @simplewebauthn/server (deterministic
// cryptography, no network call, no AI). Everything here is inert until the
// owner switches "Require a passkey for all users" on: the settings row says
// off by default, and a person with no passkey is never blocked while it is.
//
// The server keeps only the public key of each approved device. Challenges are
// held in memory for five minutes (one process); codes are stored as a hash.

import crypto from "node:crypto";
import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  passkeyCodes,
  passkeyCredentials,
  passkeySettings,
  users,
  type User,
} from "../drizzle/schema";
import {
  ADMIN_CODE_MINUTES,
  CODE_ALPHABET,
  DEFAULT_PASSKEY_SETTINGS,
  MAX_DEVICES,
  SELF_CODE_MINUTES,
  formatCode,
  looksLikeCode,
  normaliseCode,
  passkeyStatus,
  type PasskeyAccount,
  type PasskeySettings,
} from "@shared/passkeyRules";
import { createAuditLog, getDb } from "./db";

// ─── Settings (the owner's switch) ───────────────────────────────────────────

let settingsCache: { at: number; value: PasskeySettings } | null = null;
const SETTINGS_TTL_MS = 2000;

export function invalidatePasskeySettings() {
  settingsCache = null;
}

/** The switch and the allowance. With no saved row, or if the database can't be
 * read, the requirement is OFF — the feature never blocks anyone by accident. */
export async function loadPasskeySettings(): Promise<PasskeySettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS)
    return settingsCache.value;
  let value = DEFAULT_PASSKEY_SETTINGS;
  try {
    const db = await getDb();
    if (db) {
      const [row] = await db
        .select()
        .from(passkeySettings)
        .where(eq(passkeySettings.id, 1))
        .limit(1);
      if (row)
        value = {
          requireAll: row.requireAll,
          maxPasswordSignIns: row.maxPasswordSignIns,
        };
    }
  } catch {
    value = DEFAULT_PASSKEY_SETTINGS;
  }
  settingsCache = { at: Date.now(), value };
  return value;
}

/** Save the switch / allowance. Turning the requirement ON starts everyone's
 * countdown from zero and clears every lock. */
export async function savePasskeySettings(
  next: PasskeySettings,
  byCIN: string | null
): Promise<{ resetCounters: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const before = await loadPasskeySettings();
  await db
    .insert(passkeySettings)
    .values({
      id: 1,
      requireAll: next.requireAll,
      maxPasswordSignIns: next.maxPasswordSignIns,
      updatedByCIN: byCIN,
    })
    .onDuplicateKeyUpdate({
      set: {
        requireAll: next.requireAll,
        maxPasswordSignIns: next.maxPasswordSignIns,
        updatedByCIN: byCIN,
      },
    });
  const resetCounters = next.requireAll && !before.requireAll;
  if (resetCounters) {
    await db
      .update(users)
      .set({ passkeyPasswordSignIns: 0, passkeyLocked: false });
  }
  invalidatePasskeySettings();
  return { resetCounters };
}

// ─── Relying party (the site address a passkey is tied to) ───────────────────

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim() || "";

/** The site's identity for WebAuthn. Set PASSKEY_RP_ID / PASSKEY_ORIGIN to pin
 * it; otherwise it is the address the request came in on (behind nginx too).
 * A passkey only works on the address it was made for. */
export function relyingParty(req: Request): {
  rpName: string;
  rpID: string;
  origin: string[];
} {
  const envId = process.env.PASSKEY_RP_ID?.trim();
  const envOrigin = process.env.PASSKEY_ORIGIN?.trim();
  const host =
    first(req.headers["x-forwarded-host"]) || first(req.headers.host) || "";
  const rpID = envId || host.replace(/:\d+$/, "");
  const proto =
    first(req.headers["x-forwarded-proto"]) || (req.secure ? "https" : "http");
  const origin = envOrigin
    ? envOrigin.split(",").map(o => o.trim())
    : [`${proto}://${host}`];
  return { rpName: "RunLog", rpID, origin };
}

// ─── Challenges and attempt limits (in memory) ───────────────────────────────

type ChallengeKind = "register" | "login";
const CHALLENGE_TTL_MS = 5 * 60_000;
const challenges = new Map<
  string,
  { kind: ChallengeKind; userId: number; challenge: string; expires: number }
>();

function putChallenge(kind: ChallengeKind, userId: number, challenge: string) {
  const now = Date.now();
  for (const [k, v] of Array.from(challenges.entries()))
    if (v.expires < now) challenges.delete(k);
  const id = crypto.randomBytes(16).toString("hex");
  challenges.set(id, {
    kind,
    userId,
    challenge,
    expires: now + CHALLENGE_TTL_MS,
  });
  return id;
}

/** A challenge can be used once, by the person it was made for. */
function takeChallenge(id: string, kind: ChallengeKind, userId: number) {
  const c = challenges.get(id);
  challenges.delete(id);
  if (!c || c.kind !== kind || c.userId !== userId || c.expires < Date.now())
    return null;
  return c.challenge;
}

const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, number[]>();

/** Guesses at a code or a passkey are limited per account and per address. */
export function attemptsExhausted(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    t => now - t < ATTEMPT_WINDOW_MS
  );
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}
export function recordFailedAttempt(key: string) {
  attempts.set(key, [...(attempts.get(key) ?? []), Date.now()]);
}
export function clearAttempts(key: string) {
  attempts.delete(key);
}
export const TOO_MANY_MESSAGE =
  "Too many attempts. Please wait a few minutes and try again.";

// ─── Devices (credentials) ───────────────────────────────────────────────────

const b64u = (buf: Uint8Array | Buffer) =>
  Buffer.from(buf).toString("base64url");
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export async function listDevices(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.userId, userId))
    .orderBy(passkeyCredentials.createdAt);
}

/** Devices per person, for a set of people. */
export async function deviceCounts(
  userIds: number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (userIds.length === 0) return out;
  const db = await getDb();
  if (!db) return out;
  const rows = await db
    .select({ userId: passkeyCredentials.userId })
    .from(passkeyCredentials)
    .where(inArray(passkeyCredentials.userId, userIds));
  for (const r of rows) out.set(r.userId, (out.get(r.userId) ?? 0) + 1);
  return out;
}

export function accountOf(user: User, deviceCount: number): PasskeyAccount {
  return {
    exempt: user.passkeyExempt,
    passwordSignIns: user.passkeyPasswordSignIns,
    locked: user.passkeyLocked,
    deviceCount,
  };
}

export async function myStatus(user: User) {
  const settings = await loadPasskeySettings();
  const devices = await listDevices(user.id);
  const status = passkeyStatus(settings, accountOf(user, devices.length));
  return {
    required: settings.requireAll,
    status,
    maxPasswordSignIns: settings.maxPasswordSignIns,
    maxDevices: MAX_DEVICES,
    /** Show the Profile card: the requirement is on, or they already have one. */
    visible: settings.requireAll || devices.length > 0,
    /** Show the warning banner. */
    warn:
      settings.requireAll &&
      !user.passkeyExempt &&
      devices.length === 0 &&
      !user.passkeyLocked,
    devices: devices.map(d => ({
      id: d.id,
      name: d.deviceName,
      kind: d.deviceKind,
      createdAt: d.createdAt,
      lastUsedAt: d.lastUsedAt,
    })),
  };
}

// ─── Registration (adding a device) ──────────────────────────────────────────

export async function beginRegistration(req: Request, user: User) {
  const { rpID, rpName } = relyingParty(req);
  const existing = await listDevices(user.id);
  if (existing.length >= MAX_DEVICES)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `You already have ${MAX_DEVICES} devices. Remove one first.`,
    });
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(`runlog-user-${user.id}`),
    attestationType: "none",
    excludeCredentials: existing.map(d => ({
      id: d.credentialId,
      transports: d.transports ? JSON.parse(d.transports) : undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });
  return {
    challengeId: putChallenge("register", user.id, options.challenge),
    options,
  };
}

export async function finishRegistration(
  req: Request,
  user: User,
  args: {
    challengeId: string;
    response: RegistrationResponseJSON;
    deviceName: string;
    deviceKind: string;
  }
) {
  const expectedChallenge = takeChallenge(
    args.challengeId,
    "register",
    user.id
  );
  if (!expectedChallenge)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That took too long. Please try again.",
    });
  const { rpID, origin } = relyingParty(req);
  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response: args.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This device could not be registered. Please try again.",
    });
  }
  if (!verified.verified || !verified.registrationInfo)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This device could not be registered. Please try again.",
    });
  const { credential } = verified.registrationInfo;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if ((await listDevices(user.id)).length >= MAX_DEVICES)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `You already have ${MAX_DEVICES} devices. Remove one first.`,
    });
  const name = args.deviceName.trim().slice(0, 64) || args.deviceKind;
  try {
    await db.insert(passkeyCredentials).values({
      userId: user.id,
      credentialId: credential.id,
      publicKey: b64u(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports
        ? JSON.stringify(credential.transports)
        : null,
      deviceName: name,
      deviceKind: args.deviceKind.slice(0, 16),
      createdAt: Date.now(),
    });
  } catch {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This device is already registered.",
    });
  }
  // A registered device ends any lock and the countdown.
  await db
    .update(users)
    .set({ passkeyLocked: false })
    .where(eq(users.id, user.id));
  await createAuditLog({
    sheetId: 0,
    userId: user.id,
    userName: user.cin ?? "Unknown",
    userCIN: user.cin,
    action: "passkey_registered",
    details: `CIN ${user.cin ?? "Unknown"} registered a passkey on "${name}"`,
    createdAt: Date.now(),
  });
  return { name };
}

export async function removeDevice(
  deviceId: number,
  actor: { user: User; onBehalfOf?: User }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [dev] = await db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.id, deviceId))
    .limit(1);
  if (!dev) throw new TRPCError({ code: "NOT_FOUND", message: "Not found." });
  const owner = actor.onBehalfOf ?? actor.user;
  if (dev.userId !== owner.id)
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found." });
  const remaining = (await listDevices(owner.id)).filter(d => d.id !== dev.id);
  await db
    .delete(passkeyCredentials)
    .where(eq(passkeyCredentials.id, deviceId));
  // An admin removing someone's last device leaves their next password sign-in
  // locked until a new code is issued.
  if (actor.onBehalfOf && remaining.length === 0)
    await db
      .update(users)
      .set({ passkeyLocked: true })
      .where(eq(users.id, owner.id));
  await createAuditLog({
    sheetId: 0,
    userId: actor.user.id,
    userName: actor.user.cin ?? "Unknown",
    userCIN: actor.user.cin,
    action: "passkey_removed",
    details: actor.onBehalfOf
      ? `Admin CIN ${actor.user.cin ?? "Unknown"} removed "${dev.deviceName}" for CIN ${owner.cin ?? "Unknown"}${remaining.length === 0 ? " (no devices left)" : ""}`
      : `CIN ${owner.cin ?? "Unknown"} removed their device "${dev.deviceName}"`,
    createdAt: Date.now(),
  });
  return { remaining: remaining.length };
}

// ─── Signing in with a passkey ───────────────────────────────────────────────

export async function beginLogin(req: Request, user: User | undefined) {
  const { rpID } = relyingParty(req);
  const creds = user ? await listDevices(user.id) : [];
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: creds.map(d => ({
      id: d.credentialId,
      transports: d.transports ? JSON.parse(d.transports) : undefined,
    })),
  });
  // Unknown accounts get a challenge too, so the answer doesn't say who exists.
  return {
    challengeId: putChallenge("login", user?.id ?? 0, options.challenge),
    options,
  };
}

/** Checks the signed-in response. Returns the user on success, or null. */
export async function finishLogin(
  req: Request,
  user: User | undefined,
  args: { challengeId: string; response: AuthenticationResponseJSON }
): Promise<User | null> {
  if (!user) {
    takeChallenge(args.challengeId, "login", 0);
    return null;
  }
  const expectedChallenge = takeChallenge(args.challengeId, "login", user.id);
  if (!expectedChallenge) return null;
  const creds = await listDevices(user.id);
  const cred = creds.find(c => c.credentialId === args.response.id);
  if (!cred) return null;
  const { rpID, origin } = relyingParty(req);
  try {
    const result = await verifyAuthenticationResponse({
      response: args.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credentialId,
        publicKey: fromB64u(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
    });
    if (!result.verified) return null;
    const db = await getDb();
    if (db)
      await db
        .update(passkeyCredentials)
        .set({
          counter: result.authenticationInfo.newCounter,
          lastUsedAt: Date.now(),
        })
        .where(eq(passkeyCredentials.id, cred.id));
    return user;
  } catch {
    return null;
  }
}

// ─── One-time codes ──────────────────────────────────────────────────────────

const hashCode = (normalised: string) =>
  crypto
    .createHash("sha256")
    .update(`runlog-passkey:${normalised}`)
    .digest("hex");

function randomCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++)
    out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Makes a code for `userId` (any earlier unused code of that kind stops
 * working) and returns it as shown to people: XXXX-XXXX. */
export async function issueCode(
  userId: number,
  type: "admin" | "self",
  issuedByCIN: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(passkeyCodes)
    .set({ usedAt: Date.now() })
    .where(
      and(
        eq(passkeyCodes.userId, userId),
        eq(passkeyCodes.type, type),
        isNull(passkeyCodes.usedAt)
      )
    );
  const code = randomCode();
  const minutes = type === "admin" ? ADMIN_CODE_MINUTES : SELF_CODE_MINUTES;
  const expiresAt = Date.now() + minutes * 60_000;
  await db.insert(passkeyCodes).values({
    userId,
    codeHash: hashCode(code),
    type,
    issuedByCIN,
    expiresAt,
    createdAt: Date.now(),
  });
  return { code: formatCode(code), expiresAt };
}

export async function cancelCodes(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passkeyCodes)
    .set({ usedAt: Date.now() })
    .where(and(eq(passkeyCodes.userId, userId), isNull(passkeyCodes.usedAt)));
}

/** People with a live admin code, so the list can show it (and when it ends). */
export async function liveAdminCodeExpiries(
  userIds: number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (userIds.length === 0) return out;
  const db = await getDb();
  if (!db) return out;
  const rows = await db
    .select()
    .from(passkeyCodes)
    .where(
      and(inArray(passkeyCodes.userId, userIds), isNull(passkeyCodes.usedAt))
    );
  const now = Date.now();
  for (const r of rows)
    if (r.expiresAt > now)
      out.set(r.userId, Math.max(out.get(r.userId) ?? 0, r.expiresAt));
  return out;
}

/** The unused, unexpired code row that matches, for this person only. */
export async function findLiveCode(userId: number, raw: string) {
  if (!looksLikeCode(raw)) return null;
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(passkeyCodes)
    .where(
      and(
        eq(passkeyCodes.userId, userId),
        eq(passkeyCodes.codeHash, hashCode(normaliseCode(raw))),
        isNull(passkeyCodes.usedAt)
      )
    )
    .limit(1);
  if (!row || row.expiresAt <= Date.now()) return null;
  return row;
}

export async function markCodeUsed(codeId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passkeyCodes)
    .set({ usedAt: Date.now() })
    .where(eq(passkeyCodes.id, codeId));
}
