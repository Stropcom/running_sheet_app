import { useEffect, useState } from "react";

// Phone/tablet (touch, no physical keyboard) vs laptop/desktop (mouse +
// physical keyboard) — viewport width can't tell these apart (a tablet in
// landscape is often wider than a small laptop window), so this checks
// actual touch capability instead. Laptop/desktop always has the RSQE
// observation field editable; phone/tablet starts it read-only so tapping
// it doesn't summon the on-screen keyboard (see rsInlineTypingMode).
export function useIsTouchDevice(): boolean {
  const [isTouch] = useState(() =>
    typeof window !== "undefined"
      ? "ontouchstart" in window || navigator.maxTouchPoints > 0
      : false
  );
  return isTouch;
}

// On-screen keyboard support for full-screen bottom-sheet modals (map
// marker popup etc.). Mobile Safari/Chrome don't shrink the layout
// viewport when the keyboard opens — only `window.visualViewport` does —
// so a sheet sized/anchored off `100vh`/`inset-0` alone stays full height
// and the keyboard simply overlaps its lower portion, hiding whatever
// field is focused there.
//
// `keyboardInset` is the standard visualViewport formula for "how far the
// visible viewport's bottom edge sits above the true window bottom" —
// `window.innerHeight - vv.height - vv.offsetTop` — which is correct
// whichever way a given browser handles the keyboard (shrinking
// `vv.height`, or leaving height alone and scrolling via `vv.offsetTop`
// instead; the first version here only accounted for the former, which
// undercounted — or on some browsers zeroed out — the inset on the
// latter). A consuming sheet must be positioned with plain CSS `fixed`
// (not `absolute` inside some ancestor, and not flex `items-end` padding
// tricks) for these numbers to mean anything: `bottom: keyboardInset`,
// `maxHeight: visibleHeight * 0.9`. Fixed is also what actually escapes
// this app's own layout — `DashboardLayout`'s `<main>` sits in a flex
// column below a header bar and is `overflow-hidden`, so an `absolute
// inset-0` descendant is both the wrong height (bounded by `<main>`, not
// the true window) *and* has anything past that bound silently clipped
// rather than merely mispositioned — which is why the very first attempt
// at this rendered as "the popup isn't there at all" under a keyboard
// rather than just badly placed.
export function useVisualViewportInset(): {
  visibleHeight: number;
  keyboardInset: number;
  /** How far down the page the visible area has been panned (iOS pans it to
   * keep a focused field in view when the keyboard opens). */
  offsetTop: number;
} {
  const [state, setState] = useState(() => ({
    visibleHeight: typeof window !== "undefined" ? window.innerHeight : 800,
    keyboardInset: 0,
    offsetTop: 0,
  }));
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      setState({
        visibleHeight: vv.height,
        keyboardInset: Math.max(
          0,
          window.innerHeight - vv.height - vv.offsetTop
        ),
        offsetTop: vv.offsetTop,
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return state;
}
