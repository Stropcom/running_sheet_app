// The iOS shell is a thin native app that opens the live RunLog site. All
// RunLog code stays one shared web codebase: the browser, the installed PWA
// and this shell all load the same site, so a deploy updates every one of
// them. Only the native wrapper (icon, permissions, background features
// later) lives here. This folder is a small project of its own (its own
// package.json), run from inside ios-shell/. See README.md for the Mac steps.
//
// The address officers open RunLog at comes from, in order: the RUNLOG_URL
// environment variable, then runlog-url.txt in this folder (written by
// setup.sh, never committed).
const { existsSync, readFileSync } = require("node:fs");

const PLACEHOLDER = "https://REPLACE-WITH-RUNLOG-ADDRESS";

function runlogUrl() {
  const fromEnv = (process.env.RUNLOG_URL || "").trim();
  if (fromEnv) return fromEnv;
  const file = "runlog-url.txt";
  if (existsSync(file)) {
    const fromFile = readFileSync(file, "utf8").trim();
    if (fromFile) return fromFile;
  }
  return PLACEHOLDER;
}

const url = runlogUrl();
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
})();

/** @type {import('@capacitor/cli').CapacitorConfig} */
module.exports = {
  // Must match the Bundle Identifier chosen in Xcode and registered with the
  // Apple Developer account (app.runlog.field is a placeholder: change it
  // here and in Xcode together if your organisation has its own naming).
  appId: "app.runlog.field",
  appName: "RunLog",
  // Only holds the "can't reach RunLog" page; the app itself is the live site.
  webDir: "www",
  server: {
    url,
    cleartext: false,
    errorPath: "error.html",
    allowNavigation: host ? [host] : [],
  },
  ios: {
    // Keep the page below the status bar (clock, Dynamic Island) and above
    // the home indicator. RunLog's own pages do not leave room for them, and
    // changing the website for this would change the browser/PWA too.
    contentInset: "always",
  },
};
