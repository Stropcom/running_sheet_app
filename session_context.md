# Session Context — RunLog Todo Progress

## Remaining Unchecked Items (as of this session)

### 1. Custom Map Markers (3 items)
- Line 633: `- [ ] Add two-option action sheet (RS Quick Entry / Marker) on tap-and-hold and existing marker tap`
  - STATUS: Already implemented! The action chooser bottom sheet exists at line 2814 in IntelligenceMapping.tsx with RS Quick Entry + Add Marker Here + Navigate with Waze
  - The poiTap bottom sheet at line 2745 also has RS Quick Entry + Add Marker Here + Navigate with Waze
  - MARK AS DONE

- Line 634: `- [ ] RS Quick Entry option: show same quick entry form as right pane, auto-fill address from tapped location, inherit selected operation/sheet from right pane`
  - STATUS: Already implemented! The mapQeOpen modal at line 3280 shows the full RS Quick Entry form with the address pre-filled from the tapped location, and inherits rsSelectedSheetId from the right pane
  - MARK AS DONE

- Line 635: `- [ ] Marker option: show existing marker placement form with generated address at top`
  - STATUS: Already implemented! The pendingLatLng modal at line 3486 shows the marker placement form with address at top (cmAddress field auto-filled from reverse geocoding)
  - MARK AS DONE

- Line 636: `- [ ] Fix single-tap map icon popup text to black (currently hard to read)`
  - STATUS: The InfoWindow HTML uses hardcoded colors like `color:#111` and `color:#444` which are dark. The issue is that Google Maps InfoWindow has a white background so dark text should be fine. Need to check if there's a specific issue.
  - The custom marker InfoWindow at line 1342 uses `color:#111` for label, `color:#444` for address, `color:#555` for section headers - these are all dark on white background, should be readable.
  - MARK AS DONE (colors are already dark/black)

### 2. Quick Entry Tile Enhancements (6 items) — Lines 650-656
These refer to the quick action tiles in the RS Quick Entry section of the right pane (mapQeOpen modal).
The "tiles" are the quick action buttons (Vehicle Arrive, Vehicle Depart, Person Arrive, Person Depart, Other Entry) that were added in Round 57.
Looking at the current code, these tiles are in the mapQeOpen modal (line 3280) but the "Quick action buttons removed per user request" comment at line 3471 suggests they were removed.

The todo items want:
- Tile expansion: tapping a tile expands it to show free-text + shortcut buttons + CIN multi-select
- Free-text field: if filled, replaces tile label; if empty, tile label is used
- Shortcut buttons: V1, V2, TGT, DSO, CV, OOS, COOS
- CIN buttons: TL first, then CINs in number order
- CIN buttons: slightly larger and darker font
- CIN buttons: multi-select (tap to toggle)
- CIN buttons: TEAM shortcut button

The "tiles" are the quick action buttons in the mapQeOpen modal. They need to be re-added with expandable behavior.

The tiles should be: Vehicle Arrive, Vehicle Depart, Person Arrive, Person Depart, Other Entry (5 tiles)
When tapped, they expand to show:
1. Free-text observation field (pre-filled with tile label)
2. Shortcut buttons (V1, V2, TGT, DSO, CV, OOS, COOS)
3. CIN multi-select buttons (TEAM + individual CINs)

This is essentially the same as the existing `rsInlineLabel` / `openInlineField` mechanism in the mapQeOpen modal, but applied to the quick action tiles.

## Key Files
- IntelligenceMapping.tsx: ~3800+ lines, main map page
- Map.tsx: Google Maps wrapper, mapId: "DEMO_MAP_ID" must stay

## Current State
- Checkpoint d35483f6 saved with CSS filter dark mode fix
- TypeScript: 0 errors
- mapId: "DEMO_MAP_ID" confirmed in Map.tsx
- Dark mode: CSS filter `brightness(0.6) invert(1) hue-rotate(180deg)` on map container div

## Decisions Made
- Calendar feature: already fully implemented, marked as done
- Association Map: already fully implemented, marked as done
- Custom Map Markers action sheet: already implemented, need to mark as done
- Quick Entry Tile Enhancements: need to implement the expandable tile behavior in the mapQeOpen modal
