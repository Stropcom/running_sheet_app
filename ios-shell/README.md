# RunLog iOS shell

A thin iPhone/iPad app that opens the live RunLog site. The browser version, the
installed PWA and this app all load the same site and share the same data, so a
deploy updates all three. Nothing here changes how RunLog works.

This folder is a small project of its own (its own `package.json`). It does not
touch the RunLog web app or its build, and it only installs the few tools the
shell needs.

Not for the public App Store. It is installed on registered devices only
("ad hoc", up to 100 devices a year), and later through your organisation's
phone management system.

> The Xcode and Apple website steps below are written from memory of how they
> look; menu names can differ slightly between Xcode versions.

## What you need

- A Mac with **Xcode** installed and opened once (accept the licence and let it
  install extra components).
- **Node 22 or newer** (https://nodejs.org). It includes `npm`, which is all
  this uses.
- Your **Apple Developer** account (paid, active).
- The web address officers use to open RunLog (must start with `https://`).

## Part 1 — Get the code onto the Mac

On the Mac, in a web browser:

1. Open the GitHub project and choose the branch `claude/claude-md-docs-o4trnz`.
2. **Code > Download ZIP**, then double-click the ZIP to unpack it.
   (Re-download it whenever a new version of this branch is ready.)

## Part 2 — One-time setup (about 5 minutes)

1. Open **Terminal** on the Mac.
2. Go into the **ios-shell** folder inside the unpacked folder. Type `cd `
   (with a space after it), then the folder path, for example:

   ```
   cd ~/Downloads/running_sheet_app-claude-claude-md-docs-o4trnz/ios-shell
   ```

3. Run:

   ```
   bash setup.sh
   ```

4. When asked, type the RunLog address. The script installs what it needs,
   creates the iOS project and opens Xcode.

If it stops with "STOP: ...", the message says what to fix. Fix it and run the
same command again; it is safe to repeat.

## Part 3 — Sign the app and test it

In Xcode:

1. Click **App** (blue icon at the top of the left list), then the **App**
   target, then **Signing & Capabilities**.
2. Tick **Automatically manage signing** and choose your **Team**.
3. The **Bundle Identifier** is `app.runlog.field`. If Xcode says it is taken
   or not available, change it to something unique to your organisation, for
   example `au.org.yourname.runlog`, **and** change `appId` in
   `capacitor.config.js` to match, then run `npx cap sync ios` in Terminal
   (from the `ios-shell` folder).
4. At the top, pick an **iPhone simulator** (for example "iPhone 16") and press
   **Play**. A simulated iPhone opens with RunLog loaded. Sign in and look
   around. This checks the shell works before any real phone is involved.

## Part 4 — Register the phones

Every phone that will install the app is registered with Apple by its unique
device ID (UDID). Up to 100 devices a year.

1. Find a phone's UDID: plug it into a Windows or Mac computer, open **Apple
   Devices** (Windows) or **Finder** (Mac), select the phone, and click the
   small line of text under its name repeatedly until it shows **UDID**. Right
   click to copy it.
2. Go to https://developer.apple.com/account > **Certificates, Identifiers &
   Profiles > Devices > +**, and add each phone with a name and its UDID.

## Part 5 — Build the installable file ("ad hoc")

In Xcode, with a real device or **Any iOS Device (arm64)** chosen at the top:

1. **Product > Archive** (wait for it to finish).
2. In the window that opens, choose **Distribute App > Ad Hoc > Next**, keep
   the defaults (automatic signing), and **Export**.
3. You get a folder containing **App.ipa**. That file installs on the phones
   registered in Part 4.

Getting the file onto the phones without a cable (a web link from your own
server) is the next step; it is not set up yet.

## Updating the app later

- **Changes to RunLog itself** (anything shipped to the site): nothing to do.
  The app loads the live site.
- **Changes to the shell** (a new native feature, icon, permission): download
  the branch again, run `bash setup.sh` from the `ios-shell` folder, and repeat
  Part 5.
- The ad hoc build needs rebuilding about once a year when Apple's certificate
  and profile expire.

## Files in this folder

- `www/` — the "can't reach RunLog" screen shown when the site can't be loaded.
- `capacitor.config.js` — the app's name, identifier and the RunLog address.
- `setup.sh` — the Mac setup script.
- `package.json` — the few tools the shell needs (Capacitor only).
- `runlog-url.txt` — the RunLog address, written by the script on the Mac
  (never committed).
