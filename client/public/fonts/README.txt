Roboto (Latin and Latin Extended, weights 400/500/700) as WOFF2, taken from the
@fontsource/roboto package (Apache License 2.0, see LICENSE-roboto.txt).

Used only by the running sheet export (client/src/lib/exportFonts.ts) so the
printed document looks the same on every device and never has to fetch a font
from the internet.

JetBrains Mono (Latin and Latin Extended, a variable font covering weights
100-800) as WOFF2 — the same files Google Fonts served the app before, now served
by RunLog itself (SIL Open Font License 1.1, see LICENSE-jetbrains-mono.txt).
Declared inline in client/index.html and used only where text is code or
`.font-mono`. (Inter was also requested from Google before but never applied to
any visible text — the app shows in each device's own system font — so it is
not included.)
