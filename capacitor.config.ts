import { existsSync, readFileSync } from "node:fs";
import type { CapacitorConfig } from "@capacitor/cli";

// The iOS shell is a thin native app that opens the live RunLog site. All
// RunLog code stays one shared web codebase: the browser, the installed PWA
// and this shell all load the same site, so a deploy updates every one of
// them. Only the native wrapper (icon, permissions, background features
// later) lives here. See ios-shell/README.md for the Mac steps.
//
// The address officers open RunLog at comes from, in order: the RUNLOG_URL
// environment variable, then ios-shell/runlog-url.txt (written by
// scripts/ios/setup.sh, never committed).
const PLACEHOLDER = "https://REPLACE-WITH-RUNLOG-ADDRESS";

function runlogUrl(): string {
  const fromEnv = process.env.RUNLOG_URL?.trim();
  if (fromEnv) return fromEnv;
  const file = "ios-shell/runlog-url.txt";
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

const config: CapacitorConfig = {
  // Must match the Bundle Identifier chosen in Xcode and registered with the
  // Apple Developer account (app.runlog.field is a placeholder: change it
  // here and in Xcode together if your organisation has its own naming).
  appId: "app.runlog.field",
  appName: "RunLog",
  // Only holds the "can't reach RunLog" page; the app itself is the live site.
  webDir: "ios-shell/www",
  server: {
    url,
    cleartext: false,
    errorPath: "error.html",
    allowNavigation: host ? [host] : [],
  },
};

export default config;
