// Part of the Team Duty Roster page (client/src/pages/CtoRoster/RosterPage.tsx): the drag sensors that leave shift cells to plain taps.
// Moved out of that file unchanged — only imports and `export` keywords differ; see
// docs/features/dev-and-ops.md (Big-file plan, phase 3).

import { PointerSensor, TouchSensor } from "@dnd-kit/core";

// Custom DnD sensors that refuse to activate when the touch/pointer starts on
// an element with data-no-dnd="true" (shift cells). This prevents the
// TouchSensor from intercepting normal taps on iOS.
function shouldHandleEvent(element: EventTarget | null): boolean {
  let cur = element as HTMLElement | null;
  while (cur) {
    if (cur.dataset?.noDnd === "true") return false;
    // Reordering is off while the roster is zoomed out (the drag maths is for 100%).
    if (cur.dataset?.rosterZoomedOut === "true") return false;
    cur = cur.parentElement;
  }
  return true;
}
export class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) =>
        shouldHandleEvent(nativeEvent.target),
    },
  ];
}
export class SmartTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: ({ nativeEvent }: { nativeEvent: TouchEvent }) =>
        shouldHandleEvent(nativeEvent.target),
    },
  ];
}
