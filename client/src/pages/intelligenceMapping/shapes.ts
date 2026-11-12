// ── Map Shapes ─────────────────────────────────────────────────────────────────
// Transparent annotation shapes drawn on the map — see the mapShapes schema
// comment for the full picture. "sector" is the pizza-slice shape — Google
// Maps has no native overlay for one, so it's built as a Polygon from an arc
// of points (see sectorPolygonPath below), unlike circle/rectangle/line
// which map straight onto google.maps.Circle/Rectangle/Polyline.
export type ShapeType = "circle" | "rectangle" | "sector" | "line";

export const SHAPE_TYPE_LABELS: Record<ShapeType, string> = {
  circle: "Circle",
  rectangle: "Rectangle",
  sector: "Pizza Slice",
  line: "Line",
};

export const DEFAULT_SHAPE_RADIUS_M = 150;

export const DEFAULT_RECT_HALF_SIDE_M = 120;

/** Builds a Polyline's `icons` option for a "line" shape's dashed/arrow
 * styling. The Maps JS API has no native dashed-stroke option, so a dashed
 * look is done the standard way — an invisible (strokeOpacity 0) base
 * stroke with a small line symbol repeated along the path. A
 * direction-of-travel arrowhead is one forward-pointing symbol per segment
 * (not just one at the very end of the whole path) — an IconSequence's
 * offset is a percentage of the PATH's total length, not per-segment, so
 * each segment's end point needs its own cumulative-distance percentage
 * worked out via the geometry library, in a real-world multi-segment line
 * every leg shows its own direction rather than only the last one. Both
 * dashed and arrowEnd can be combined on the same Polyline. Returns
 * undefined (not an empty array) when neither is on, so callers can spread
 * this straight into Polyline options without an `icons: []` override
 * disturbing a plain solid line. */
export function renderLineIcons(
  path: { lat: number; lng: number }[],
  dashed: boolean,
  arrowEnd: boolean,
  color: string,
  opacity: number
): google.maps.IconSequence[] | undefined {
  if (!dashed && !arrowEnd) return undefined;
  const icons: google.maps.IconSequence[] = [];
  if (dashed) {
    icons.push({
      icon: {
        path: "M 0,-1 0,1",
        strokeOpacity: opacity,
        strokeColor: color,
        scale: 4,
      },
      offset: "0",
      repeat: "16px",
    });
  }
  if (arrowEnd && path.length >= 2) {
    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let i = 1; i < path.length; i++) {
      const d = google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(path[i - 1].lat, path[i - 1].lng),
        new google.maps.LatLng(path[i].lat, path[i].lng)
      );
      segmentLengths.push(d);
      totalLength += d;
    }
    if (totalLength > 0) {
      let cumulative = 0;
      for (const segmentLength of segmentLengths) {
        cumulative += segmentLength;
        icons.push({
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            strokeColor: color,
            fillColor: color,
            fillOpacity: opacity,
            scale: 4,
          },
          offset: `${(cumulative / totalLength) * 100}%`,
        });
      }
    }
  }
  return icons;
}

/** Builds the point path for a circular sector ("pizza slice") — a Polygon
 * fan from the center out to an arc of points between startAngle and
 * endAngle (degrees, 0 = North, clockwise, same convention as marker
 * rotation) and back. Google Maps has no native sector overlay, so this is
 * the one shape type that has to be hand-built rather than using a stock
 * Circle/Rectangle/Polyline. Walks the arc in ~6° steps — fine enough to
 * look round at any radius this feature is used at (tens to low hundreds of
 * metres), without generating an excessive point count. */
// innerRadiusMeters, when > 0, cuts the tip off the pizza slice — instead
// of a wedge closing at the center, it closes as a ring band between the
// two radii (the outer arc out, then the inner arc back, no center vertex
// at all). Kept in the same function rather than a separate shape type,
// since it's the same sector geometry with one more parameter.
export function sectorPolygonPath(
  center: google.maps.LatLngLiteral,
  radiusMeters: number,
  startAngle: number,
  endAngle: number,
  innerRadiusMeters = 0
): google.maps.LatLngLiteral[] {
  const centerLatLng = new google.maps.LatLng(center.lat, center.lng);
  // Normalise so the arc always sweeps clockwise from start to end, even
  // when the officer has dragged endAngle back past 0/360.
  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += 360;
  const steps = Math.max(2, Math.ceil(sweep / 6));

  const outerArc: google.maps.LatLngLiteral[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (sweep * i) / steps;
    const point = google.maps.geometry.spherical.computeOffset(
      centerLatLng,
      radiusMeters,
      angle
    );
    outerArc.push({ lat: point.lat(), lng: point.lng() });
  }

  if (innerRadiusMeters <= 0) {
    return [center, ...outerArc, center];
  }

  const innerArc: google.maps.LatLngLiteral[] = [];
  for (let i = steps; i >= 0; i--) {
    const angle = startAngle + (sweep * i) / steps;
    const point = google.maps.geometry.spherical.computeOffset(
      centerLatLng,
      innerRadiusMeters,
      angle
    );
    innerArc.push({ lat: point.lat(), lng: point.lng() });
  }
  return [...outerArc, ...innerArc];
}

/** Builds the 4-corner point path for a rectangle shape, optionally rotated
 * around its own center — Google Maps' native Rectangle has no rotation
 * option, so a non-zero rotation has to be hand-built as a Polygon instead
 * (same reason sectorPolygonPath above exists). neLat/neLng/swLat/swLng
 * describe the UNROTATED box (what the officer actually drags to
 * resize/move — see the rectangle editing effect below); rotation (degrees,
 * 0 = North, clockwise, same convention as sector's angles) is applied on
 * top of that at render time. Returns corners in NE, SE, SW, NW order
 * (clockwise) — a Polygon path closes itself, so there's no need to repeat
 * the first point. */
export function rectanglePolygonPath(
  neLat: number,
  neLng: number,
  swLat: number,
  swLng: number,
  rotationDeg = 0
): google.maps.LatLngLiteral[] {
  if (!rotationDeg) {
    return [
      { lat: neLat, lng: neLng }, // NE
      { lat: swLat, lng: neLng }, // SE
      { lat: swLat, lng: swLng }, // SW
      { lat: neLat, lng: swLng }, // NW
    ];
  }
  const centerLat = (neLat + swLat) / 2;
  const centerLng = (neLng + swLng) / 2;
  const center = new google.maps.LatLng(centerLat, centerLng);
  const halfWidthM =
    google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(centerLat, swLng),
      new google.maps.LatLng(centerLat, neLng)
    ) / 2;
  const halfHeightM =
    google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(swLat, centerLng),
      new google.maps.LatLng(neLat, centerLng)
    ) / 2;
  const diag = Math.hypot(halfWidthM, halfHeightM);
  // Heading from center to the (unrotated) NE corner — atan2(east, north).
  const baseAngle =
    halfWidthM === 0 && halfHeightM === 0
      ? 0
      : (Math.atan2(halfWidthM, halfHeightM) * 180) / Math.PI;
  const cornerHeadings = [
    baseAngle, // NE
    180 - baseAngle, // SE
    180 + baseAngle, // SW
    360 - baseAngle, // NW
  ];
  return cornerHeadings.map(heading => {
    const pt = google.maps.geometry.spherical.computeOffset(
      center,
      diag,
      heading + rotationDeg
    );
    return { lat: pt.lat(), lng: pt.lng() };
  });
}
