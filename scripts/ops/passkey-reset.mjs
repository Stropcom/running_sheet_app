#!/usr/bin/env node
// Break-glass for passkey login (server access only — the app can't do this for
// the owner, because nobody can approve the owner's own device).
//
//   node scripts/ops/passkey-reset.mjs --status                 show the switch and who is locked
//   node scripts/ops/passkey-reset.mjs --off --execute          switch "Require a passkey for all users" OFF
//   node scripts/ops/passkey-reset.mjs <username> --execute     clear that person's passkeys and codes,
//                                                               unlock them and restart their countdown
//
// Without --execute it only says what it would do. Run it from the app's folder
// (e.g. /opt/runlog); it reads DATABASE_URL from the environment or .env. The
// change is written to the audit log (user_id 0, "passkey_settings_changed").
import "dotenv/config";
import { createConnection } from "mysql2/promise";

const argv = process.argv.slice(2);
const execute = argv.includes("--execute");
const status = argv.includes("--status");
const off = argv.includes("--off");
const username = argv.find(a => !a.startsWith("--"));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (put it in the environment or .env).");
  process.exit(1);
}
if (!status && !off && !username) {
  console.error(
    "Say what to do: --status, --off --execute, or <username> --execute"
  );
  process.exit(1);
}
const conn = await createConnection({ uri: url });
const rows = async (sql, params = []) => (await conn.query(sql, params))[0];
const one = async (sql, params = []) => (await rows(sql, params))[0];

async function audit(details) {
  await conn.query(
    "INSERT INTO audit_logs (sheetId, userId, userName, userCIN, action, details, createdAt) VALUES (0, 0, 'Server', NULL, 'passkey_settings_changed', ?, ?)",
    [details, Date.now()]
  );
}

try {
  const settings = (await one(
    "SELECT requireAll, maxPasswordSignIns FROM passkey_settings WHERE id = 1"
  )) ?? { requireAll: 0, maxPasswordSignIns: 3 };
  console.log(
    `Require a passkey for all users: ${settings.requireAll ? "ON" : "off"} (${settings.maxPasswordSignIns} password sign-ins before lockout)`
  );
  if (status) {
    const locked = await rows(
      "SELECT username, cin FROM users WHERE passkeyLocked = 1"
    );
    console.log(
      locked.length
        ? `Locked out: ${locked.map(u => `${u.username} (CIN ${u.cin})`).join(", ")}`
        : "Nobody is locked out."
    );
  }
  if (off) {
    if (!execute)
      console.log("Would switch the requirement OFF. Add --execute to do it.");
    else {
      await conn.query(
        "INSERT INTO passkey_settings (id, requireAll, maxPasswordSignIns) VALUES (1, 0, ?) ON DUPLICATE KEY UPDATE requireAll = 0",
        [settings.maxPasswordSignIns]
      );
      await audit(
        "Server: Require a passkey for all users switched off with passkey-reset.mjs"
      );
      console.log(
        "Switched OFF. Passwords work as before (the app notices within a few seconds)."
      );
    }
  }
  if (username) {
    const user = await one(
      "SELECT id, username, cin FROM users WHERE username = ?",
      [username.toLowerCase()]
    );
    if (!user) {
      console.error(`No user called "${username}".`);
      process.exit(1);
    }
    const { n } = await one(
      "SELECT COUNT(*) AS n FROM passkey_credentials WHERE userId = ?",
      [user.id]
    );
    console.log(
      `${user.username} (CIN ${user.cin}) has ${n} registered device(s).`
    );
    if (!execute)
      console.log(
        "Would delete those devices and any codes, unlock them and restart their countdown. Add --execute to do it."
      );
    else {
      await conn.query("DELETE FROM passkey_credentials WHERE userId = ?", [
        user.id,
      ]);
      await conn.query("DELETE FROM passkey_codes WHERE userId = ?", [user.id]);
      await conn.query(
        "UPDATE users SET passkeyLocked = 0, passkeyPasswordSignIns = 0 WHERE id = ?",
        [user.id]
      );
      await audit(
        `Server: passkeys cleared and countdown restarted for ${user.username} (CIN ${user.cin}) with passkey-reset.mjs`
      );
      console.log(
        "Done. They sign in with their password and get a fresh countdown."
      );
    }
  }
} finally {
  await conn.end();
}
