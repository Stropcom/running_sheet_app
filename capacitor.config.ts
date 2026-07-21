import type { CapacitorConfig } from "@capacitor/cli";

// TODO: set this to your deployed RunLog server's real URL once known
// (e.g. "https://your-app-name.manus.space"). Until then the app has
// nothing to talk to — this is a placeholder, not a guess.
const PRODUCTION_SERVER_URL = "https://REPLACE_WITH_PRODUCTION_URL";

const config: CapacitorConfig = {
  appId: "com.stropcom.runlog",
  appName: "RunLog",
  webDir: "dist/public",
  server: {
    // Loads the live server directly inside the app shell rather than
    // bundling a stale copy of the web build. Matches the existing PWA/
    // browser behaviour (same server, same data) with a native wrapper.
    url: PRODUCTION_SERVER_URL,
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
