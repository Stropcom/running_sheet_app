import { router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { profileRouter } from "./routers/profile";
import { authRouter } from "./routers/auth";
import { passkeyRouter } from "./routers/passkey";
import { operationRouter } from "./routers/operation";
import { sheetRouter } from "./routers/sheet";
import { rowRouter } from "./routers/row";
import { attachmentRouter } from "./routers/attachment";
import { memberRouter } from "./routers/member";
import { certificationRouter } from "./routers/certification";
import { notificationsRouter } from "./routers/notifications";
import { smeacBriefingRouter } from "./routers/smeacBriefing";
import { ucoGuideRouter } from "./routers/ucoGuide";
import { auditLogRouter } from "./routers/auditLog";
import { exportRouter } from "./routers/export";
import { adminRouter } from "./routers/admin";
import { usersRouter } from "./routers/users";
import { targetRouter } from "./routers/target";
import { associateRouter } from "./routers/associate";
import { shortcutsRouter } from "./routers/shortcuts";
import { intelligenceRouter } from "./routers/intelligence";
import { governanceRouter } from "./routers/governance";
import { summaryRouter } from "./routers/summary";
import { targetShortcutsRouter } from "./routers/targetShortcuts";
import { calendarRouter } from "./routers/calendar";
import { statementRouter } from "./routers/statement";
import { witnessListRouter } from "./routers/witnessList";
import { wipcRouter } from "./routers/wipc";
import { recycleBinRouter } from "./routers/recycleBin";
import { customMarkerRouter } from "./routers/customMarker";
import { mapShapeRouter } from "./routers/mapShape";
import { rsMappingRouter } from "./routers/rsMapping";
import { sidebarRouter } from "./routers/sidebar";
import { commandFeaturesRouter } from "./routers/commandFeatures";
import { documentAiRouter } from "./routers/documentAi";
import { zeroDataRouter } from "./routers/zeroData";
import { reportsRouter } from "./routers/reports";
import { opManagerRouter } from "./routers/opManager";
import { ctoRosterRouter } from "./routers/ctoRoster";
import { travelledViaRouter } from "./routers/travelledVia";
import { adminUtilsRouter } from "./routers/adminUtils";

/**
 * The one tRPC router. Each area lives in its own file under `server/routers/`
 * (shared guards, schemas and small helpers are in `routers/_helpers.ts`);
 * this file only puts them together, in the same order as before.
 */
export const appRouter = router({
  system: systemRouter,

  profile: profileRouter,
  auth: authRouter,
  passkey: passkeyRouter,
  operation: operationRouter,
  sheet: sheetRouter,
  row: rowRouter,
  attachment: attachmentRouter,
  member: memberRouter,
  certification: certificationRouter,
  notifications: notificationsRouter,
  smeacBriefing: smeacBriefingRouter,
  ucoGuide: ucoGuideRouter,
  auditLog: auditLogRouter,
  export: exportRouter,
  admin: adminRouter,
  users: usersRouter,
  target: targetRouter,
  associate: associateRouter,
  shortcuts: shortcutsRouter,
  intelligence: intelligenceRouter,
  governance: governanceRouter,
  summary: summaryRouter,
  targetShortcuts: targetShortcutsRouter,
  calendar: calendarRouter,
  statement: statementRouter,
  witnessList: witnessListRouter,
  wipc: wipcRouter,
  recycleBin: recycleBinRouter,
  customMarker: customMarkerRouter,
  mapShape: mapShapeRouter,
  rsMapping: rsMappingRouter,
  sidebar: sidebarRouter,
  commandFeatures: commandFeaturesRouter,
  documentAi: documentAiRouter,
  zeroData: zeroDataRouter,
  reports: reportsRouter,
  opManager: opManagerRouter,
  ctoRoster: ctoRosterRouter,
  travelledVia: travelledViaRouter,
  adminUtils: adminUtilsRouter,
});
export type AppRouter = typeof appRouter;
