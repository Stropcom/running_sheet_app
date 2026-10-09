# Background geolocation (vendored)

A copy of `@capacitor-community/background-geolocation` 1.2.26
(https://github.com/capacitor-community/background-geolocation, MIT, see
LICENSE), iOS only. The published package's `Package.swift` pins Capacitor 7,
which cannot be resolved next to the shell's Capacitor 8, so it is vendored
with that one dependency raised to Capacitor 8 (and the iOS minimum to 15).
The Swift source is unchanged.

RunLog uses it through `window.Capacitor.Plugins.BackgroundGeolocation`; see
`client/src/lib/nativeLocation.ts`. Remove this folder and the dependency in
`../../package.json` if an up-to-date published version is adopted instead.
