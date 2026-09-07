import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { MapView } from "@/components/Map";
import { DivIconOverlay } from "@/lib/divIconOverlay";
import { Slider } from "@/components/ui/slider";
import {
  bulletTaperPath,
  computeHeadingRotation,
  getPaceTierFromKmh,
  pinTierClass,
  roundedPillPath,
  type PaceTier,
} from "@/lib/liveMarkerShape";

// Bench-only test page for the redesigned live-team marker: bullet-taper
// shape that rotates to heading (never upside-down, per the flip logic in
// liveMarkerShape.ts) with a 4-tier speed border glow. NOT wired into
// createUserPinElement / the real Intelligence Mapping live layer — this is
// deliberately isolated so the design can be driven and judged on a real
// map before touching the production pin.

const TEAM1_PINK = "#ec4899";
const BENCH_CENTER = { lat: -31.9523, lng: 115.8613 }; // Perth CBD

interface PinRefs {
  container: HTMLDivElement;
  pill: HTMLDivElement;
  svg: SVGSVGElement;
  path: SVGPathElement;
  width: number;
  height: number;
}

function createPinElement(cin: string): PinRefs {
  const container = document.createElement("div");
  container.style.cssText =
    "position:relative;display:flex;flex-direction:column;align-items:center;";

  const pill = document.createElement("div");
  // Slightly tighter padding/font than the current app pill (10px font,
  // 3/10/5/10 padding) — same idea, a touch smaller per the request.
  pill.style.cssText =
    "position:relative;display:inline-flex;align-items:center;justify-content:center;" +
    "padding:3px 9px 4px 9px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));";

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg") as SVGSVGElement;
  svg.setAttribute(
    "style",
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;"
  );
  const path = document.createElementNS(svgNS, "path") as SVGPathElement;
  path.setAttribute("fill", TEAM1_PINK);
  path.setAttribute("stroke", "rgba(255,255,255,0.6)");
  path.setAttribute("stroke-width", "1.5");
  svg.appendChild(path);

  const span = document.createElement("span");
  span.textContent = cin.toUpperCase();
  span.style.cssText =
    "position:relative;z-index:1;font-weight:800;font-size:9.5px;color:#fff;" +
    "white-space:nowrap;letter-spacing:0.03em;";

  pill.appendChild(svg);
  pill.appendChild(span);
  container.appendChild(pill);

  return { container, pill, svg, path, width: 0, height: 0 };
}

// Must run only after the pin is attached to the live DOM (via
// DivIconOverlay -> map), since it reads the pill's rendered pixel size to
// draw a geometrically exact shape — no CSS-stretch distortion regardless
// of how long the CIN text is.
function measurePin(pin: PinRefs) {
  pin.width = pin.pill.offsetWidth;
  pin.height = pin.pill.offsetHeight;
  pin.svg.setAttribute("viewBox", `0 0 ${pin.width} ${pin.height}`);
}

function applyPinState(pin: PinRefs, headingDeg: number, speedKmh: number) {
  const tier: PaceTier = getPaceTierFromKmh(speedKmh);
  const moving = tier !== "stopped";
  const { rotationDeg, flip } = moving
    ? computeHeadingRotation(headingDeg)
    : { rotationDeg: 0, flip: false };

  pin.path.setAttribute(
    "d",
    moving
      ? bulletTaperPath(pin.width, pin.height, flip)
      : roundedPillPath(pin.width, pin.height)
  );
  pin.pill.style.transform = moving ? `rotate(${rotationDeg}deg)` : "";
  pin.svg.setAttribute("class", pinTierClass(tier));
}

interface ComparisonMarker {
  cin: string;
  offset: { lat: number; lng: number };
  headingDeg: number;
  speedKmh: number;
  label: string;
}

const COMPARISON_MARKERS: ComparisonMarker[] = [
  {
    cin: "20871",
    offset: { lat: 0.0012, lng: -0.0015 },
    headingDeg: 0,
    speedKmh: 0,
    label: "Stopped",
  },
  {
    cin: "30456",
    offset: { lat: 0.0012, lng: 0.0015 },
    headingDeg: 45,
    speedKmh: 30,
    label: "Tier A — 30 km/h",
  },
  {
    cin: "40219",
    offset: { lat: -0.0012, lng: -0.0015 },
    headingDeg: 200,
    speedKmh: 65,
    label: "Tier B — 65 km/h",
  },
  {
    cin: "50733",
    offset: { lat: -0.0012, lng: 0.0015 },
    headingDeg: 300,
    speedKmh: 100,
    label: "Tier C — 100 km/h",
  },
];

export default function MarkerBenchPage() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const interactivePinRef = useRef<PinRefs | null>(null);
  const interactiveOverlayRef = useRef<DivIconOverlay | null>(null);

  const [headingDeg, setHeadingDeg] = useState(35);
  const [speedKmh, setSpeedKmh] = useState(30);

  // Create the interactive marker + the four static comparison markers once
  // the map is ready. Comparison markers are set once and never re-touched;
  // the interactive one is updated by the slider effect below.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const createdOverlays: DivIconOverlay[] = [];

    const interactivePin = createPinElement("10432");
    const interactiveOverlay = new DivIconOverlay({
      map,
      position: BENCH_CENTER,
      content: interactivePin.container,
      zIndex: 999,
    });
    measurePin(interactivePin);
    applyPinState(interactivePin, headingDeg, speedKmh);
    interactivePinRef.current = interactivePin;
    interactiveOverlayRef.current = interactiveOverlay;
    createdOverlays.push(interactiveOverlay);

    for (const m of COMPARISON_MARKERS) {
      const pin = createPinElement(m.cin);
      const overlay = new DivIconOverlay({
        map,
        position: {
          lat: BENCH_CENTER.lat + m.offset.lat,
          lng: BENCH_CENTER.lng + m.offset.lng,
        },
        content: pin.container,
        zIndex: 998,
        title: m.label,
      });
      measurePin(pin);
      applyPinState(pin, m.headingDeg, m.speedKmh);
      createdOverlays.push(overlay);
    }

    return () => {
      for (const overlay of createdOverlays) overlay.map = null;
      interactivePinRef.current = null;
      interactiveOverlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  // Slider changes only update the interactive marker's rotation/shape/tier
  // — its size never changes (same CIN text), so no re-measure needed.
  useEffect(() => {
    if (interactivePinRef.current) {
      applyPinState(interactivePinRef.current, headingDeg, speedKmh);
    }
  }, [headingDeg, speedKmh]);

  const tier = getPaceTierFromKmh(speedKmh);
  const tierLabel: Record<PaceTier, string> = {
    stopped: "Stopped — no glow",
    a: "Tier A — soft glow",
    b: "Tier B — crisp edge + halo",
    c: "Tier C — pulsing glow",
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            Marker Bench
            <span className="text-[10px] font-mono font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
              Bench — not wired into the live map
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Bullet-taper shape, heading rotation with the never-upside-down
            flip, and the 4-tier speed border glow — rendered as a real marker
            on a real map. The centre pin is driven by the controls below; the
            four corner pins are fixed reference states.
          </p>
        </div>

        <div className="relative rounded-lg overflow-hidden border border-border">
          <MapView
            className="h-[420px]"
            initialCenter={BENCH_CENTER}
            initialZoom={17}
            hideMapTypeControl
            onMapReady={map => {
              mapRef.current = map;
              setMapReady(true);
            }}
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-semibold uppercase tracking-wide text-muted-foreground">
                  Heading
                </label>
                <span className="text-xs font-mono">{headingDeg}°</span>
              </div>
              <Slider
                min={0}
                max={359}
                step={1}
                value={[headingDeg]}
                onValueChange={([v]) => setHeadingDeg(v)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-semibold uppercase tracking-wide text-muted-foreground">
                  Speed
                </label>
                <span className="text-xs font-mono">{speedKmh} km/h</span>
              </div>
              <Slider
                min={0}
                max={140}
                step={1}
                value={[speedKmh]}
                onValueChange={([v]) => setSpeedKmh(v)}
              />
            </div>
          </div>
          <div className="text-xs font-mono text-muted-foreground border-t border-border pt-3">
            Centre pin:{" "}
            <span className="text-foreground">{tierLabel[tier]}</span>
            {tier !== "stopped" && (
              <>
                {" "}
                &middot; rotation{" "}
                <span className="text-foreground">
                  {computeHeadingRotation(headingDeg).rotationDeg.toFixed(0)}°
                  {computeHeadingRotation(headingDeg).flip ? " (flipped)" : ""}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
