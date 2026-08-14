import "dotenv/config";
// Set server timezone to Perth, Western Australia (UTC+8) — must be first line
process.env.TZ = "Australia/Perth";

import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerLocalUploadsRoute } from "../storage";
import { registerRawAttachmentUploadRoute } from "../attachmentUpload";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  seedShortcutsIfEmpty,
  ensureDefaultShortcuts,
  verifyWipcVaultKeyOrThrow,
} from "../db";
import { ENV } from "./env";

// Fail fast rather than silently signing every session with an empty key.
if (!ENV.cookieSecret || ENV.cookieSecret.length < 32) {
  throw new Error(
    "JWT_SECRET is not set or is too short (must be at least 32 characters). " +
      "Refusing to start: an empty/weak secret would let anyone forge a valid login session."
  );
}

// WIPC_VAULT_KEY is optional (the WIPC feature is opt-in), but if it's set
// it must be well-formed — catch a truncated/mistyped key immediately at
// startup rather than only discovering it when an officer tries to save a
// WIPC record. Absence is allowed here; verifyWipcVaultKeyOrThrow (called
// once the DB is up, below) does the deeper check against existing data.
if (process.env.WIPC_VAULT_KEY && process.env.WIPC_VAULT_KEY.length !== 64) {
  throw new Error(
    "WIPC_VAULT_KEY is set but is not a valid 64-character hex string. " +
      "Refusing to start: a malformed key would block or corrupt all WIPC vault operations."
  );
}
if (!process.env.WIPC_VAULT_KEY) {
  console.warn(
    "[WIPC] WIPC_VAULT_KEY is not set — the WIPC (Witness Identity Protection Certificate) " +
      "vault will be unavailable until it is configured (see server/wipcVault.ts)."
  );
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ─── Rate limiter: OAuth / login endpoints ───────────────────────────────────
// 20 attempts per 15 minutes per IP — stops brute-force, invisible to normal users
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: req => process.env.NODE_ENV === "test",
});

async function startServer() {
  // Detect a rotated/wrong WIPC_VAULT_KEY before serving any requests — see
  // verifyWipcVaultKeyOrThrow in db.ts for why this can't just be caught by
  // the format check above.
  await verifyWipcVaultKeyOrThrow();

  const app = express();
  const server = createServer(app);

  // Trust the first hop's X-Forwarded-* headers (standard for a single
  // reverse proxy in front — e.g. Manus's hosting, or a typical nginx/PaaS
  // setup). Without this, express-rate-limit and req.protocol see the
  // proxy's own address/scheme for every request instead of the real
  // client's, breaking per-client rate limiting. If this app ever sits
  // behind more than one proxy hop, increase this number accordingly.
  app.set("trust proxy", 1);

  // ─── Security headers (Helmet — CSP excluded to avoid blocking app resources) ─
  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP requires careful per-app whitelisting — applied separately when ready
      crossOriginEmbedderPolicy: false, // Allows Manus OAuth portal to embed resources
    })
  );

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerLocalUploadsRoute(app);
  registerRawAttachmentUploadRoute(app);

  // Apply rate limiting to OAuth routes and the credential-guessing-relevant
  // tRPC auth calls. NOTE: tRPC routes are dot-separated (e.g.
  // /api/trpc/auth.login), not slash-separated, so Express's normal
  // app.use("/api/trpc/auth", ...) segment-boundary matching never actually
  // matched them — that mount silently rate-limited nothing. Match on the
  // real paths explicitly instead. Deliberately excludes auth.me/auth.logout,
  // which are innocuous and called far more than 20 times per 15 minutes in
  // normal use.
  const RATE_LIMITED_TRPC_PATHS = [
    "/api/trpc/auth.login",
    "/api/trpc/auth.setNewPassword",
  ];
  app.use("/api/oauth", authRateLimiter);
  app.use((req, res, next) => {
    if (RATE_LIMITED_TRPC_PATHS.some(p => req.path.startsWith(p))) {
      return authRateLimiter(req, res, next);
    }
    next();
  });

  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer()
  .then(() => ensureDefaultShortcuts(1).catch(() => {}))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
