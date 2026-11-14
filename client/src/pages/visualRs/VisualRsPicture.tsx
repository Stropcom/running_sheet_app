// One Visual RS picture: a plain map or satellite photo of the place with the
// target flag, the place pin and (only when it has its own marker on the map)
// the vehicle drawn over it. The photo carries no markers; the overlay is
// drawn here from the same Web Mercator maths the photo was made with
// (shared/staticMapProject.ts), so the flag looks exactly as it does on the
// Map page (white pill, rose edge, dashed once unsure or ceased).
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { TARGET_USER_ICON_PATH } from "@/lib/flyMarkerIcon";
import { describeNearmapAge } from "@shared/nearmapAge";
import {
  chooseZoom,
  inPicture,
  projectToPicture,
  type PictureView,
} from "@shared/staticMapProject";
import { targetEmoji } from "@shared/targetPosition";
import type { VisualRsPlacedFrame } from "@shared/visualRs";

export const PICTURE_W = 360;
export const PICTURE_H = 220;
export type PictureMode = "map" | "sat";

const ROSE = "#e11d48";
const GREY = "#6b7280";
const FONT = "600 11px system-ui, -apple-system, 'Segoe UI', sans-serif";

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string): number {
  if (measureCtx === undefined)
    measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 6;
  measureCtx.font = FONT;
  return measureCtx.measureText(text).width;
}

/** Where the picture is centred and how far in it is zoomed, and whether the
 * vehicle marker fits in it. The satellite is taken closer than the map. */
export function viewOfFrame(
  frame: VisualRsPlacedFrame,
  mode: PictureMode
): { view: PictureView; vehicleShown: boolean } | null {
  if (!frame.at) return null;
  const maxZoom = mode === "sat" ? 19 : 17;
  const size = { width: PICTURE_W, height: PICTURE_H };
  const points = [frame.at, ...(frame.vehicle ? [frame.vehicle] : [])];
  const zoom = chooseZoom(points, size, { minZoom: 14, maxZoom, padding: 56 });
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  const view = { center, zoom, ...size };
  return {
    view,
    vehicleShown: !!frame.vehicle && inPicture(frame.vehicle, view, 14),
  };
}

function Pin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M0 0 C -9 -10, -9 -21, 0 -21 C 9 -21, 9 -10, 0 0 Z"
        fill={ROSE}
        stroke="#fff"
        strokeWidth="1.4"
      />
      <circle cy="-12" r="3" fill="#fff" />
    </g>
  );
}

function VehicleMarker({ x, y, rego }: { x: number; y: number; rego: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x="-10"
        y="-10"
        width="20"
        height="20"
        rx="5"
        fill="#6444b0"
        stroke="#fff"
        strokeWidth="1.4"
      />
      <path d="M-6 2 L-5 -2 Q-4 -4 -2 -4 L2 -4 Q4 -4 5 -2 L6 2 Z" fill="#fff" />
      <circle cx="-3.5" cy="3.5" r="1.4" fill="#fff" />
      <circle cx="3.5" cy="3.5" r="1.4" fill="#fff" />
      <text
        x="13"
        y="3"
        fontSize="8.5"
        fontWeight="700"
        fill="#3a2780"
        stroke="#fff"
        strokeWidth="2.4"
        paintOrder="stroke"
        fontFamily="system-ui, sans-serif"
      >
        {rego}
      </text>
    </g>
  );
}

/** The Map page's target flag: white pill, rose edge, emoji (the person icon
 * for "Commenced"), "NAME · where", and a short stem down to `(x, topY)`. */
function Flag({
  x,
  topY,
  frame,
}: {
  x: number;
  topY: number;
  frame: VisualRsPlacedFrame;
}) {
  const f = frame.flag;
  const edge = f.ended ? GREY : ROSE;
  const icon = f.kind === "commenced";
  const emoji = f.kind === "ceased" ? "⏹" : icon ? "" : targetEmoji(f.kind);
  const w = Math.ceil(8 + 16 + 6 + textWidth(f.text) + 10);
  const h = 25;
  const cx = Math.min(PICTURE_W - 4 - w / 2, Math.max(4 + w / 2, x));
  const top = topY - 8 - h;
  return (
    <g>
      <rect x={x - 1} y={topY - 9} width="2" height="8" rx="1" fill={edge} />
      <rect
        x={cx - w / 2}
        y={top}
        width={w}
        height={h}
        rx={h / 2}
        fill="#fff"
        stroke={edge}
        strokeWidth="2"
        strokeDasharray={f.unsure ? "4 3" : undefined}
      />
      {icon ? (
        <g
          transform={`translate(${cx - w / 2 + 8} ${top + 4.5}) scale(${16 / 24})`}
          fill="none"
          stroke={ROSE}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={TARGET_USER_ICON_PATH} />
          <circle cx="12" cy="7" r="4" />
        </g>
      ) : (
        <text x={cx - w / 2 + 8} y={top + 17.5} fontSize="14">
          {emoji}
        </text>
      )}
      <text
        x={cx - w / 2 + 30}
        y={top + 16.5}
        fontSize="11"
        fontWeight="600"
        fill="#14181d"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
      >
        {f.text}
      </text>
    </g>
  );
}

function SatelliteCaption({ at }: { at: { lat: number; lng: number } }) {
  const q = trpc.intelligence.nearmapCaptureDate.useQuery(at, {
    staleTime: 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const age =
    q.data?.date != null ? describeNearmapAge(q.data.date, new Date()) : null;
  return (
    <span>
      Satellite (Nearmap)
      {age
        ? ` · photo date ${age.dateLabel} · ${age.shortAge} old${age.band === "green" ? "" : " — check it still shows the place"}`
        : " · photo date not available"}
    </span>
  );
}

export function VisualRsPicture({
  frame,
  mode,
}: {
  frame: VisualRsPlacedFrame;
  mode: PictureMode;
}) {
  const shown = useMemo(() => viewOfFrame(frame, mode), [frame, mode]);
  const [satFailed, setSatFailed] = useState(false);
  const view = shown?.view ?? null;
  const mapQuery = trpc.rsMapping.getStaticMapImage.useQuery(
    {
      waypoints: [],
      center: view?.center,
      zoom: view?.zoom,
      size: `${PICTURE_W}x${PICTURE_H}`,
      maptype: "roadmap",
    },
    {
      enabled: !!view && mode === "map",
      staleTime: 30 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  if (!shown || !view) {
    return (
      <div className="flex h-full min-h-[10rem] items-center justify-center bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        This place could not be found on the map, so there is no picture.
      </div>
    );
  }
  const base =
    mode === "map"
      ? (mapQuery.data?.dataUrl ?? null)
      : `/api/nearmap/snapshot?lat=${view.center.lat}&lng=${view.center.lng}&z=${view.zoom}&w=${PICTURE_W}&h=${PICTURE_H}`;
  const place = projectToPicture(frame.at!, view);
  const veh = shown.vehicleShown
    ? projectToPicture(frame.vehicle!, view)
    : null;
  // The flag sits on the vehicle's own marker when he is in it and it has one,
  // else on the place pin.
  const onVehicle = !!veh && frame.flag.kind === "vehicle";
  const flagX = onVehicle ? veh!.x : place.x;
  const flagTop = onVehicle ? veh!.y - 12 : place.y - 23;

  return (
    <figure className="m-0">
      <div
        className="relative w-full bg-muted/40"
        style={{ aspectRatio: `${PICTURE_W} / ${PICTURE_H}` }}
      >
        {base && !(mode === "sat" && satFailed) && (
          <img
            src={base}
            alt={`${mode === "sat" ? "Satellite" : "Map"} picture of ${frame.flag.place ?? "the place"}`}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => mode === "sat" && setSatFailed(true)}
          />
        )}
        {(mode === "map" ? mapQuery.isLoading : false) && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}
        {((mode === "map" && mapQuery.isError) ||
          (mode === "sat" && satFailed)) && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {mode === "sat"
              ? "The satellite picture could not be loaded."
              : "The map picture could not be loaded."}
          </div>
        )}
        <svg
          viewBox={`0 0 ${PICTURE_W} ${PICTURE_H}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`${frame.flag.text}${veh ? `, vehicle ${frame.vehicle!.rego} marked` : ""}`}
        >
          {veh && (
            <VehicleMarker x={veh.x} y={veh.y} rego={frame.vehicle!.rego} />
          )}
          <Pin x={place.x} y={place.y} />
          <Flag x={flagX} topY={flagTop} frame={frame} />
        </svg>
      </div>
      <figcaption className="border-t border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
        {mode === "sat" ? (
          <SatelliteCaption at={frame.at!} />
        ) : (
          "Map picture (Google) — shows the place, not the event"
        )}
      </figcaption>
    </figure>
  );
}
