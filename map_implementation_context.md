# Map Bottom Tab Bar & RS Quick Entry - Implementation Context

## File: IntelligenceMapping.tsx (4016 lines)

### Changes needed:

#### 1. Add Clock icon import (line 63)
Add `Clock, ChevronUp` to lucide-react imports

#### 2. Update DEFAULT_QUICK_LINKS (line 144-151)
Change to only 3 items (for 3 custom slots):
```
const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: "Intel Profiles", path: "/intelligence", icon: "FolderSearch" },
  { label: "Governance", path: "/governance", icon: "ClipboardCheck" },
  { label: "Calendar", path: "/calendar", icon: "CalendarDays" },
];
```

#### 3. Remove rsQeExpanded state (lines 612-613)
Remove: `const [rsQeExpanded, setRsQeExpanded] = useState<boolean>(...)`

#### 4. Remove rsQeText, rsQeCins, rsQeInputRef (lines 656-659)
Remove these 3 state declarations (only used in right pane RS QE section)

#### 5. Add mapQeTimeOverride state (after line 671)
Add: `const [mapQeTimeOverride, setMapQeTimeOverride] = useState<string | null>(null);`
Format: "HH:MM AM/PM" or null for current time

#### 6. Add targetShortcuts.listForSheet query (after line 914)
Add:
```
const { data: targetShortcutsForSheet } = trpc.targetShortcuts.listForSheet.useQuery(
  { sheetId: rsSelectedSheetId! },
  { enabled: !!rsSelectedSheetId }
);
```

#### 7. Add sidebar order query (after line 914 area)
Add:
```
const { data: sidebarOrderData } = trpc.sidebar.getOrder.useQuery(undefined, { staleTime: 30_000 });
const mapNavOrder = useMemo(() => {
  const DEFAULT_NAV_ORDER = ["operations", "governance", "todo", "mapping", "calendar", "shortcuts", "intelligence", "targetRegistry", "operationManager"];
  if (!sidebarOrderData?.order?.length) return DEFAULT_NAV_ORDER;
  const saved = sidebarOrderData.order;
  const merged = [...saved.filter(k => DEFAULT_NAV_ORDER.includes(k))];
  for (const k of DEFAULT_NAV_ORDER) { if (!merged.includes(k)) merged.push(k); }
  return merged;
}, [sidebarOrderData]);
```

#### 8. Update localStorage persistence (lines 769, 773)
Remove rsQeExpanded from both lines

#### 9. Update addQuickRsEntry signature (line 2005)
Change to: `const addQuickRsEntry = (observation: string, cinsToAttach?: Set<string> | null, timeOverride?: string | null) => {`
When timeOverride is provided, parse it instead of using new Date():
```
let timeStr: string;
let totalMins: number;
if (timeOverride) {
  // Parse "HH:MM AM/PM"
  const match = timeOverride.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    totalMins = h * 60 + m;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    timeStr = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
  } else {
    // Fallback to current time
    const now = new Date();
    const h24 = now.getHours(); const min = now.getMinutes();
    totalMins = h24 * 60 + min;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
  }
} else {
  const now = new Date();
  const h24 = now.getHours(); const min = now.getMinutes();
  totalMins = h24 * 60 + min;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
```

#### 10. Update mapQeOpen effect (line 1987)
Add `setMapQeTimeOverride(null);` when mapQeOpen opens (reset time to current)

#### 11. Update submitInlineField (line 1960)
Change to: `addQuickRsEntry(finalText, cinsToAttach, mapQeTimeOverride);`

#### 12. Update MapSidebarNav component (lines 444-557)
Add props: `navOrder: string[]`
Change render section to iterate navOrder and call navBtn for each key:
```
const NAV_KEY_MAP: Record<string, { path: string; Icon: ...; label: string; iconColor: string }> = {
  operations: { path: "/", Icon: FileText, label: "Operations", iconColor: "text-cyan-500" },
  governance: { path: "/governance", Icon: ClipboardCheck, label: "Governance", iconColor: "text-purple-500" },
  todo: { path: "/todo", Icon: ClipboardList, label: "To-Do", iconColor: "text-rose-500" },
  mapping: { path: "/intelligence/mapping", Icon: MapIcon, label: "Mapping", iconColor: "text-teal-500" },
  calendar: { path: "/calendar", Icon: CalendarDays, label: "Calendar", iconColor: "text-orange-500" },
  shortcuts: { path: "/shortcuts", Icon: Zap, label: "Shortcuts", iconColor: "text-yellow-500" },
  intelligence: { path: "/intelligence", Icon: FolderSearch, label: "Intelligence", iconColor: "text-violet-500" },
  targetRegistry: { path: "/target-registry", Icon: BookOpen, label: "Target Registry", iconColor: "text-rose-400" },
  operationManager: { path: "/operation-manager", Icon: ClipboardList, label: "Op Manager", iconColor: "text-purple-500" },
};
```
Then render: `{navOrder.map(key => { const item = NAV_KEY_MAP[key]; if (!item) return null; return navBtn(item.path, item.Icon, item.label, item.iconColor); })}`

#### 13. Update MapSidebarNav call site (line 2066)
Change to: `<MapSidebarNav user={user} onNavigate={...} navOrder={mapNavOrder} />`

#### 14. Remove RS Quick Entry from right pane (lines 2510-2622)
Remove the entire block: `{/* RS Quick Entry — collapsible inline panel */}` through `{/* end RS Selection */}`
Keep the `</div>{/* end RS Selection */}` closing tag

#### 15. Update bottom bar (lines 2741-2840)
Replace the entire bottom bar with:
- Pill 1: Folders (fixed)
- Pill 2: Active RS (fixed, label always "Active RS", greyed when no sheet)
- Pill 3: RS Quick Entry (fixed, indigo, greyed when no sheet, opens mapQeOpen)
- Pill 4: Custom slot 1 (all devices, quickLinks[0])
- Pill 5: Custom slot 2 (tablet md+, quickLinks[1])
- Pill 6: Custom slot 3 (laptop lg+, quickLinks[2])

#### 16. Update quick-link editor modal (lines 2855-2905)
- Change "up to 4 folders" → "up to 3 folders"
- Change `prev.length < 4` → `prev.length < 3`
- Change `prev.slice(0, 3)` → `prev.slice(0, 2)`
- Change `{quickLinks.length}/2 slots used` → `{quickLinks.length}/3 slots used`

#### 17. Add time selector to mapQeOpen modal (after header, before no-sheet warning)
Add compact time selector:
```jsx
{/* Time selector */}
<div className="flex items-center gap-2 mb-3">
  <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
  <span className="text-[11px] text-muted-foreground font-medium">Time:</span>
  <input
    type="time"
    value={mapQeTimeOverride ? parseTimeOverrideToInput(mapQeTimeOverride) : getCurrentTimeInput()}
    onChange={(e) => {
      const [h, m] = e.target.value.split(":").map(Number);
      const ampm = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      setMapQeTimeOverride(`${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`);
    }}
    className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
  />
  {mapQeTimeOverride && (
    <button onClick={() => setMapQeTimeOverride(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Now</button>
  )}
</div>
```

#### 18. Add shortcut keyboard expansion to rsInlineInputRef textarea
Add onKeyDown handler to the textarea at line 3541-3548:
```jsx
onKeyDown={(e) => {
  if (e.key === " " || e.key === "Tab") {
    const textarea = e.currentTarget;
    const pos = textarea.selectionStart ?? 0;
    const textBefore = rsInlineText.slice(0, pos);
    const match = textBefore.match(/(\S+)$/);
    if (match) {
      const word = match[1].toLowerCase();
      const expansion = mapQeShortcutMap[word];
      if (expansion) {
        e.preventDefault();
        const before = textBefore.slice(0, textBefore.length - match[1].length);
        const after = rsInlineText.slice(pos);
        const newText = before + expansion + " " + after;
        setRsInlineText(newText);
        resetInlineTimer();
        requestAnimationFrame(() => {
          const newPos = before.length + expansion.length + 1;
          textarea.setSelectionRange(newPos, newPos);
        });
        return;
      }
    }
  }
}}
```

#### 19. Build mapQeShortcutMap (useMemo after sidebar order query)
```
const mapQeShortcutMap = useMemo(() => {
  const map: Record<string, string> = {};
  for (const s of (generalShortcuts as any[] ?? [])) map[s.trigger.toLowerCase()] = s.expansion;
  if (rsTargetData) {
    const t = rsTargetData;
    if (t.tgt) map['tgt'] = t.tgt;
    if (t.hbf) map['hbf'] = t.hbf;
    if (t.hb) map['hb'] = t.hb;
    if (t.v1f) map['v1f'] = t.v1f;
    if (t.v1) map['v1'] = t.v1;
    if (t.v2f) map['v2f'] = t.v2f;
    if (t.v2) map['v2'] = t.v2;
    if (t.dep) map['dep'] = t.dep;
    if (t.arr) map['arr'] = t.arr;
  }
  for (const s of (targetShortcutsForSheet as any[] ?? [])) map[s.trigger.toLowerCase()] = s.expansion;
  return map;
}, [generalShortcuts, rsTargetData, targetShortcutsForSheet]);
```

## Helper functions to add (before the return statement)
```
const getCurrentTimeInput = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};
const parseTimeOverrideToInput = (t: string) => {
  const match = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return getCurrentTimeInput();
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
```
