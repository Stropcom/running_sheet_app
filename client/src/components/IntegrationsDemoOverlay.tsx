/// <reference types="@types/google.maps" />
/**
 * Draws the integrations DEMO on the Map page: phone-ping wedges and arcs with
 * a dot at the cell site and a "SURNAME time" card, tracker trails and
 * markers (a vehicle by rego, an item by name), and Milestone camera pins.
 * Made-up data only (shared/integrationDemo.ts); nothing is saved.
 *
 * Shapes are google.maps.Polygon/Polyline and the pins are DivIconOverlay, so
 * nothing here extends a google.maps class at module scope (see
 * lib/divIconOverlay.ts for why that must never happen).
 */
import { useEffect, useRef } from "react";
import {
  cameraIsLive,
  demoTracker,
  pingLabel,
  routePositionAt,
  routeTrailAt,
  sectorPath,
} from "@shared/integrationDemo";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import type { IntegrationsDemo } from "@/lib/useIntegrationsDemo";

const SKY = "#0284c7";
const ARC = "#7e22ce";
const TRK = "#e11d48";
const CAM = "#0d9488";

function pill(text: string, colour: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `background:#fff;border:2px solid ${colour};border-radius:6px;padding:1px 6px;font:700 11px system-ui,sans-serif;color:#1b2333;white-space:nowrap;line-height:16px;box-shadow:0 1px 3px rgba(0,0,0,.25);`;
  el.textContent = text;
  return el;
}

/** A small column: the card above (or below) a round marker. */
function stack(
  card: HTMLElement,
  marker: HTMLElement,
  cardAbove: boolean
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;";
  if (cardAbove) {
    wrap.appendChild(card);
    wrap.appendChild(marker);
  } else {
    wrap.appendChild(marker);
    wrap.appendChild(card);
  }
  return wrap;
}

function dot(colour: string): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid ${colour};box-shadow:0 1px 3px rgba(0,0,0,.3);position:relative;`;
  const c = document.createElement("div");
  c.style.cssText = `position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:${colour};`;
  el.appendChild(c);
  return el;
}

const CAMERA_GLYPH =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fff" aria-hidden="true"><rect x="1" y="4" width="9" height="8" rx="1.5"/><path d="M11 7.2 15 4.5v7L11 8.8z"/></svg>';
const BOX_GLYPH =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fff" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5"/><rect x="2" y="7" width="12" height="1.6" fill="#e11d48"/></svg>';
const ARROW_GLYPH =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="#fff" aria-hidden="true"><path d="M8 2 13 13H3z"/></svg>';

function round(colour: string, glyph: string, square = false): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:26px;height:26px;border-radius:${square ? "7px" : "50%"};background:${colour};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;`;
  el.innerHTML = glyph; // fixed markup above, no user text
  return el;
}

export function IntegrationsDemoOverlay({
  map,
  demo,
}: {
  map: google.maps.Map | null;
  demo: IntegrationsDemo;
}) {
  const demoRef = useRef(demo);
  demoRef.current = demo;
  const trackerRefs = useRef<
    Map<string, { marker: DivIconOverlay; trail: google.maps.Polyline }>
  >(new Map());
  const cameraRefs = useRef<
    Map<string, { marker: DivIconOverlay; glow: HTMLElement }>
  >(new Map());

  // ── Phone pings: only each target's newest one is on the map ──
  const pingKey = demo.shownPings
    .map(s => `${s.ping.id}:${s.surname}`)
    .join("|");
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const polys: google.maps.Polygon[] = [];
    const pins: DivIconOverlay[] = [];
    for (const { ping, surname } of demoRef.current.shownPings) {
      const arc = ping.type !== "CAD";
      const colour = arc ? ARC : SKY;
      const poly = new google.maps.Polygon({
        map,
        paths: sectorPath(ping),
        fillColor: colour,
        fillOpacity: 0.3,
        strokeColor: colour,
        strokeWeight: 2,
        clickable: true,
        zIndex: 5,
      });
      poly.addListener("click", () =>
        demoRef.current.setSel({ kind: "ping", id: ping.id })
      );
      polys.push(poly);
      const pin = new DivIconOverlay({
        map,
        position: ping.tower,
        content: stack(
          pill(pingLabel(surname, ping), colour),
          dot(colour),
          true
        ),
        zIndex: 30,
      });
      pin.addListener("click", () =>
        demoRef.current.setSel({ kind: "ping", id: ping.id })
      );
      pins.push(pin);
    }
    return () => {
      polys.forEach(p => p.setMap(null));
      pins.forEach(p => {
        p.map = null;
      });
    };
  }, [map, pingKey]);

  // ── Trackers: created when ticked, moved as the demo clock runs ──
  const trkKey = demo.trkOn ? demo.trkIds.join("|") : "";
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const made = trackerRefs.current;
    for (const id of trkKey ? trkKey.split("|") : []) {
      const tk = demoTracker(id);
      if (!tk) continue;
      const trail = new google.maps.Polyline({
        map,
        path: [],
        strokeColor: TRK,
        strokeWeight: 4,
        strokeOpacity: 0.95,
        zIndex: 6,
      });
      const glyph = tk.kind === "vehicle" ? ARROW_GLYPH : BOX_GLYPH;
      const marker = new DivIconOverlay({
        map,
        position: routePositionAt(tk.route, demoRef.current.time),
        content: stack(
          pill(tk.label, TRK),
          round(TRK, glyph, tk.kind === "item"),
          true
        ),
        zIndex: 40,
      });
      marker.addListener("click", () =>
        demoRef.current.setSel({ kind: "trk", id: tk.id })
      );
      made.set(id, { marker, trail });
    }
    return () => {
      made.forEach(m => {
        m.trail.setMap(null);
        m.marker.map = null;
      });
      made.clear();
    };
  }, [map, trkKey]);
  useEffect(() => {
    trackerRefs.current.forEach((m, id) => {
      const tk = demoTracker(id);
      if (!tk) return;
      m.marker.position = routePositionAt(tk.route, demo.time);
      m.trail.setPath(routeTrailAt(tk.route, demo.time));
    });
  }, [demo.time, trkKey]);

  // ── Cameras ──
  const camKey = demo.visibleCameras.map(c => c.id).join("|");
  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const made = cameraRefs.current;
    for (const cam of demoRef.current.visibleCameras) {
      const icon = round(CAM, CAMERA_GLYPH);
      const glow = document.createElement("div");
      glow.style.cssText =
        "position:absolute;left:-9px;top:-9px;width:44px;height:44px;border-radius:50%;background:rgba(13,148,136,.28);display:none;pointer-events:none;";
      icon.style.position = "relative";
      icon.appendChild(glow);
      const marker = new DivIconOverlay({
        map,
        position: cam.position,
        content: stack(pill(cam.name, CAM), icon, false),
        zIndex: 35,
      });
      marker.addListener("click", () => {
        demoRef.current.setSel({ kind: "cam", id: cam.id });
        demoRef.current.openPip(cam.id);
      });
      made.set(cam.id, { marker, glow });
    }
    return () => {
      made.forEach(m => {
        m.marker.map = null;
      });
      made.clear();
    };
  }, [map, camKey]);
  useEffect(() => {
    demo.visibleCameras.forEach(cam => {
      const m = cameraRefs.current.get(cam.id);
      if (m)
        m.glow.style.display = cameraIsLive(cam, demo.time) ? "block" : "none";
    });
  }, [demo.time, demo.visibleCameras]);

  return null;
}

/** The three source colours, for the pane and time bar to match the map. */
export const DEMO_COLOURS = { tel: SKY, arc: ARC, trk: TRK, cam: CAM };
