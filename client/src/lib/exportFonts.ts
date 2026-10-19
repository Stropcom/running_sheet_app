/**
 * Roboto for the running sheet export. The files live in client/public/fonts
 * (Apache 2.0, see LICENSE-roboto.txt there) and are served by RunLog itself, so
 * the printed document looks the same on every device and opening an export
 * never reaches out to the internet for a font. They are also part of the PWA
 * precache (woff2), so they work offline.
 *
 * The export is written into a new window (`window.open("")` + `document.write`),
 * which inherits this app's origin, but the @font-face URLs are written as
 * absolute ones so they never depend on that window's base URL.
 */

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

/** @font-face rules for Roboto 400 / 500 / 700 (Latin and Latin Extended). */
export function robotoFontFaceCss(
  origin: string = window.location.origin
): string {
  const rules: string[] = [];
  for (const weight of [400, 500, 700]) {
    for (const [subset, range] of [
      ["latin-ext", LATIN_EXT],
      ["latin", LATIN],
    ] as const) {
      rules.push(
        `@font-face{font-family:'Roboto';font-style:normal;font-weight:${weight};font-display:block;` +
          `src:url(${origin}/fonts/roboto-${subset}-${weight}-normal.woff2) format('woff2');unicode-range:${range}}`
      );
    }
  }
  return rules.join("\n");
}

/** Resolves once the export window's fonts have loaded (or after `timeoutMs`,
 * so a printout is never held up for long). Printing before this is what
 * would put a fallback font in the PDF. */
export function whenFontsReady(win: Window, timeoutMs = 3000): Promise<void> {
  return new Promise(resolve => {
    const timer = win.setTimeout(resolve, timeoutMs);
    const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) {
      win.clearTimeout(timer);
      resolve();
      return;
    }
    // Ask for the faces the document uses, then wait for everything pending.
    Promise.all(
      ["400 11px Roboto", "500 11px Roboto", "700 11px Roboto"].map(f =>
        fonts.load(f).catch(() => [])
      )
    )
      .then(() => fonts.ready)
      .then(() => {
        win.clearTimeout(timer);
        resolve();
      })
      .catch(() => {
        win.clearTimeout(timer);
        resolve();
      });
  });
}
