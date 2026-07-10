import React, { createContext, useContext, useState } from "react";

export type ViewMode = "folder" | "tile";

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

const LS_KEY = "viewMode";

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === "folder" || stored === "tile") return stored;
    } catch { /* ignore */ }
    return "folder";
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try { localStorage.setItem(LS_KEY, mode); } catch { /* ignore */ }
  };

  const toggleViewMode = () => setViewMode(viewMode === "folder" ? "tile" : "folder");

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, toggleViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error("useViewMode must be used within ViewModeProvider");
  return ctx;
}
