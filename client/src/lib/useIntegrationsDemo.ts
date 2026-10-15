/**
 * State for the integrations DEMO on the Map page (shared/integrationDemo.ts
 * is the made-up scenario). Held in one place so the right-hand pane, the map
 * overlays, the time bar and the camera picture-in-picture all agree. Nothing
 * here is saved anywhere — it lives only while the page is open.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEMO_CAMERAS,
  DEMO_MINUTES,
  DEMO_STEP,
  demoPingsForSlot,
  demoSurname,
  newestPing,
  type CameraType,
  type DemoCamera,
  type DemoPing,
} from "@shared/integrationDemo";

export interface DemoTargetPick {
  id: number;
  name: string;
}

export type DemoSelection =
  | { kind: "ping"; id: string }
  | { kind: "trk"; id: string }
  | { kind: "cam"; id: string }
  | null;

export interface DemoDraft {
  id: number;
  time: string;
  text: string;
}

export interface ShownPing {
  ping: DemoPing;
  surname: string;
}

function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter(v => v !== value)
    : [...list, value];
}

export function useIntegrationsDemo() {
  const [time, setTimeRaw] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [telOn, setTelOn] = useState(false);
  const [telOpId, setTelOpId] = useState<number | null>(null);
  const [telTargets, setTelTargets] = useState<DemoTargetPick[]>([]);

  const [trkOn, setTrkOn] = useState(false);
  const [trkOpId, setTrkOpId] = useState<number | null>(null);
  const [trkIds, setTrkIds] = useState<string[]>([]);

  const [camOn, setCamOn] = useState(false);
  const [camMode, setCamMode] = useState<1 | 2>(1);
  const [camType, setCamType] = useState<CameraType>("Clay");
  const [camIds, setCamIds] = useState<string[]>([]);
  const [camOpId, setCamOpId] = useState<number | null>(null);
  const [camLocs, setCamLocs] = useState<string[]>([]);

  const [pipOpen, setPipOpen] = useState(false);
  const [pipCamId, setPipCamId] = useState<string | null>(null);
  const [sel, setSel] = useState<DemoSelection>(null);
  const [drafts, setDrafts] = useState<DemoDraft[]>([]);

  const setTime = useCallback((t: number) => {
    setTimeRaw(Math.max(0, Math.min(DEMO_MINUTES, t)));
  }, []);

  // Play: the demo clock runs forward and stops at the end.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setTimeRaw(t => {
        const next = Math.min(DEMO_MINUTES, t + DEMO_STEP);
        if (next >= DEMO_MINUTES) setPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing]);

  const togglePlay = useCallback(() => {
    if (!playing) setTimeRaw(t => (t >= DEMO_MINUTES ? 0 : t));
    setPlaying(!playing);
  }, [playing]);

  const toggleTelTarget = useCallback((t: DemoTargetPick) => {
    setTelTargets(list =>
      list.some(x => x.id === t.id)
        ? list.filter(x => x.id !== t.id)
        : [...list, t]
    );
  }, []);
  const changeTelOp = useCallback((id: number | null) => {
    setTelOpId(id);
    setTelTargets([]);
  }, []);

  const openPip = useCallback((camId: string) => {
    setPipCamId(camId);
    setPipOpen(true);
  }, []);
  const closePip = useCallback(() => setPipOpen(false), []);

  const toggleTrk = useCallback(
    (id: string) => setTrkIds(l => toggled(l, id)),
    []
  );
  // Ticking a camera opens its live view in the picture-in-picture.
  const toggleCam = useCallback(
    (id: string) => {
      if (!camIds.includes(id)) openPip(id);
      setCamIds(toggled(camIds, id));
    },
    [camIds, openPip]
  );
  const toggleCamLoc = useCallback(
    (label: string) => {
      if (!camLocs.includes(label)) {
        const cam = DEMO_CAMERAS.find(c => c.locationLabel === label);
        if (cam) openPip(cam.id);
      }
      setCamLocs(toggled(camLocs, label));
    },
    [camLocs, openPip]
  );

  const addDraft = useCallback((clock: string, text: string) => {
    setDrafts(list =>
      list.some(d => d.text === text)
        ? list
        : [...list, { id: Date.now() + list.length, time: clock, text }]
    );
  }, []);
  const clearDrafts = useCallback(() => setDrafts([]), []);

  // The cameras currently ticked, by whichever way of finding them is showing.
  const visibleCameras: DemoCamera[] = useMemo(() => {
    if (!camOn) return [];
    return camMode === 1
      ? DEMO_CAMERAS.filter(c => camIds.includes(c.id))
      : DEMO_CAMERAS.filter(c => camLocs.includes(c.locationLabel));
  }, [camOn, camMode, camIds, camLocs]);

  // The newest ping so far for each ticked target.
  const shownPings: ShownPing[] = useMemo(() => {
    if (!telOn) return [];
    const out: ShownPing[] = [];
    telTargets.forEach((target, slot) => {
      const ping = newestPing(demoPingsForSlot(slot), time);
      if (ping) out.push({ ping, surname: demoSurname(target.name) });
    });
    return out;
  }, [telOn, telTargets, time]);

  const pipCamera =
    visibleCameras.find(c => c.id === pipCamId) ?? visibleCameras[0] ?? null;

  return {
    time,
    setTime,
    playing,
    togglePlay,
    anyOn: telOn || trkOn || camOn,
    telOn,
    setTelOn,
    telOpId,
    changeTelOp,
    telTargets,
    toggleTelTarget,
    trkOn,
    setTrkOn,
    trkOpId,
    setTrkOpId,
    trkIds,
    toggleTrk,
    camOn,
    setCamOn,
    camMode,
    setCamMode,
    camType,
    setCamType,
    camIds,
    toggleCam,
    camOpId,
    setCamOpId,
    camLocs,
    toggleCamLoc,
    visibleCameras,
    shownPings,
    pipOpen: pipOpen && visibleCameras.length > 0,
    pipCamera,
    openPip,
    closePip,
    setPipCamId,
    sel,
    setSel,
    drafts,
    addDraft,
    clearDrafts,
  };
}

export type IntegrationsDemo = ReturnType<typeof useIntegrationsDemo>;
