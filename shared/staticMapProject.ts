// Where a latitude/longitude lands on a map picture, for drawing the Visual RS
// pins, vehicle markers and flag over a plain map or satellite picture. Pure
// Web Mercator maths, the same projection Google Static Maps and Nearmap WMS
// (EPSG:3857) both use, so one overlay fits either picture.

export interface LatLng {
  lat: number;
  lng: number;
}

/** What a picture shows: its centre, the Google zoom level, and its size in
 * CSS pixels (a scale-2 image has twice the pixels but the same view). */
export interface PictureView {
  center: LatLng;
  zoom: number;
  width: number;
  height: number;
}

const TILE = 256;
const EARTH_RADIUS_M = 6378137;

const worldSize = (zoom: number) => TILE * Math.pow(2, zoom);
const lngToX = (lng: number, zoom: number) =>
  ((lng + 180) / 360) * worldSize(zoom);
function latToY(lat: number, zoom: number): number {
  const s = Math.min(
    Math.max(Math.sin((lat * Math.PI) / 180), -0.9999),
    0.9999
  );
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(zoom);
}

/** Pixel position of `point` in a picture of `view` (0,0 = top left). */
export function projectToPicture(
  point: LatLng,
  view: PictureView
): { x: number; y: number } {
  return {
    x:
      lngToX(point.lng, view.zoom) -
      lngToX(view.center.lng, view.zoom) +
      view.width / 2,
    y:
      latToY(point.lat, view.zoom) -
      latToY(view.center.lat, view.zoom) +
      view.height / 2,
  };
}

/** Whether `point` is inside the picture (with `margin` pixels to spare). */
export function inPicture(
  point: LatLng,
  view: PictureView,
  margin = 0
): boolean {
  const p = projectToPicture(point, view);
  return (
    p.x >= margin &&
    p.y >= margin &&
    p.x <= view.width - margin &&
    p.y <= view.height - margin
  );
}

/** The highest zoom (up to `maxZoom`) at which every point still fits inside
 * the picture with `padding` pixels to spare; `maxZoom` for a single point. */
export function chooseZoom(
  points: LatLng[],
  size: { width: number; height: number },
  opts: { minZoom?: number; maxZoom?: number; padding?: number } = {}
): number {
  const minZoom = opts.minZoom ?? 12;
  const maxZoom = opts.maxZoom ?? 18;
  const padding = opts.padding ?? 40;
  if (points.length < 2) return maxZoom;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  for (let z = maxZoom; z > minZoom; z--) {
    const view = { center, zoom: z, ...size };
    if (points.every(p => inPicture(p, view, padding))) return z;
  }
  return minZoom;
}

/** The picture's edges in EPSG:3857 metres — what a WMS GetMap asks for. */
export function webMercatorBBox(view: PictureView): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const cx = (view.center.lng * Math.PI * EARTH_RADIUS_M) / 180;
  const cy =
    Math.log(Math.tan(Math.PI / 4 + (view.center.lat * Math.PI) / 360)) *
    EARTH_RADIUS_M;
  const metresPerPixel = (2 * Math.PI * EARTH_RADIUS_M) / worldSize(view.zoom);
  const halfW = (view.width / 2) * metresPerPixel;
  const halfH = (view.height / 2) * metresPerPixel;
  return {
    minX: cx - halfW,
    minY: cy - halfH,
    maxX: cx + halfW,
    maxY: cy + halfH,
  };
}
