import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getRsMappingWaypoints,
  upsertRsMappingWaypoint,
  geocodeAddressList,
} from "../db";

export const rsMappingRouter = router({
  getStaticMapImage: protectedProcedure
    .input(
      z.object({
        waypoints: z.array(
          z.object({
            lat: z.number(),
            lng: z.number(),
            index: z.number(),
            colour: z.string().optional(),
            label: z.string().optional(), // single-char label override (A-Z)
            size: z.enum(["tiny", "small", "mid"]).optional(), // Static Maps marker size — omit for the default full-size pin
          })
        ),
        center: z.object({ lat: z.number(), lng: z.number() }).optional(),
        zoom: z.number().optional(),
        size: z.string().optional(),
        routePath: z.string().optional(), // pipe-separated lat,lng pairs for route polyline
      })
    )
    .query(async ({ input }) => {
      const { ENV } = await import("../_core/env");
      // A directly-owned Google Maps Platform key takes priority over the
      // Manus forge proxy, so this works outside the Manus hosting environment.
      const url = ENV.googleMapsApiKey
        ? new URL("https://maps.googleapis.com/maps/api/staticmap")
        : new URL(
            `${ENV.forgeApiUrl.replace(/\/+$/, "")}/v1/maps/proxy/maps/api/staticmap`
          );
      url.searchParams.append("key", ENV.googleMapsApiKey || ENV.forgeApiKey);

      // Size defaults to 800x500 landscape for PDF
      const size = input.size ?? "800x500";
      url.searchParams.append("size", size);
      url.searchParams.append("maptype", "roadmap");
      url.searchParams.append("scale", "2");

      // Center / zoom — auto-fit if not provided
      if (input.center) {
        url.searchParams.append(
          "center",
          `${input.center.lat},${input.center.lng}`
        );
      }
      if (input.zoom !== undefined) {
        url.searchParams.append("zoom", String(input.zoom));
      }

      // Add route polyline path if provided
      if (input.routePath) {
        url.searchParams.append(
          "path",
          `color:0x1E88E5C0|weight:3|${input.routePath}`
        );
      }

      // Add markers for each waypoint. Static Maps' `label` only accepts a
      // single character — silently truncating a longer label (e.g. index
      // "14" → "1") is misleading, so it's only sent when it's already
      // exactly one character; otherwise the marker is drawn unlabelled.
      for (const wp of input.waypoints) {
        const colour = wp.colour ? wp.colour.replace("#", "0x") : "0x6366f1";
        const sizePart = wp.size ? `size:${wp.size}|` : "";
        const labelPart =
          wp.label && wp.label.length === 1 ? `label:${wp.label}|` : "";
        const markerSpec = `${sizePart}color:${colour}|${labelPart}${wp.lat},${wp.lng}`;
        url.searchParams.append("markers", markerSpec);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        const errText = await response.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Static Maps API failed: ${response.status} ${errText.slice(0, 200)}`,
        });
      }

      const contentType = response.headers.get("content-type") ?? "image/png";
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const dataUrl = `data:${contentType};base64,${base64}`;
      return { dataUrl };
    }),

  /** Geocodes a plain list of address strings (cache-first, same geocoder
   * as the Heat Map) — used by the Supervisor Summary export to plot its
   * own Location column on a map page. */
  geocodeAddresses: protectedProcedure
    .input(z.object({ addresses: z.array(z.string()) }))
    .query(async ({ input }) => {
      return geocodeAddressList(input.addresses);
    }),

  getWaypoints: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      return getRsMappingWaypoints(input.sheetId);
    }),
  upsertWaypoint: protectedProcedure
    .input(
      z.object({
        sheetId: z.number(),
        rowId: z.number(),
        lat: z.number().optional().nullable(),
        lng: z.number().optional().nullable(),
        comment: z.string().optional().nullable(),
        markerIcon: z.string().optional().nullable(),
        markerColour: z.string().optional().nullable(),
        markerRotation: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await upsertRsMappingWaypoint({
        sheetId: input.sheetId,
        rowId: input.rowId,
        createdBy: ctx.user.id,
        lat: input.lat,
        lng: input.lng,
        comment: input.comment,
        markerIcon: input.markerIcon,
        markerColour: input.markerColour,
        markerRotation: input.markerRotation,
      });
      return { id };
    }),
});
