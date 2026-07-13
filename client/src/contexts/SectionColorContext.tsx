import React, { createContext, useContext, useMemo } from "react";
import { useLocation } from "wouter";

export type SectionColor = {
  name: string;
  // Tailwind text colour class for the icon/accent
  text: string;
  // Tailwind border colour class for the header accent bar
  border: string;
  // Tailwind background tint class for the header area
  bg: string;
  // Raw hex for use in inline styles if needed
  hex: string;
};

const SECTION_COLORS: Record<string, SectionColor> = {
  operations: {
    name: "Operations",
    text: "text-blue-700",
    border: "border-blue-700/50",
    bg: "bg-blue-700/8",
    hex: "#1d4ed8",
  },
  governance: {
    name: "Governance",
    text: "text-purple-400",
    border: "border-purple-400/50",
    bg: "bg-purple-400/8",
    hex: "#c084fc",
  },
  todo: {
    name: "To-Do",
    text: "text-red-400",
    border: "border-red-400/50",
    bg: "bg-red-400/8",
    hex: "#f87171",
  },
  mapping: {
    name: "Mapping",
    text: "text-teal-400",
    border: "border-teal-400/50",
    bg: "bg-teal-400/8",
    hex: "#2dd4bf",
  },
  calendar: {
    name: "Calendar",
    text: "text-orange-400",
    border: "border-orange-400/50",
    bg: "bg-orange-400/8",
    hex: "#fb923c",
  },
  shortcuts: {
    name: "Shortcuts",
    text: "text-yellow-400",
    border: "border-yellow-400/50",
    bg: "bg-yellow-400/8",
    hex: "#facc15",
  },
  intelligence: {
    name: "Intelligence",
    text: "text-violet-400",
    border: "border-violet-400/50",
    bg: "bg-violet-400/8",
    hex: "#a78bfa",
  },
  targetRegistry: {
    name: "Target Registry",
    text: "text-rose-400",
    border: "border-rose-400/50",
    bg: "bg-rose-400/8",
    hex: "#fb7185",
  },
  administration: {
    name: "Administration",
    text: "text-slate-400",
    border: "border-slate-400/50",
    bg: "bg-slate-400/8",
    hex: "#94a3b8",
  },
  userManagement: {
    name: "User Management",
    text: "text-blue-400",
    border: "border-blue-400/50",
    bg: "bg-blue-400/8",
    hex: "#60a5fa",
  },
};

function getSectionKey(location: string): string {
  if (location === "/" || location.startsWith("/operation/") || location.startsWith("/sheet/")) return "operations";
  if (location.startsWith("/governance")) return "governance";
  if (location.startsWith("/todo")) return "todo";
  if (location.startsWith("/intelligence/mapping")) return "mapping";
  if (location.startsWith("/calendar")) return "calendar";
  if (location.startsWith("/shortcuts")) return "shortcuts";
  if (location.startsWith("/intelligence")) return "intelligence";
  if (location.startsWith("/target-registry")) return "targetRegistry";
  if (location.startsWith("/court") || location === "/audit" || location === "/draft" || location === "/operation-management" || location === "/recycle-bin" || location === "/help" || location === "/reports") return "administration";
  if (location === "/profile" || location === "/admin") return "userManagement";
  return "operations";
}

const SectionColorContext = createContext<SectionColor>(SECTION_COLORS.operations);

export function SectionColorProvider({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const color = useMemo(() => {
    const key = getSectionKey(location);
    return SECTION_COLORS[key] ?? SECTION_COLORS.operations;
  }, [location]);

  return (
    <SectionColorContext.Provider value={color}>
      {children}
    </SectionColorContext.Provider>
  );
}

export function useSectionColor(): SectionColor {
  return useContext(SectionColorContext);
}
