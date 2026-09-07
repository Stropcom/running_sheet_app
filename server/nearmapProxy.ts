import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

/**
 * Nearmap aerial-imagery overlay, served as a Simple WMS layer through this
 * proxy so NEARMAP_API_KEY never reaches the browser — unlike the Google
 * Maps base map (an official platform-proxied integration, see
 * references/maps-integration.md), Nearmap is the org's own paid
 * subscription and its key is a real secret.
 *
 * Base path confirmed against the org's real "Copy link" URL from Nearmap's
 * Simple WMS service (Integrations > API Services):
 *   https://api.nearmap.com/wms/v1/latest/apikey/{apikey}?service=WMS&request=GetCapabilities
 * — i.e. the key is a path segment under /wms/v1/latest/apikey/, not a
 * "/wms/{key}/service" shape.
 *
 * WMS version confirmed live: an initial GetMap using VERSION=1.3.0 +
 * CRS=EPSG:3857 came back as a 200 OK carrying a WMS
 * ServiceExceptionReport (version="1.1.1") saying "SRS is mandatory" —
 * Nearmap's server speaks WMS 1.1.1, where the coordinate-system param is
 * named SRS, not CRS (the 1.3.0 name for the same thing), so the 1.3.0
 * request's CRS param was simply never recognised. Switched to 1.1.1 +
 * SRS below to match.
 *
 * NEARMAP_LAYER is still a guess ("Vert" is Nearmap's conventional default
 * vertical-imagery layer name) — the SRS error above came back before any
 * layer-name check, so it doesn't confirm "Vert" is right. If a tile
 * request still comes back as an XML ServiceExceptionReport (this proxy
 * now returns those as a 502 with the exception logged server-side, not
 * silently forwarded as a broken image), open the GetCapabilities URL
 * above in a browser and check the actual <Name> value inside each
 * <Layer> element in the returned XML, then update NEARMAP_LAYER to
 * match. Everything else here (auth gate, tile math, response streaming,
 * the client toggle) doesn't depend on that.
 */

const NEARMAP_WMS_BASE = "https://api.nearmap.com/wms/v1/latest/apikey";
const NEARMAP_LAYER = "Vert";
const NEARMAP_WMS_VERSION = "1.1.1";
const TILE_SIZE = 256;
const WEB_MERCATOR_CIRCUMFERENCE_M = 40_075_016.6855785; // EPSG:3857

/** Converts a standard slippy-map tile coordinate to its EPSG:3857 bounding box. */
function tileToWebMercatorBBox(
  x: number,
  y: number,
  z: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const tileSizeMeters = WEB_MERCATOR_CIRCUMFERENCE_M / Math.pow(2, z);
  const originShift = WEB_MERCATOR_CIRCUMFERENCE_M / 2;
  const minX = x * tileSizeMeters - originShift;
  const maxX = (x + 1) * tileSizeMeters - originShift;
  const maxY = originShift - y * tileSizeMeters;
  const minY = originShift - (y + 1) * tileSizeMeters;
  return { minX, minY, maxX, maxY };
}

export function registerNearmapProxy(app: Express) {
  app.get(
    "/api/nearmap/tile",
    async (req: Request, res: Response): Promise<void> => {
      try {
        await sdk.authenticateRequest(req);
      } catch {
        res.status(401).send("Unauthorized");
        return;
      }

      if (!ENV.nearmapApiKey) {
        res.status(500).send("Nearmap is not configured on this server");
        return;
      }

      const x = Number(req.query.x);
      const y = Number(req.query.y);
      const z = Number(req.query.z);
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        !Number.isInteger(z) ||
        z < 0 ||
        z > 24
      ) {
        res.status(400).send("Invalid tile coordinates");
        return;
      }

      const { minX, minY, maxX, maxY } = tileToWebMercatorBBox(x, y, z);

      const wmsUrl = new URL(`${NEARMAP_WMS_BASE}/${ENV.nearmapApiKey}`);
      wmsUrl.searchParams.set("SERVICE", "WMS");
      wmsUrl.searchParams.set("VERSION", NEARMAP_WMS_VERSION);
      wmsUrl.searchParams.set("REQUEST", "GetMap");
      wmsUrl.searchParams.set("LAYERS", NEARMAP_LAYER);
      wmsUrl.searchParams.set("STYLES", "");
      wmsUrl.searchParams.set("SRS", "EPSG:3857");
      wmsUrl.searchParams.set("BBOX", `${minX},${minY},${maxX},${maxY}`);
      wmsUrl.searchParams.set("WIDTH", String(TILE_SIZE));
      wmsUrl.searchParams.set("HEIGHT", String(TILE_SIZE));
      wmsUrl.searchParams.set("FORMAT", "image/jpeg");
      wmsUrl.searchParams.set("TRANSPARENT", "false");

      try {
        const nearmapResp = await fetch(wmsUrl);
        if (!nearmapResp.ok) {
          const body = await nearmapResp.text().catch(() => "");
          console.error(
            `[NearmapProxy] upstream error: ${nearmapResp.status} ${body.slice(0, 300)}`
          );
          res.status(502).send("Nearmap upstream error");
          return;
        }

        const contentType =
          nearmapResp.headers.get("content-type") ?? "image/jpeg";
        // WMS servers commonly report a bad GetMap request as a
        // ServiceExceptionReport XML body with a 200 OK HTTP status, not a
        // non-2xx status — the `!nearmapResp.ok` check above alone can't
        // catch that, so it would otherwise get forwarded straight through
        // as if it were valid tile bytes (a broken/blank image client-side,
        // with the real reason never logged anywhere).
        if (contentType.includes("xml")) {
          const body = await nearmapResp.text().catch(() => "");
          console.error(
            `[NearmapProxy] upstream returned XML instead of an image: ${body.slice(0, 500)}`
          );
          res.status(502).send("Nearmap returned an error, see server logs");
          return;
        }

        const buf = Buffer.from(await nearmapResp.arrayBuffer());
        res.set("Content-Type", contentType);
        // Aerial capture dates change infrequently — cache tiles for a day
        // to keep this off the request path (and off the org's Nearmap
        // usage quota) on repeat views of the same area.
        res.set("Cache-Control", "public, max-age=86400");
        res.send(buf);
      } catch (err) {
        console.error("[NearmapProxy] failed:", err);
        res.status(502).send("Nearmap proxy error");
      }
    }
  );
}
