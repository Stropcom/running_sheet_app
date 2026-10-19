// Passkey login, browser side. The server rules are in shared/passkeyRules.ts
// and server/passkey.ts. The browser (and the phone's own security chip) do the
// fingerprint / face / PIN step; nothing about it is ever sent to RunLog.
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";

export { browserSupportsWebAuthn, startAuthentication, startRegistration };

export type DeviceKind = "Phone" | "Tablet" | "Laptop";

const KEY = "runlog_passkey_users";

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Remembers, on this device only, that a passkey was registered here for this
 * username — so the sign-in page offers the passkey button on this device and
 * nowhere else. */
export function rememberPasskeyUser(username: string) {
  const u = username.trim().toLowerCase();
  if (!u) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(Array.from(new Set([...read(), u])))
    );
  } catch {
    /* private window or blocked storage: the button just stays hidden */
  }
}

export function deviceHasPasskeyFor(username: string): boolean {
  const u = username.trim().toLowerCase();
  return !!u && read().includes(u);
}

export function deviceHasAnyPasskey(): boolean {
  return read().length > 0;
}

/** A best guess for the "This device is a" box. */
export function guessDeviceKind(): DeviceKind {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "Tablet";
  if (/iPhone|Android|Mobile/i.test(ua)) return "Phone";
  return "Laptop";
}

/** A short, plain message for a failed or cancelled browser step. */
export function passkeyErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  const message = (e as { message?: string } | null)?.message ?? "";
  if (
    name === "NotAllowedError" ||
    /cancel|not allowed|timed out/i.test(message)
  )
    return "Cancelled, or it took too long. Nothing was changed.";
  if (name === "InvalidStateError") return "This device is already registered.";
  if (name === "SecurityError")
    return "Passkeys only work on the site's own address over HTTPS.";
  return message || "Something went wrong. Please try again.";
}
