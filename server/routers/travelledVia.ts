import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

import {
  makeRequest,
  type DirectionsResult,
  type GeocodingResult,
} from "../_core/map";

export const travelledViaRouter = router({
  /**
   * Given two address strings (departure and arrival), geocodes them, calls
   * the Google Directions API, and returns a formatted street list in the
   * prescribed RS format:
   *   First Street, SUBURB,
   *   Middle Street,
   *   Last Street, SUBURB, whereat;
   */
  getStreets: protectedProcedure
    .input(
      z.object({
        departAddress: z.string().min(1),
        arriveAddress: z.string().min(1),
        // Raw observation text from surrounding rows — used to extract suburb directly
        // from the text (e.g. "arrived at 288 Canning Highway, BICTON WA") which is
        // more reliable than geocoding when addresses straddle suburb boundaries.
        departObsText: z.string().optional(),
        arriveObsText: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // ── Helper: geocode an address string → LatLng ──────────────────────
      async function geocodeAddress(
        address: string
      ): Promise<{ lat: number; lng: number; suburb: string } | null> {
        try {
          const result = await makeRequest<GeocodingResult>(
            "/maps/api/geocode/json",
            {
              address: address + ", Western Australia, Australia",
              region: "au",
            }
          );
          if (result.status !== "OK" || !result.results.length) return null;
          const loc = result.results[0].geometry.location;
          // Extract suburb (locality) from address components
          const components = result.results[0].address_components;
          const localityComp = components.find(c =>
            c.types.includes("locality")
          );
          const suburb = localityComp
            ? localityComp.long_name.toUpperCase()
            : "";
          return { lat: loc.lat, lng: loc.lng, suburb };
        } catch {
          return null;
        }
      }

      // ── Helper: strip HTML tags from Directions step instructions ────────
      function stripHtml(html: string): string {
        return html
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      // ── Helper: extract road name from a Directions step ─────────────────
      // Google Directions steps have html_instructions like:
      //   "Turn left onto <b>Canning Highway</b>"
      //   "Merge onto <b>Canning Hwy</b>/<wbr/><b>State Route 6</b>"
      //   "Head north on <b>Stock Road</b>"
      // We extract the first meaningful bold segment (road name), ignoring
      // state/national route numbers and directional words.
      // Google's Directions steps often abbreviate the road type ("Scott St",
      // "Kalamunda Rd") — expand it to the full word for the RS street list.
      // Case-sensitive since Google always returns these Title-Cased.
      function expandRoadAbbreviation(name: string): string {
        return name
          .replace(/\bRd\b/g, "Road")
          .replace(/\bSt\b/g, "Street")
          .replace(/\bAve\b/g, "Avenue")
          .replace(/\bDr\b/g, "Drive")
          .replace(/\bHwy\b/g, "Highway")
          .replace(/\bFwy\b/g, "Freeway")
          .replace(/\bTce\b/g, "Terrace")
          .replace(/\bPde\b/g, "Parade")
          .replace(/\bCct\b/g, "Circuit")
          .replace(/\bGr\b/g, "Grove")
          .replace(/\bLn\b/g, "Lane")
          .replace(/\bPl\b/g, "Place")
          .replace(/\bCt\b/g, "Court")
          .replace(/\bCl\b/g, "Close")
          .replace(/\bCres\b/g, "Crescent")
          .replace(/\bBlvd\b/g, "Boulevard")
          .replace(/\bEsp\b/g, "Esplanade");
      }

      function extractRoadName(htmlInstructions: string): string | null {
        const boldRe = /<b>([^<]+)<\/b>/g;
        const boldMatches: string[] = [];
        let bm: RegExpExecArray | null;
        while ((bm = boldRe.exec(htmlInstructions)) !== null)
          boldMatches.push(bm[1].trim());

        // Filter out: directional words, ordinal numbers, compass directions,
        // and ALL route/highway number codes in any form:
        //   "State Route 6", "State Rte 6", "State Rte60", "National Route 1",
        //   "National Highway 1", "Federal Route 1", "A1", "M2", bare numbers.
        const isJunk = (s: string) =>
          /^(left|right|north|south|east|west|northeast|northwest|southeast|southwest|slight|sharp|u-turn)$/i.test(
            s
          ) ||
          /^\d+(st|nd|rd|th)$/i.test(s) ||
          /^(state|national|federal|nat|natl)\s*(route|rte|rte\.?|highway|hwy|road|rd)\s*\d+/i.test(
            s
          ) ||
          /^(route|rte)\s*\d+/i.test(s) ||
          /^[A-Z]{1,2}\d+$/.test(s) ||
          /^\d+$/.test(s);

        // Prefer the first non-junk bold segment (road name comes first in Google's instructions)
        const roadName = boldMatches.find(m => m.length > 2 && !isJunk(m));
        if (roadName) return expandRoadAbbreviation(roadName);

        // The final step is often a pure arrival note with no road name at
        // all, e.g. "Destination will be on the left" — that's navigation
        // narration, not a street, and must never be extracted as one.
        const plain = stripHtml(htmlInstructions);
        if (/\bwill be on the (left|right)\b/i.test(plain)) return null;

        // Fallback: plain text, take everything after the last preposition.
        // Still subject to the same junk filter — otherwise a step whose only
        // bold segment was a filtered-out route/highway number (e.g. "Merge
        // onto National Highway 94") falls through here and slips the numbered
        // highway back in via the unfiltered plain text. \b word boundaries
        // stop "on" from matching mid-word (e.g. the "on" ending "Destination").
        const ontoMatch = plain.match(/\b(?:onto|on|toward)\s+(.+)$/i);
        if (ontoMatch) {
          const candidate = ontoMatch[1].replace(/\s*\/.*$/, "").trim();
          if (candidate.length > 2 && !isJunk(candidate))
            return expandRoadAbbreviation(candidate);
        }
        return null;
      }

      // ── Helper: extract suburb from geocoded reverse lookup at a LatLng ──
      async function reverseGeocodeSuburb(
        lat: number,
        lng: number
      ): Promise<string> {
        try {
          const result = await makeRequest<GeocodingResult>(
            "/maps/api/geocode/json",
            {
              latlng: `${lat},${lng}`,
              result_type: "locality",
              region: "au",
            }
          );
          if (result.status !== "OK" || !result.results.length) return "";
          const components = result.results[0].address_components;
          const localityComp = components.find(c =>
            c.types.includes("locality")
          );
          return localityComp ? localityComp.long_name.toUpperCase() : "";
        } catch {
          return "";
        }
      }

      // ── 1. Geocode both addresses ────────────────────────────────────────
      const [departGeo, arriveGeo] = await Promise.all([
        geocodeAddress(input.departAddress),
        geocodeAddress(input.arriveAddress),
      ]);

      if (!departGeo || !arriveGeo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Could not geocode one or both addresses. Please check the surrounding rows have valid addresses.",
        });
      }

      // ── 2. Call Directions API ───────────────────────────────────────────
      const directions = await makeRequest<DirectionsResult>(
        "/maps/api/directions/json",
        {
          origin: `${departGeo.lat},${departGeo.lng}`,
          destination: `${arriveGeo.lat},${arriveGeo.lng}`,
          mode: "driving",
          region: "au",
        }
      );

      if (directions.status !== "OK" || !directions.routes.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Directions API returned no route (status: ${directions.status}). Try entering the addresses manually.`,
        });
      }

      const steps = directions.routes[0].legs[0].steps;

      // ── 3. Extract unique road names in order ────────────────────────────
      const roadNames: string[] = [];
      for (const step of steps) {
        const name = extractRoadName(step.html_instructions);
        if (name && name !== roadNames[roadNames.length - 1]) {
          roadNames.push(name);
        }
      }

      if (roadNames.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Could not extract street names from the route. Please enter the streets manually.",
        });
      }

      // ── 4. Get suburbs for first and last road ───────────────────────────
      // Priority order for suburb:
      //   1. Extract directly from raw observation text (most reliable — the text
      //      already contains the correct suburb e.g. "BICTON WA", "MOUNT LAWLEY").
      //   2. Fall back to suburb from geocoded address components.
      function extractSuburbFromText(text: string): string {
        if (!text) return "";
        // Match ALL-CAPS suburb name after a comma, optionally followed by WA.
        // e.g. ", BICTON WA", ", MOUNT LAWLEY WA", ", ARDROSS (".
        // The suburb must be immediately followed by "(", end-of-line/string, or
        // punctuation (after the optional "WA") — not just any whitespace — so
        // an earlier all-caps alias in the same sentence (e.g. "1ADF124, DRAGON
        // driver...") doesn't get mistaken for the suburb before the real one
        // ("...Road, HIGH WYCOMBE WA (16 Newburn Road)...") is reached.
        const m = text.match(
          /,\s*([A-Z][A-Z ]{1,30}?)(?:\s+(?:WA|Western Australia))?\s*(?=[(.,\n]|$)/
        );
        if (m)
          return m[1]
            .trim()
            .replace(/\s+WA$/, "")
            .trim();
        return "";
      }

      const firstSuburb =
        (input.departObsText
          ? extractSuburbFromText(input.departObsText)
          : "") || departGeo.suburb;
      const lastSuburb =
        (input.arriveObsText
          ? extractSuburbFromText(input.arriveObsText)
          : "") || arriveGeo.suburb;

      // ── 5. Format the street list ────────────────────────────────────────
      // Format:
      //   First Street, SUBURB,
      //   Middle Street,
      //   Last Street, SUBURB, whereat;
      const lines: string[] = [];
      for (let i = 0; i < roadNames.length; i++) {
        const name = roadNames[i];
        if (i === 0 && roadNames.length === 1) {
          // Only one street — combine first+last format
          const suburb = firstSuburb || lastSuburb;
          lines.push(
            suburb ? `${name}, ${suburb}, whereat;` : `${name}, whereat;`
          );
        } else if (i === 0) {
          lines.push(firstSuburb ? `${name}, ${firstSuburb},` : `${name},`);
        } else if (i === roadNames.length - 1) {
          lines.push(
            lastSuburb
              ? `${name}, ${lastSuburb}, whereat;`
              : `${name}, whereat;`
          );
        } else {
          lines.push(`${name},`);
        }
      }

      return { streets: lines.join("\n") };
    }),
});
