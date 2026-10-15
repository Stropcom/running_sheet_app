/**
 * The integrations DEMO: a made-up scenario for the Map page that shows how
 * Milestone cameras, vehicle/item trackers and JSI 4Sight telephone pings
 * could sit on the map. Everything here is invented and fixed — nothing is
 * read from, or sent to, any real system, and nothing is stored. It is
 * deterministic (the same scenario every time), so it is testable and
 * reproducible.
 *
 * The scenario runs on its own demo clock (minutes after 09:00, 0–40) and
 * sits in a fixed area of Perth. The real operation and target a person picks
 * only decides whose SURNAME is written on the pings.
 *
 * Phone pings: CAD = a wedge from the cell site ("pizza slice"); LBS and SEEK
 * = an arc (a curved band) around the cell site. The cell site is the point
 * of the wedge, or the centre the arc is drawn around.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Demo clock: minutes after 09:00. */
export const DEMO_MINUTES = 40;
export const DEMO_STEP = 0.25;

/** A made-up registration, so a sample never looks like a real vehicle. */
export const DEMO_REGO = "1DEM001";

/** [lat, lng] of the demo area's corners, for "Go to sample area". */
export const DEMO_BOUNDS = {
  south: -32.07,
  west: 115.745,
  north: -31.98,
  east: 115.9,
};

/** "09:27" (or "09:27:15" with seconds) for a demo-clock time. */
export function demoClock(t: number, withSeconds = false): string {
  const total = 9 * 3600 + Math.floor(t * 60 + 1e-6);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return withSeconds ? `${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}`;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export interface RoutePoint extends LatLng {
  /** Demo-clock minutes the tracker is here. */
  t: number;
}

const r = (lat: number, lng: number, t: number): RoutePoint => ({
  lat,
  lng,
  t,
});

/** The vehicle: parked, then along Stirling Highway and Karel Avenue to a
 * cul-de-sac (parked 27–29¼), then Leach Highway to the shopping centre. */
export const DEMO_VEHICLE_ROUTE: RoutePoint[] = [
  r(-31.9937, 115.7527, 0),
  r(-31.9937, 115.7527, 1.5),
  r(-31.996, 115.762, 3.5),
  r(-31.999, 115.77, 6),
  r(-31.9995, 115.785, 9),
  r(-31.9985, 115.8, 12),
  r(-31.9995, 115.815, 14.5),
  r(-32.0001, 115.83, 17),
  r(-32.005, 115.838, 18.5),
  r(-32.012, 115.844, 20.5),
  r(-32.02, 115.85, 23),
  r(-32.029, 115.8512, 25),
  r(-32.0378, 115.852, 27),
  r(-32.0378, 115.852, 29.25),
  r(-32.042, 115.86, 30.2),
  r(-32.048, 115.87, 31),
  r(-32.0505, 115.877, 33),
  r(-32.0522, 115.8826, 35),
  r(-32.0522, 115.8826, DEMO_MINUTES),
];

/** An item (a box) left where the vehicle parks, then carried along with it. */
export const DEMO_BOX_ROUTE: RoutePoint[] = [
  r(-32.0378, 115.852, 0),
  r(-32.0378, 115.852, 29.25),
  r(-32.042, 115.86, 30.2),
  r(-32.048, 115.87, 31),
  r(-32.0505, 115.877, 33),
  r(-32.0522, 115.8826, 35),
  r(-32.0522, 115.8826, DEMO_MINUTES),
];

export const DEMO_CRATE_ROUTE: RoutePoint[] = [
  r(-32.06, 115.81, 0),
  r(-32.06, 115.81, DEMO_MINUTES),
];

/** Where along a route something is at demo time `t`. */
export function routePositionAt(route: RoutePoint[], t: number): LatLng {
  const first = route[0];
  if (t <= first.t) return { lat: first.lat, lng: first.lng };
  for (let i = 1; i < route.length; i++) {
    if (t <= route[i].t) {
      const a = route[i - 1];
      const b = route[i];
      const f = (t - a.t) / (b.t - a.t || 1);
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
      };
    }
  }
  const last = route[route.length - 1];
  return { lat: last.lat, lng: last.lng };
}

/** The part of a route already travelled at `t`, ending at the current spot. */
export function routeTrailAt(route: RoutePoint[], t: number): LatLng[] {
  const trail: LatLng[] = route
    .filter(p => p.t < t)
    .map(p => ({ lat: p.lat, lng: p.lng }));
  if (trail.length > 0) trail.push(routePositionAt(route, t));
  return trail;
}

export function metresBetween(a: LatLng, b: LatLng): number {
  const dy = (b.lat - a.lat) * 111320;
  const dx = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Bearing (0 = north, clockwise) and distance in metres from a to b. */
export function bearingAndDistance(
  a: LatLng,
  b: LatLng
): { bearing: number; distance: number } {
  const dy = (b.lat - a.lat) * 111320;
  const dx = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return {
    bearing: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
    distance: Math.hypot(dx, dy),
  };
}

/** Speed in km/h over the minute around `t`. */
export function routeSpeedKmh(route: RoutePoint[], t: number): number {
  const a = routePositionAt(route, t - 0.5);
  const b = routePositionAt(route, t + 0.5);
  return Math.round((metresBetween(a, b) / 60) * 3.6);
}

/** A point `distance` metres from `from` along `bearing` degrees. */
export function destination(
  from: LatLng,
  bearing: number,
  distance: number
): LatLng {
  const rad = (bearing * Math.PI) / 180;
  return {
    lat: from.lat + (distance * Math.cos(rad)) / 111320,
    lng:
      from.lng +
      (distance * Math.sin(rad)) /
        (111320 * Math.cos((from.lat * Math.PI) / 180)),
  };
}

// ─── Trackers ────────────────────────────────────────────────────────────────

export interface DemoTracker {
  id: string;
  kind: "vehicle" | "item";
  /** What is written on the map: the rego, or the item name. */
  label: string;
  /** A fuller description for the details card. */
  name: string;
  route: RoutePoint[];
}

export const DEMO_TRACKERS: DemoTracker[] = [
  {
    id: "T-014",
    kind: "vehicle",
    label: DEMO_REGO,
    name: "white Lexus NX350h station sedan",
    route: DEMO_VEHICLE_ROUTE,
  },
  {
    id: "T-021",
    kind: "item",
    label: "Black box",
    name: "Black box",
    route: DEMO_BOX_ROUTE,
  },
  {
    id: "T-030",
    kind: "item",
    label: "Grey crate",
    name: "Grey crate",
    route: DEMO_CRATE_ROUTE,
  },
];

export function demoTracker(id: string): DemoTracker | undefined {
  return DEMO_TRACKERS.find(t => t.id === id);
}

/** What a draft running-sheet row says for a tracker report. */
export function trackerRowText(tracker: DemoTracker, t: number): string {
  return tracker.kind === "vehicle"
    ? `Vehicle tracker ${tracker.id} (${tracker.label}) reported at ${demoClock(t)}.`
    : `Item tracker ${tracker.id} (${tracker.name.toLowerCase()}) reported at ${demoClock(t)}.`;
}

// ─── Phone pings (4Sight) ────────────────────────────────────────────────────

export type PingType = "CAD" | "LBS" | "SEEK";

export interface DemoPing {
  id: string;
  /** Which target slot (0 = the one who travels with the vehicle). */
  slot: number;
  at: number;
  type: PingType;
  kind: string;
  duration: string;
  tower: LatLng;
  bearing: number;
  /** Half the width of the wedge/arc, in degrees. */
  half: number;
  /** Metres from the cell site: 0 for a wedge, the inner edge for an arc. */
  innerM: number;
  outerM: number;
}

interface PingSpec {
  at: number;
  type: PingType;
  kind: string;
  duration: string;
  tower: LatLng;
  /** Aim at the vehicle at this time, or use a fixed bearing/distance. */
  aim?: boolean;
  bearing?: number;
  distance?: number;
}

const FOLLOW_SPECS: PingSpec[] = [
  {
    at: 5,
    type: "CAD",
    kind: "Outgoing call",
    duration: "2 min 10 s",
    tower: { lat: -31.98, lng: 115.748 },
    aim: true,
  },
  {
    at: 21,
    type: "LBS",
    kind: "Location request",
    duration: "",
    tower: { lat: -31.985, lng: 115.8 },
    aim: true,
  },
  {
    at: 27,
    type: "CAD",
    kind: "Incoming call",
    duration: "46 s",
    tower: { lat: -32.01, lng: 115.8 },
    aim: true,
  },
  {
    at: 33,
    type: "SEEK",
    kind: "Location request",
    duration: "",
    tower: { lat: -32.02, lng: 115.915 },
    aim: true,
  },
];

const FIXED_SPECS: PingSpec[] = [
  {
    at: 14,
    type: "CAD",
    kind: "Text sent",
    duration: "",
    tower: { lat: -32.062, lng: 115.805 },
    bearing: 18,
    distance: 4200,
  },
  {
    at: 31,
    type: "LBS",
    kind: "Location request",
    duration: "",
    tower: { lat: -32.04, lng: 115.79 },
    bearing: 70,
    distance: 3600,
  },
];

function buildPing(
  spec: PingSpec,
  slot: number,
  index: number,
  shift: LatLng
): DemoPing {
  const tower = {
    lat: spec.tower.lat + shift.lat,
    lng: spec.tower.lng + shift.lng,
  };
  let bearing = spec.bearing ?? 0;
  let distance = spec.distance ?? 3000;
  if (spec.aim) {
    const g = bearingAndDistance(
      tower,
      routePositionAt(DEMO_VEHICLE_ROUTE, spec.at)
    );
    bearing = g.bearing;
    distance = g.distance;
  }
  const arc = spec.type !== "CAD";
  return {
    id: `P${slot}-${index}`,
    slot,
    at: spec.at,
    type: spec.type,
    kind: spec.kind,
    duration: spec.duration,
    tower,
    bearing,
    half: arc ? 24 : 34,
    innerM: arc ? Math.max(100, distance - 800) : 0,
    outerM: arc ? distance + 900 : distance * 1.35,
  };
}

/** The made-up pings for the nth chosen target: the first travels with the
 * vehicle; later ones sit elsewhere, each shifted so they do not overlap. */
export function demoPingsForSlot(slot: number): DemoPing[] {
  if (slot === 0)
    return FOLLOW_SPECS.map((s, i) => buildPing(s, 0, i, { lat: 0, lng: 0 }));
  const shift = { lat: 0, lng: 0.03 * (slot - 1) };
  return FIXED_SPECS.map((s, i) => buildPing(s, slot, i, shift));
}

/** Only the newest ping so far is shown; when a new one arrives the old one goes. */
export function newestPing(pings: DemoPing[], t: number): DemoPing | null {
  let best: DemoPing | null = null;
  for (const p of pings) if (p.at <= t && (!best || p.at > best.at)) best = p;
  return best;
}

/** Outline of a wedge (innerM = 0) or an arc band, as lat/lng points. */
export function sectorPath(
  ping: Pick<DemoPing, "tower" | "bearing" | "half" | "innerM" | "outerM">,
  steps = 24
): LatLng[] {
  const { tower, bearing, half, innerM, outerM } = ping;
  const outer: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    outer.push(
      destination(tower, bearing - half + (2 * half * i) / steps, outerM)
    );
  }
  if (innerM <= 0) return [tower, ...outer];
  const inner: LatLng[] = [];
  for (let i = steps; i >= 0; i--) {
    inner.push(
      destination(tower, bearing - half + (2 * half * i) / steps, innerM)
    );
  }
  return [...outer, ...inner];
}

/** A target's SURNAME for the ping label: the last all-capitals word of the
 * name (registry names are written "Given Names SURNAME"), else the last word. */
export function demoSurname(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, " ")
    .split(/\s+/)
    .map(w => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ""))
    .filter(Boolean);
  for (let i = words.length - 1; i >= 0; i--) {
    if (
      words[i].length >= 2 &&
      words[i] === words[i].toUpperCase() &&
      /[A-Z]/.test(words[i])
    )
      return words[i];
  }
  return (words[words.length - 1] ?? name).toUpperCase();
}

/** "MERCER 09:27" — what is written at the cell site. */
export function pingLabel(surname: string, ping: Pick<DemoPing, "at">): string {
  return `${surname} ${demoClock(ping.at)}`;
}

// ─── Cameras (Milestone) ─────────────────────────────────────────────────────

export type CameraType = "Clay" | "T-Box";

export interface CameraEvent {
  t: number;
  text: string;
}

/** Something that moves across the picture: x runs 0..1; null = not in view. */
export interface MotionTrack {
  init: number | null;
  segs: { a: number; b: number; x0: number; x1: number; hide?: boolean }[];
}

export interface DemoCamera {
  id: string;
  name: string;
  type: CameraType;
  kind: "Residence" | "Business";
  /** The address it is fixed to (street types written in full). */
  address: string;
  /** "Location" in the Operation, location list. */
  locationLabel: string;
  sign?: string;
  position: LatLng;
  events: CameraEvent[];
  car: MotionTrack;
  person: MotionTrack;
}

export const DEMO_CAMERAS: DemoCamera[] = [
  {
    id: "C1",
    name: "Clay 1",
    type: "Clay",
    kind: "Residence",
    address: "7 Banksia Court, BRENTWOOD",
    locationLabel: "7 Banksia Court, BRENTWOOD",
    position: { lat: -32.0382, lng: 115.8524 },
    events: [
      { t: 27, text: `Vehicle ${DEMO_REGO} arrives and parks at the front.` },
      { t: 27.25, text: "Person 1 gets out and walks to the front door." },
      { t: 27.75, text: "Person 1 enters the house." },
      { t: 28.5, text: "Person 1 leaves the house and walks to the vehicle." },
      { t: 29, text: `Person 1 gets into Vehicle ${DEMO_REGO}.` },
      { t: 29.25, text: `Vehicle ${DEMO_REGO} departs, heading south.` },
    ],
    car: {
      init: null,
      segs: [
        { a: 26.5, b: 27, x0: -0.15, x1: 0.45 },
        { a: 29.25, b: 29.9, x0: 0.45, x1: 1.15, hide: true },
      ],
    },
    person: {
      init: null,
      segs: [
        { a: 27.25, b: 27.75, x0: 0.45, x1: 0.8, hide: true },
        { a: 28.5, b: 29, x0: 0.8, x1: 0.45, hide: true },
      ],
    },
  },
  {
    id: "C2",
    name: "T-Box 1",
    type: "T-Box",
    kind: "Business",
    address: "45 Burrendah Boulevard, WILLETON",
    locationLabel: "45 Burrendah Boulevard, WILLETON",
    sign: "SOUTHLANDS",
    position: { lat: -32.0535, lng: 115.8832 },
    events: [
      {
        t: 35,
        text: `Vehicle ${DEMO_REGO} arrives and parks at the entrance.`,
      },
      { t: 35.5, text: "Person 1 gets out and walks to the entrance." },
      { t: 36.25, text: "Person 1 enters the building." },
    ],
    car: { init: null, segs: [{ a: 34.5, b: 35, x0: -0.15, x1: 0.4 }] },
    person: {
      init: null,
      segs: [{ a: 35.5, b: 36.25, x0: 0.4, x1: 0.75, hide: true }],
    },
  },
];

export function demoCamera(id: string): DemoCamera | undefined {
  return DEMO_CAMERAS.find(c => c.id === id);
}

/** Where a car or person is across the camera's picture at `t` (null = out of view). */
export function motionX(track: MotionTrack, t: number): number | null {
  let x = track.init;
  for (const g of track.segs) {
    if (t >= g.a) {
      if (t < g.b) x = g.x0 + ((g.x1 - g.x0) * (t - g.a)) / (g.b - g.a);
      else x = g.hide ? null : g.x1;
    }
  }
  return x;
}

/** The camera glows on the map for a minute after each of its events. */
export function cameraIsLive(cam: DemoCamera, t: number): boolean {
  return cam.events.some(e => t >= e.t && t < e.t + 1);
}

/** What a draft running-sheet row says for a camera event. */
export function cameraRowText(cam: DemoCamera, event: CameraEvent): string {
  return `Milestone camera ${cam.name}, ${cam.address}: ${event.text}`;
}
