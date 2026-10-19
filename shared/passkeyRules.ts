// Passkey (device-bound) login: the pure rules. Deterministic — no lookups, no
// AI. The server (server/passkey.ts) and the screens use these so the login,
// the admin list and the banner always agree.
//
// The whole feature is OFF until the owner ticks "Require a passkey for all
// users". Off, every rule below lets a password sign-in straight through.

import { isFeatureOwner } from "./commandFeatures";

/** Password-only sign-ins a person gets, by default, before they are locked. */
export const DEFAULT_PASSWORD_SIGNINS = 3;
export const PASSWORD_SIGNINS_CHOICES = [2, 3, 5] as const;

/** An admin-issued code works once and lasts this long. */
export const ADMIN_CODE_MINUTES = 30;
/** A code a person makes on one of their own devices for another. */
export const SELF_CODE_MINUTES = 5;
/** Devices one person can have registered. */
export const MAX_DEVICES = 5;

export interface PasskeySettings {
  /** The master switch: require a passkey for everyone. Off by default. */
  requireAll: boolean;
  /** Password-only sign-ins allowed before the account locks. */
  maxPasswordSignIns: number;
}

export const DEFAULT_PASSKEY_SETTINGS: PasskeySettings = {
  requireAll: false,
  maxPasswordSignIns: DEFAULT_PASSWORD_SIGNINS,
};

export interface PasskeyAccount {
  exempt: boolean;
  /** Password-only sign-ins used since the requirement was switched on. */
  passwordSignIns: number;
  locked: boolean;
  deviceCount: number;
}

export type PasswordSignInDecision =
  /** Not affected — the requirement is off, or this account is exempt. */
  | { kind: "allow" }
  /** Let in, with a warning of how many password-only sign-ins are left. */
  | { kind: "allow_warn"; left: number }
  /** Has a passkey, so the password alone is no longer accepted. */
  | { kind: "refuse_has_passkey" }
  /** No passkey and no sign-ins left: locked until an admin issues a code. */
  | { kind: "lock" };

/** What a correct password is worth right now. */
export function decidePasswordSignIn(
  settings: PasskeySettings,
  a: PasskeyAccount
): PasswordSignInDecision {
  if (!settings.requireAll || a.exempt) return { kind: "allow" };
  if (a.deviceCount > 0) return { kind: "refuse_has_passkey" };
  if (a.locked || a.passwordSignIns >= settings.maxPasswordSignIns)
    return { kind: "lock" };
  return {
    kind: "allow_warn",
    left: Math.max(0, settings.maxPasswordSignIns - a.passwordSignIns - 1),
  };
}

export type PasskeyStatusTone =
  | "off"
  | "exempt"
  | "set"
  | "counting"
  | "locked";

export interface PasskeyStatus {
  tone: PasskeyStatusTone;
  label: string;
  /** Password-only sign-ins left (only while counting). */
  left: number | null;
}

/** One line for an account, for the admin list and the banner. */
export function passkeyStatus(
  settings: PasskeySettings,
  a: PasskeyAccount
): PasskeyStatus {
  if (!settings.requireAll)
    return { tone: "off", label: "Not required", left: null };
  if (a.exempt) return { tone: "exempt", label: "Exempt", left: null };
  if (a.deviceCount > 0)
    return {
      tone: "set",
      label: `Passkey set up · ${a.deviceCount} ${a.deviceCount === 1 ? "device" : "devices"}`,
      left: null,
    };
  if (a.locked) return { tone: "locked", label: "Locked out", left: 0 };
  const left = Math.max(0, settings.maxPasswordSignIns - a.passwordSignIns);
  return {
    tone: left === 0 ? "locked" : "counting",
    label:
      left === 0
        ? "Locks on next sign-in"
        : `${left} ${left === 1 ? "sign-in" : "sign-ins"} left`,
    left,
  };
}

/** The words shown after a password sign-in that used up one of the few. */
export function warningText(left: number): string {
  if (left <= 0)
    return "That was your last sign-in without a passkey. Set one up now, or your account locks next time.";
  return `You have ${left} ${left === 1 ? "sign-in" : "sign-ins"} left without a passkey. Set one up on this device now.`;
}

export interface PasskeyPerson {
  id: number;
  cin: string | null;
  role: string;
  command: string;
  allRegions: boolean;
}

/**
 * Whether `actor` may issue a code for, see the devices of, or remove a device
 * of `target`. An admin acts only inside their own Command (including other
 * admins there); the owner and an all-region admin act everywhere; nobody
 * acts on themselves (another admin, or the owner, approves a device) and
 * nobody but the owner acts on the owner.
 */
export function canAdministerPasskey(
  actor: PasskeyPerson,
  target: PasskeyPerson
): boolean {
  if (actor.id === target.id) return false;
  if (actor.role !== "admin") return false;
  if (isFeatureOwner(target)) return false;
  if (isFeatureOwner(actor) || actor.allRegions) return true;
  return actor.command === target.command;
}

/** The people whose passkey status an admin may see. */
export function canSeePasskeyPerson(
  actor: PasskeyPerson,
  target: PasskeyPerson
): boolean {
  if (actor.role !== "admin") return false;
  if (actor.id === target.id) return true;
  return canAdministerPasskey(actor, target);
}

/** Codes are 8 characters from an alphabet with no look-alikes, shown as XXXX-XXXX. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function normaliseCode(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatCode(normalised: string): string {
  return `${normalised.slice(0, 4)}-${normalised.slice(4, 8)}`;
}

/** True when `raw` could be a code (8 characters from the alphabet). */
export function looksLikeCode(raw: string): boolean {
  const n = normaliseCode(raw);
  return n.length === 8 && Array.from(n).every(c => CODE_ALPHABET.includes(c));
}
