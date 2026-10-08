#!/usr/bin/env bash
# Sets up the RunLog iOS shell on a Mac. Safe to run again.
# Run it from inside the ios-shell folder:
#   bash setup.sh
# Needs: a Mac with Xcode, Node 22 or newer (which includes npm), internet.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nSTOP: %s\n' "$1" >&2; exit 1; }

say "Checking this Mac"
[ "$(uname)" = "Darwin" ] || fail "This must be run on the Mac (not Windows or Linux)."
command -v xcodebuild >/dev/null || fail "Xcode is not installed. Install it from the Mac App Store, open it once, accept the licence, then run this again."
xcodebuild -version
command -v node >/dev/null || fail "Node is not installed. Install Node from https://nodejs.org then run this again."
command -v npm >/dev/null || fail "npm is missing. Reinstall Node from https://nodejs.org (the installer includes npm)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "Node $NODE_MAJOR is too old; install Node 22 or newer from https://nodejs.org."
echo "Node $(node -v), npm $(npm -v)"

say "Where does RunLog live?"
URL_FILE="runlog-url.txt"
if [ -z "${RUNLOG_URL:-}" ] && [ ! -s "$URL_FILE" ]; then
  printf 'Type the web address officers use to open RunLog (for example https://runlog.example.org): '
  read -r ENTERED
  case "$ENTERED" in
    https://*) printf '%s\n' "$ENTERED" > "$URL_FILE" ;;
    *) fail "The address must start with https://" ;;
  esac
fi
echo "Using: ${RUNLOG_URL:-$(cat "$URL_FILE")}"

say "Installing the shell's tools (a minute or two)"
npm install --no-audit --no-fund

if [ ! -d ios ]; then
  say "Creating the iOS project"
  npx cap add ios
else
  say "iOS project already exists; keeping it"
fi

say "Putting the RunLog icon on the app"
ICON_DIR="ios/App/App/Assets.xcassets/AppIcon.appiconset"
[ -d "$ICON_DIR" ] || fail "Expected $ICON_DIR but it was not created. Send a screenshot of this window."
cp resources/icon-1024.png "$ICON_DIR/AppIcon-512@2x.png"

say "Adding the permission wording iOS shows officers"
PLIST="ios/App/App/Info.plist"
[ -f "$PLIST" ] || fail "Expected $PLIST but it was not created. Send a screenshot of this window."
set_plist() {
  /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :$1 string $2" "$PLIST"
}
set_plist NSLocationWhenInUseUsageDescription "RunLog uses your location to show your position to your team on the map."
set_plist NSMicrophoneUsageDescription "RunLog uses the microphone for voice entry you start."
set_plist NSCameraUsageDescription "RunLog uses the camera to attach photos to the running sheet."
set_plist NSPhotoLibraryUsageDescription "RunLog lets you attach photos from your library to the running sheet."

say "Copying settings into the iOS project"
npx cap sync ios

say "Opening Xcode"
open ios/App/App.xcodeproj

cat <<'DONE'

Done. In Xcode, next:
  1. Click "App" (blue icon, top of the left list) > the "App" target > "Signing & Capabilities".
  2. Tick "Automatically manage signing" and choose your Team.
  3. Pick an iPhone simulator at the top and press the Play button to test.
See README.md in this folder for the rest.
DONE
