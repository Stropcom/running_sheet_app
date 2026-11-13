/**
 * ObservationKeyboardContext
 * ──────────────────────────────────────────────────────────────────────────────
 * Phone / tablet only: whether the on-screen keyboard is switched on for the
 * running sheet's observation cells. Off by default, so tapping a cell opens it
 * with the caret in place and the shortcut chips and the row stay in view; the
 * keyboard icon in the sheet's toolbar switches it on (and off again). Same idea
 * as the Keyboard button on the Map's Quick Entry. Laptop / desktop never use
 * this — their cells type straight away.
 *
 * Switching it while a cell is open has to re-focus that field inside the tap
 * (a browser only raises or drops the keyboard on a fresh focus), so the open
 * cell registers a small function here and `toggleKeyboard` calls it at once.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type Applier = (on: boolean) => void;

interface ObservationKeyboardValue {
  /** The on-screen keyboard is switched on (touch devices). */
  keyboardOn: boolean;
  toggleKeyboard: () => void;
  /** The open cell offers its re-focus function (and takes it back). */
  setKeyboardApplier: (fn: Applier) => void;
  clearKeyboardApplier: (fn: Applier) => void;
}

const ObservationKeyboardContext = createContext<ObservationKeyboardValue>({
  // Outside the running sheet nothing restricts the keyboard.
  keyboardOn: true,
  toggleKeyboard: () => {},
  setKeyboardApplier: () => {},
  clearKeyboardApplier: () => {},
});

export function ObservationKeyboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [keyboardOn, setKeyboardOn] = useState(false);
  const onRef = useRef(false);
  const applierRef = useRef<Applier | null>(null);

  const toggleKeyboard = useCallback(() => {
    const next = !onRef.current;
    onRef.current = next;
    setKeyboardOn(next);
    // Inside the tap, so the browser raises / drops the keyboard.
    applierRef.current?.(next);
  }, []);
  const setKeyboardApplier = useCallback((fn: Applier) => {
    applierRef.current = fn;
  }, []);
  const clearKeyboardApplier = useCallback((fn: Applier) => {
    if (applierRef.current === fn) applierRef.current = null;
  }, []);

  const value = useMemo(
    () => ({
      keyboardOn,
      toggleKeyboard,
      setKeyboardApplier,
      clearKeyboardApplier,
    }),
    [keyboardOn, toggleKeyboard, setKeyboardApplier, clearKeyboardApplier]
  );
  return (
    <ObservationKeyboardContext.Provider value={value}>
      {children}
    </ObservationKeyboardContext.Provider>
  );
}

export function useObservationKeyboard() {
  return useContext(ObservationKeyboardContext);
}
