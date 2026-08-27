/**
 * FaceMatchNotificationContext.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Carries "which Facial Recognition notification was just clicked in the
 * bell" across the route change that follows — NotificationBell.tsx sets it
 * right before navigating to the sheet, and FaceMatchAckDialog.tsx (mounted
 * on SheetDetail) reads it to decide whether to show the full-text pop-up.
 *
 * Deliberately click-triggered rather than "show automatically whenever
 * there's an unread match notification and the officer happens to be on
 * that sheet" — the pop-up used to fire the instant the officer landed on
 * the page (even just from opening the bell while already there), which
 * felt premature. It also deliberately ignores readAt: re-clicking an
 * already-acknowledged notification must still reopen the full text, so
 * officers can look at it again later without it needing a "still unread"
 * excuse.
 *
 * Lives above the router (see App.tsx) rather than inside DashboardLayout,
 * since DashboardLayout remounts on every route change — a context scoped
 * to it would lose the "just clicked" signal in the same navigation it's
 * meant to survive.
 */
import React, { createContext, useCallback, useContext, useState } from "react";

interface FaceMatchNotificationContextValue {
  activeNotificationId: number | null;
  openNotification: (id: number) => void;
  clearActiveNotification: () => void;
  /** Same as clearActiveNotification, but only clears if `id` is still the
   * active one — for a dialog's unmount cleanup, so leaving sheet A right
   * as a fresh click opens sheet B's notification can't wipe out the id B
   * just set (both updates can land in the same navigation's render pass). */
  clearIfActive: (id: number) => void;
}

const FaceMatchNotificationContext =
  createContext<FaceMatchNotificationContextValue | null>(null);

export function FaceMatchNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeNotificationId, setActiveNotificationId] = useState<
    number | null
  >(null);

  const openNotification = useCallback((id: number) => {
    setActiveNotificationId(id);
  }, []);
  const clearActiveNotification = useCallback(() => {
    setActiveNotificationId(null);
  }, []);
  const clearIfActive = useCallback((id: number) => {
    setActiveNotificationId(prev => (prev === id ? null : prev));
  }, []);

  return (
    <FaceMatchNotificationContext.Provider
      value={{
        activeNotificationId,
        openNotification,
        clearActiveNotification,
        clearIfActive,
      }}
    >
      {children}
    </FaceMatchNotificationContext.Provider>
  );
}

export function useFaceMatchNotification() {
  const ctx = useContext(FaceMatchNotificationContext);
  if (!ctx) {
    throw new Error(
      "useFaceMatchNotification must be used within a FaceMatchNotificationProvider"
    );
  }
  return ctx;
}
