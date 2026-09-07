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
 * IMPORTANT — NOT YET VERIFIED AGAINST A LIVE NEARMAP ACCOUNT: the
 * constants below (base URL, layer name, version, param names) are built
 * from Nearmap's documented Simple WMS conventions, not a tested response,
 * because no API key was available while writing this. Before relying on
 * this: create the "Simple WMS" service under Nearmap's Integrations > API
 * Services tab (see the account's dashboard), and compare the "Copy link"
 * URL it generates against NEARMAP_WMS_BASE/NEARMAP_LAYER/NEARMAP_VERSION
 * below — update them to match exactly if they differ. Everything else
 * here (auth gate, tile math, response streaming) doesn't depend on that
 * and needs no changes once the URL is confirmed.
 */

const NEARMAP_WMS_BASE = "https://api.nearmap.com/wms";
const NEARMAP_LAYER = "Nearmap_Latest";
const NEARMAP_WMS_VERSION = "1.3.0";
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

      const wmsUrl = new URL(
        `${NEARMAP_WMS_BASE}/${ENV.nearmapApiKey}/service`
      );
      wmsUrl.searchParams.set("SERVICE", "WMS");
      wmsUrl.searchParams.set("VERSION", NEARMAP_WMS_VERSION);
      wmsUrl.searchParams.set("REQUEST", "GetMap");
      wmsUrl.searchParams.set("LAYERS", NEARMAP_LAYER);
      wmsUrl.searchParams.set("STYLES", "");
      wmsUrl.searchParams.set("CRS", "EPSG:3857");
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
