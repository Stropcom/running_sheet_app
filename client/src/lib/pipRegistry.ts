// The picture-in-picture panels that are open on a map right now, so a panel
// that opens can see where the others are and sit beside them
// (shared/pipLayout.ts decides where). Street View registers while it is
// visible, Photos while it is mounted.
import type { PipRect } from "@shared/pipLayout";

const open = new Set<HTMLElement>();

export function registerPip(el: HTMLElement) {
  open.add(el);
}

export function unregisterPip(el: HTMLElement) {
  open.delete(el);
}

/** The other open panels in the same container, as rectangles in the
 * container's own coordinates. */
export function otherPipRects(
  self: HTMLElement,
  container: HTMLElement
): PipRect[] {
  const c = container.getBoundingClientRect();
  return Array.from(open)
    .filter(el => el !== self && el.parentElement === container)
    .map(el => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - c.left,
        top: r.top - c.top,
        width: r.width,
        height: r.height,
      };
    });
}
