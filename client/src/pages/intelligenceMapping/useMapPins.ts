// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page used to be one
// 13,400-line function; its state, effects and handlers are now these step hooks, called in order by
// useMapScreen. Same code as before (only refs, callbacks and plain definitions were moved earlier,
// never an effect); see docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { useEffect } from "react";
import { teamShownOnMap } from "@shared/teamMap";
import { signIconOf, type PlaceSignIcon } from "@shared/placeSigns";
import {
  entryMentionsAddress,
  pinKeyForTappedPlace,
  popupShortAddress,
} from "@shared/markerLink";
import { samePlace } from "@shared/targetPosition";
import { autoTrackAllOff } from "@shared/autoTrack";
import { toast } from "sonner";
import { addressesMatch } from "./addressMatch";
import { type IntelMapLocation, type LiveUser } from "./mapTypes";
import { NO_TEAM_PIN_COLOUR } from "./pinStyling";
import type { MapNearbyState } from "./useMapNearby";
import type { MapAddressSearchState } from "./useMapAddressSearch";
import type { MapBasicsState } from "./useMapBasics";
import type { MapSharingState } from "./useMapSharing";
import type { MapPanesState } from "./useMapPanes";
import type { MapDataState } from "./useMapData";
import type { MapMarkersState } from "./useMapMarkers";
import type { MapPlacingState } from "./useMapPlacing";
import type { MapRsDraftState } from "./useMapRsDraft";
import type { QeDupe } from "./screenTypes";

export function useMapPins(
  s: Pick<MapNearbyState, "nearbyMarkersRef" | "nearbyCircleRef"> &
    Pick<
      MapAddressSearchState,
      | "locations"
      | "mapTeams"
      | "onlineTeamIds"
      | "liveUsers"
      | "trackStartsRef"
      | "customMarkersDataRef"
      | "refetchLocations"
      | "mergedIntelRef"
    > &
    Pick<
      MapBasicsState,
      "setHiddenTeams" | "setHiddenUsers" | "setTracedUserIds"
    > &
    Pick<MapSharingState, "autoTrackRef" | "teamSearch"> &
    Pick<
      MapPanesState,
      | "rsInlineTimerRef"
      | "rsCountdownIntervalRef"
      | "setRsInlineLabel"
      | "setRsInlineText"
      | "setRsInlineCins"
      | "rsInlineCinsRef"
      | "rsInlineUsedVoiceRef"
      | "rsInlineTypedRef"
      | "setRsCountdown"
      | "setRsInlineTypingMode"
      | "setRsInlineUndoStack"
      | "rsSelectedSheetId"
      | "setRsAddingRow"
      | "setRsLastEntry"
      | "setRsEditingLastEntry"
    > &
    Pick<
      MapDataState,
      | "updateCustomMarkerMut"
      | "refetchCustomMarkers"
      | "pinOverridesRef"
      | "savePinOverrideMut"
      | "utils"
    > &
    Pick<MapMarkersState, "renderLocations"> &
    Pick<
      MapPlacingState,
      "mapQeMarkerIdRef" | "mapQeAddress" | "mapQePoiPosRef" | "mapQePoiSignRef"
    > &
    Pick<
      MapRsDraftState,
      | "rsCreateRow"
      | "rsAddMember"
      | "qePendingEntryRef"
      | "setQeDupeQueue"
      | "setQeDupeIndex"
      | "setQeDupeDialogOpen"
    >
) {
  const {
    nearbyMarkersRef,
    nearbyCircleRef,
    locations,
    mapTeams,
    onlineTeamIds,
    liveUsers,
    setHiddenTeams,
    setHiddenUsers,
    setTracedUserIds,
    trackStartsRef,
    autoTrackRef,
    teamSearch,
    rsInlineTimerRef,
    rsCountdownIntervalRef,
    setRsInlineLabel,
    setRsInlineText,
    setRsInlineCins,
    rsInlineCinsRef,
    rsInlineUsedVoiceRef,
    rsInlineTypedRef,
    setRsCountdown,
    setRsInlineTypingMode,
    setRsInlineUndoStack,
    customMarkersDataRef,
    refetchLocations,
    updateCustomMarkerMut,
    refetchCustomMarkers,
    mergedIntelRef,
    renderLocations,
    pinOverridesRef,
    savePinOverrideMut,
    rsSelectedSheetId,
    setRsAddingRow,
    mapQeMarkerIdRef,
    mapQeAddress,
    mapQePoiPosRef,
    mapQePoiSignRef,
    rsCreateRow,
    setRsLastEntry,
    setRsEditingLastEntry,
    rsAddMember,
    utils,
    qePendingEntryRef,
    setQeDupeQueue,
    setQeDupeIndex,
    setQeDupeDialogOpen,
  } = s;

  // Gone with the page.
  useEffect(
    () => () => {
      nearbyMarkersRef.current.forEach(m => {
        m.map = null;
      });
      nearbyMarkersRef.current.clear();
      nearbyCircleRef.current?.setMap(null);
      nearbyCircleRef.current = null;
    },
    []
  );

  // ── Stats ────────────────────────────────────────────────────────────────────
  const targetPins =
    locations?.filter(l => l.type === "target_address").length ?? 0;
  const obsPins = locations?.filter(l => l.type === "observation").length ?? 0;

  // ── Group live users by team for the settings panel ──────────────────────────
  // One row per team: the viewer's own teams first (so an empty team still
  // shows "No units online"), then any other team that has someone live.
  const teamRows: Array<{
    key: string;
    label: string;
    colour: string;
    users: LiveUser[];
  }> = mapTeams
    // Team 1, Team 2, PTT, Capability and any team an admin has added always
    // show (a temporary team stays until it is deleted); a team set to
    // "online" (Admin, Investigators) shows only while someone in it is
    // logged in — see shared/teamMap.ts.
    .filter(t =>
      teamShownOnMap(
        t,
        onlineTeamIds,
        ((liveUsers ?? []) as LiveUser[]).some(u => u.teamId === t.id)
      )
    )
    .map(t => ({
      key: String(t.id),
      label: t.name,
      colour: t.colour ?? NO_TEAM_PIN_COLOUR,
      users: [],
    }));
  const unassignedLiveUsers: LiveUser[] = [];
  if (liveUsers) {
    for (const u of liveUsers as LiveUser[]) {
      if (u.teamId == null) {
        unassignedLiveUsers.push(u);
        continue;
      }
      const key = String(u.teamId);
      let row = teamRows.find(r => r.key === key);
      if (!row) {
        row = {
          key,
          label: u.teamName ?? "Team",
          colour: u.teamColour ?? NO_TEAM_PIN_COLOUR,
          users: [],
        };
        teamRows.push(row);
      }
      row.users.push(u);
    }
  }

  const toggleTeamVisibility = (teamKey: string) => {
    setHiddenTeams(prev => {
      const next = new Set(prev);
      next.has(teamKey) ? next.delete(teamKey) : next.add(teamKey);
      return next;
    });
  };

  const toggleUserVisibility = (userId: number) => {
    setHiddenUsers(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  // Draws an officer's recorded GPS breadcrumb from user_location_history.
  // Labelled "Track" in the UI — the running-sheet map's old "Trace Route"
  // (waypoint route reconstruction) was a different feature and has been
  // removed, so the name is no longer shared. The internal tracedUserIds /
  // traceLinesRef names are unchanged to keep this diff to the label.
  const toggleUserTrace = (userId: number) => {
    setTracedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        trackStartsRef.current.delete(userId);
      } else {
        next.add(userId);
        // Track draws from the moment it is switched on, not from whatever
        // history already exists — an officer tracked for a search wants the
        // line to start where they started, not to open with the drive in.
        trackStartsRef.current.set(userId, Date.now());
      }
      return next;
    });
  };

  // My Pill → Track: the same switch as Track in the Teams panel, for everyone
  // at once and on this screen only. On shows the trail of me and of everyone
  // sharing their location on the operation; off clears every trail here. It
  // never changes anyone else's screen, and while off a Search switches no
  // more on for the rest of that Search.
  const setTrackAll = (on: boolean) => {
    if (on) {
      const ids = Array.from(
        new Set(
          ((liveUsers as LiveUser[] | undefined) ?? []).map(u => u.userId)
        )
      );
      const now = Date.now();
      for (const id of ids)
        if (!trackStartsRef.current.has(id))
          trackStartsRef.current.set(id, now);
      setTracedUserIds(prev => new Set([...Array.from(prev), ...ids]));
    } else {
      trackStartsRef.current.clear();
      setTracedUserIds(new Set());
      autoTrackRef.current = autoTrackAllOff(
        autoTrackRef.current,
        teamSearch.active && teamSearch.search ? teamSearch.key : null
      );
    }
  };

  const closeInlineField = () => {
    if (rsInlineTimerRef.current) clearTimeout(rsInlineTimerRef.current);
    if (rsCountdownIntervalRef.current)
      clearInterval(rsCountdownIntervalRef.current);
    setRsInlineLabel(null);
    setRsInlineText("");
    setRsInlineCins(new Set());
    rsInlineCinsRef.current = new Set();
    rsInlineUsedVoiceRef.current = false;
    rsInlineTypedRef.current = false;
    setRsCountdown(30);
    setRsInlineTypingMode(false);
    setRsInlineUndoStack([]);
  };

  const linkEntryToMarker = async (
    markerId: number | null,
    address: string,
    observation: string
  ) => {
    if (markerId == null || !address) return;
    const cm = customMarkersDataRef.current.find((m: any) => m.id === markerId);
    if (
      !cm ||
      cm.linkedIntelLabel ||
      ["house_outline", "house_filled"].includes(cm.markerIcon)
    )
      return;
    const short = entryMentionsAddress(address, observation);
    if (!short) return;
    try {
      const fresh = await refetchLocations();
      const locs = (fresh.data ?? []) as IntelMapLocation[];
      const target =
        locs.find(l => addressesMatch(l.label, address)) ??
        locs.find(l => samePlace(l.label, short));
      if (!target) return;
      await updateCustomMarkerMut.mutateAsync({
        id: markerId,
        linkedIntelLabel: target.label,
      });
      await refetchCustomMarkers();
      mergedIntelRef.current.clear();
      renderLocations(locs);
    } catch {
      // Leave the entry and the pin as they are; the marker can still be
      // merged by hand from its popup.
    }
  };

  // An entry made from a custom marker's RS Quick Entry stays on that marker:
  // once it is saved, the marker is linked to the address's location (the same
  // link as the marker popup's Merge…, so Un-merge still works) and the
  // automatic pin for that address is not drawn alongside it. Only when the
  // entry actually mentions the marker's address, the marker has no link yet,
  // and it is not a house marker (those already absorb a pin within 40 m).
  // A place tapped on the map (a business, a bus stop, a station) is pinned
  // where it was tapped — not where its name geocodes to, which for a stop
  // named "Grange Dr After Gascoyne Wy" can be anywhere. Saved as the place's
  // position (the same record as dragging its pin), only when this entry
  // actually mentions the place and it has no position of its own yet.
  const pinAtTappedPlace = async (
    pos: { lat: number; lng: number } | null,
    address: string,
    observation: string,
    sign?: PlaceSignIcon | null
  ) => {
    if (!pos || !address) return;
    const shortLabel = popupShortAddress(address);
    if (!shortLabel) return;
    if (!observation.toLowerCase().includes(shortLabel.toLowerCase())) return;
    // The map looks a pin's saved position / icon up by the location's own
    // label ("La Lune, 73 George Street, EAST FREMANTLE"), not by the short
    // bracket name, so find that label among the locations the new row made.
    let label = shortLabel;
    try {
      const fresh = await refetchLocations();
      const locs = (fresh.data ?? []) as IntelMapLocation[];
      label =
        pinKeyForTappedPlace(
          locs.map(l => l.label),
          address
        ) ?? shortLabel;
    } catch {
      // Keep the short name, as before.
    }
    const existing = pinOverridesRef.current.get(label);
    const hasPos = existing?.lat != null && existing?.lng != null;
    // Google said it is a bank / pub / …, but the wording alone would not
    // have made it one: keep the sign with the pin (never over an icon the
    // officer chose).
    const wantSign =
      !!sign && !existing?.markerIcon && signIconOf(label) !== sign;
    if (hasPos && !wantSign) return;
    savePinOverrideMut.mutate({
      label,
      ...(hasPos ? {} : { lat: pos.lat, lng: pos.lng }),
      ...(wantSign ? { markerIcon: sign } : {}),
    });
  };

  const addQuickRsEntry = (
    observation: string,
    cinsToAttach?: Set<string> | null,
    timeOverride?: string | null,
    rowDateOverride?: string | null,
    viaVoice?: boolean
  ) => {
    if (!rsSelectedSheetId) return;
    let timeStr: string;
    let totalMins: number;
    if (timeOverride) {
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
        const now = new Date();
        const h24 = now.getHours();
        const min = now.getMinutes();
        totalMins = h24 * 60 + min;
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
      }
    } else {
      const now = new Date();
      const h24 = now.getHours();
      const min = now.getMinutes();
      totalMins = h24 * 60 + min;
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
    }
    setRsAddingRow(true);
    // Store the CINs in a local variable captured by the mutation callback
    const cins = cinsToAttach ? Array.from(cinsToAttach) : [];
    // The marker this entry was opened from, captured now — the entry sheet
    // closing clears the ref before the save completes.
    const linkMarkerId = mapQeMarkerIdRef.current;
    const linkAddress = mapQeAddress;
    const tappedPos = mapQePoiPosRef.current;
    const tappedSign = mapQePoiSignRef.current;
    rsCreateRow.mutate(
      {
        sheetId: rsSelectedSheetId,
        time: timeStr,
        timeMinutes: totalMins,
        observation,
        rowDate: rowDateOverride ?? undefined,
        viaVoice: viaVoice || undefined,
      },
      {
        onSuccess: (data, vars) => {
          // The row's own recorded time, not the wall-clock time the save
          // happened to complete at — those can genuinely differ (a manual
          // time override, or just submit lag), and "Last Entry" is meant
          // to confirm what got written to the record, not when the tap
          // landed.
          setRsLastEntry({
            id: (data as any)?.id,
            label: vars.observation ?? "Entry",
            time: vars.time ?? timeStr,
          });
          setRsEditingLastEntry(false);
          setRsAddingRow(false);
          // Attach all selected CINs — use the locally captured variable, not the ref
          if (cins.length > 0 && (data as any)?.id) {
            for (const cin of cins) {
              rsAddMember.mutate({ rowId: (data as any).id, memberName: cin });
            }
          }
          toast.success("RS entry added");
          // Refetch intel pins so any new address in this observation appears on the map
          void refetchLocations();
          // Keep the entry on the custom marker it was made from.
          void linkEntryToMarker(linkMarkerId, linkAddress, observation);
          // A place tapped on the map goes exactly where it was tapped.
          void pinAtTappedPlace(
            tappedPos,
            linkAddress,
            observation,
            tappedSign
          );
          // Refetch entity chips so a newly-mentioned entity shows up as a chip immediately
          if (rsSelectedSheetId) {
            void utils.row.entityChips.invalidate({
              sheetId: rsSelectedSheetId,
            });
            // Refetch pending vehicle depart/arrive chips so a chip that
            // was just used (e.g. this row logged the vehicle arriving)
            // disappears immediately rather than staying offered again.
            void utils.row.pendingVehicleDepartures.invalidate({
              sheetId: rsSelectedSheetId,
            });
            void utils.row.pendingVehicleArrivals.invalidate({
              sheetId: rsSelectedSheetId,
            });
            void utils.row.pendingWalkIns.invalidate({
              sheetId: rsSelectedSheetId,
            });
            void utils.row.pendingHeadingTo.invalidate({
              sheetId: rsSelectedSheetId,
            });
            void utils.row.pendingPlacements.invalidate({
              sheetId: rsSelectedSheetId,
            });
            void utils.row.surveillanceState.invalidate({
              sheetId: rsSelectedSheetId,
            });
          }
        },
        onError: e => {
          setRsAddingRow(false);
          toast.error(e.message);
        },
      }
    );
  };

  // Same save-time checks as SheetDetail's updateRowWithDupeCheck, run
  // before the row actually gets created — RS Quick Entry from the map is
  // a second entry point into row.create and was skipping both prompts
  // entirely. Only fires with meaningful observation text and a selected
  // sheet; on any check failure, falls through to a normal save rather
  // than blocking the officer's entry.
  const addQuickRsEntryWithChecks = async (
    observation: string,
    cinsToAttach?: Set<string> | null,
    timeOverride?: string | null,
    rowDateOverride?: string | null,
    viaVoice?: boolean
  ) => {
    if (!rsSelectedSheetId || !observation.trim()) {
      addQuickRsEntry(
        observation,
        cinsToAttach,
        timeOverride,
        rowDateOverride,
        viaVoice
      );
      return;
    }

    const queue: QeDupe[] = [];
    try {
      const missingLocation = await utils.row.checkMissingLocation.fetch({
        sheetId: rsSelectedSheetId,
        observation,
      });
      if (missingLocation) {
        queue.push({
          kind: "missingLocation",
          location: missingLocation.location,
          source: missingLocation.source,
        });
      }
    } catch (err) {
      console.warn("checkMissingLocation failed", err);
    }
    try {
      const vagueVehicle = await utils.row.checkVagueVehicleMatch.fetch({
        sheetId: rsSelectedSheetId,
        observation,
      });
      if (vagueVehicle) {
        queue.push({
          kind: "vagueVehicle",
          loserLabel: vagueVehicle.loserLabel,
          winnerLabel: vagueVehicle.winnerLabel,
          reason: vagueVehicle.reason,
        });
      }
    } catch (err) {
      console.warn("checkVagueVehicleMatch failed", err);
    }

    if (queue.length === 0) {
      addQuickRsEntry(
        observation,
        cinsToAttach,
        timeOverride,
        rowDateOverride,
        viaVoice
      );
      return;
    }
    qePendingEntryRef.current = {
      observation,
      cinsToAttach: cinsToAttach ?? null,
      timeOverride: timeOverride ?? null,
      rowDateOverride: rowDateOverride ?? null,
      viaVoice: viaVoice ?? false,
    };
    setQeDupeQueue(queue);
    setQeDupeIndex(0);
    setQeDupeDialogOpen(true);
  };

  return {
    teamRows,
    unassignedLiveUsers,
    toggleTeamVisibility,
    toggleUserVisibility,
    toggleUserTrace,
    setTrackAll,
    closeInlineField,
    addQuickRsEntry,
    addQuickRsEntryWithChecks,
  };
}

export type MapPinsState = ReturnType<typeof useMapPins>;
