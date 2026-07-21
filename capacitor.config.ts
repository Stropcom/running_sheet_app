import type { CapacitorConfig } from "@capacitor/cli";

const PRODUCTION_SERVER_URL = "https://runlog.com.au";

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
