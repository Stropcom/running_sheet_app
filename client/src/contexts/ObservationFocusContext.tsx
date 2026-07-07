/**
 * ObservationFocusContext
 * ──────────────────────────────────────────────────────────────────────────────
 * Tracks whether any observation textarea is currently focused.
 * Used by the Shortcuts sidebar item to conditionally show the
 * Shortcuts Reference hover panel.
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";

interface ObservationFocusContextValue {
  /** True when any observation cell textarea has focus */
  isObservationFocused: boolean;
  /** Call from an observation textarea's onFocus */
  notifyObservationFocus: () => void;
  /** Call from an observation textarea's onBlur */
  notifyObservationBlur: () => void;
}

const ObservationFocusContext = createContext<ObservationFocusContextValue>({
  isObservationFocused: false,
  notifyObservationFocus: () => {},
  notifyObservationBlur: () => {},
});

export function ObservationFocusProvider({ children }: { children: React.ReactNode }) {
  const [isObservationFocused, setIsObservationFocused] = useState(false);
  // Use a counter so nested/multiple textareas don't race
  const focusCount = useRef(0);

  const notifyObservationFocus = useCallback(() => {
    focusCount.current += 1;
    setIsObservationFocused(true);
  }, []);

  const notifyObservationBlur = useCallback(() => {
    focusCount.current = Math.max(0, focusCount.current - 1);
    if (focusCount.current === 0) {
      // Small delay so clicking into the shortcuts panel doesn't flicker
      setTimeout(() => {
        if (focusCount.current === 0) setIsObservationFocused(false);
      }, 200);
    }
  }, []);

  return (
    <ObservationFocusContext.Provider
      value={{ isObservationFocused, notifyObservationFocus, notifyObservationBlur }}
    >
      {children}
    </ObservationFocusContext.Provider>
  );
}

export function useObservationFocus() {
  return useContext(ObservationFocusContext);
}
