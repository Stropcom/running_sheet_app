# Map Bottom Tab Bar & RS Quick Entry Implementation Notes

## Current Bottom Bar (lines 2741-2840)
- Pill 1: Folders (fixed) → setLocation("/")
- Pill 2: Dashboard (fixed) → setLocation("/tile-home")  ← REMOVE THIS
- Pill 3: Active RS (fixed) — shows sheet title, greyed when none selected
- Pill 4: Customisable slot 1 (quickLinks[0])
- Pills 5&6: Customisable slots 2&3, laptop only (hidden lg:block)
- Hold-to-edit opens editingQuickLinks modal

## New Bottom Bar Layout
- Pill 1: Folders (fixed) → setLocation("/")
- Pill 2: Active RS (fixed) — label always "Active RS" (not the sheet title), greyed when none selected
- Pill 3: RS Quick Entry (fixed, indigo) → setMapQeOpen(true), greyed when no sheet selected
- Pill 4: Custom slot 1 (all devices)
- Pill 5: Custom slot 2 (tablet md+ only)
- Pill 6: Custom slot 3 (laptop lg+ only)
- Hold-to-edit still opens editingQuickLinks modal

## Right Pane RS Quick Entry Section to REMOVE
Lines 2510-2622: The `{rsSelectedSheetId !== null && (<div className="rounded-xl border-2...">` block
Also remove rsQeExpanded from localStorage persistence (line 769) and from useEffect deps (line 773)
Also remove rsQeExpanded state (lines 612-613)

## RS Quick Entry Modal Enhancements (mapQeOpen modal, lines 3447-3651)
### Time Selector
- Add state: `const [mapQeTimeOverride, setMapQeTimeOverride] = useState<string | null>(null);`
  - null = use current time, string = "HH:MM AM/PM" override
- Add compact time selector UI in the modal (after header, before no-sheet warning)
- When mapQeOpen opens, initialize mapQeTimeOverride to null (use current time)
- Update addQuickRsEntry to accept optional timeOverride param
- If timeOverride provided, parse it and use instead of new Date()

### Phrase Shortcuts (keyboard expansion)
- Add `trpc.targetShortcuts.listForSheet.useQuery({ sheetId: rsSelectedSheetId! }, { enabled: !!rsSelectedSheetId })` 
  - This is separate from the existing `targetShortcuts` query (which uses targetId)
- Build shortcutMap (same as SheetDetail.tsx lines 1637-1657):
  - Global shortcuts from generalShortcuts
  - Target fields from rsTargetData (tgt, hbf, hb, v1f, v1, v2f, v2, dep, arr)
  - Per-target custom shortcuts from listForSheet
- Add handleShortcutKeyDown to the rsInlineInputRef textarea in the modal
  - On Space/Tab: find last word before cursor, look up in shortcutMap, replace if found

## Left Pane Nav Order
### MapSidebarNav component (lines 444-557)
- Add `trpc.sidebar.getOrder.useQuery()` inside the component
- Build ordered nav list from saved order, same merge logic as DashboardLayout lines 417-427
- Nav key → path/icon/color mapping:
  - operations → "/" / FileText / text-cyan-500
  - governance → "/governance" / ClipboardCheck / text-purple-500
  - todo → "/todo" / ClipboardList / text-rose-500
  - mapping → "/intelligence/mapping" / MapIcon / text-teal-500
  - calendar → "/calendar" / CalendarDays / text-orange-500
  - shortcuts → "/shortcuts" / Zap / text-yellow-500
  - intelligence → "/intelligence" / FolderSearch / text-violet-500
  - targetRegistry → "/target-registry" / BookOpen / text-rose-400
  - operationManager → "/operation-manager" / ClipboardList / text-purple-500
- Render navBtn calls in order from the saved/merged order array
- Keep Administration and User Management folders at the bottom (always last, not in order)

## Imports to add
- `useMemo` is already imported (check)
- Need to add `Clock` icon for time selector from lucide-react
- `ChevronUp` for time selector increment

## Quick-link editor modal update
- Change "up to 4 folders" text to "up to 3 folders"
- Change slot count display from "X/2 slots used" to "X/3 slots used"
- Allow up to 3 custom slots (not 2)
- quickLinks[0] = slot 1 (all devices), quickLinks[1] = slot 2 (tablet+), quickLinks[2] = slot 3 (laptop only)
