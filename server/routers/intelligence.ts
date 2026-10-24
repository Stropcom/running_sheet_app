import { PLACE_SIGN_ICONS } from "@shared/placeSigns";
import { LABELLABLE_KINDS } from "@shared/placesReport";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COMMAND_CODES } from "@shared/commands";
import {
  filterLocationRows,
  reachableFor,
  toAccessUser,
} from "../operationAccess";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getInvestigatorAllowedOperationIds,
  getRunningSheetById,
  getTargetById,
  getAllIntelligenceEntities,
  getIntelligenceHeatMapLocations,
  getIntelTargetPatternOfLife,
  getIntelTargetPlaces,
  getIntelTargetPredictor,
  getSharedSeen,
  setPredictorLastSeen,
  clearPredictorLastSeen,
  setTargetPlaceLabel,
  createAuditLog,
  extractEntitiesFromText,
  checkPossibleDuplicates,
  searchRegions,
  checkCrossOperationEntity,
  markEntitiesNotDuplicate,
  mergeEntities,
  getIntelPinOverrides,
  saveIntelPinOverride,
  savePlaceSignForText,
  unmergeEntity,
  listEntityMerges,
  getKnownPersonNameCorrection,
  checkPossibleTargetMatches,
  confirmPersonNameMatch,
  rejectPersonNameMatch,
  searchIntelligenceEntities,
  searchRegisteredPersonMentions,
  searchKnownAddresses,
  getAssociationGraph,
  getIntelTargetProfile,
  getIntelOperationProfile,
  getIntelAssociateProfile,
  getIntelVehicleProfile,
  getIntelLocationProfile,
  getIntelMappingLocations,
  getUserLocations,
  upsertUserLocation,
  setUserOnFoot,
  setUserPinAppearance,
  clearUserLocation,
  mustShareLocation,
  getUserLocationState,
  getUserLocationHistories,
  getObservationTextForEntityScan,
  getDismissedFindingKeys,
  scanFindingKey,
  dismissScanFinding,
  getRegisteredPeopleForMap,
  createNotificationsForUsers,
} from "../db";
import {
  scanIntelligenceEntities,
  type ScanFinding,
} from "../intelligenceScan";
import { scanForMissedPersonMentions } from "../missedEntityScan";
import { getNerModelStatus } from "../localNER";

import { adminProcedure, withHostedTeams } from "./_helpers";

/** Intelligence Folder */
export const intelligenceRouter = router({
  /** Everyone registered against the selected operations' targets (targets,
   * associates, other home address residents) with all their registry
   * vehicles — feeds the map marker popups. Registry data only; running-sheet
   * observations are not involved. */
  registeredPeopleForMap: protectedProcedure
    .input(z.object({ operationIds: z.array(z.number()).max(200) }))
    .query(async ({ input }) => {
      return getRegisteredPeopleForMap(input.operationIds);
    }),

  /**
   * Returns a stable device token for this browser, creating one if it doesn't exist.
   * The token is stored in an httpOnly cookie so it survives localStorage clears.
   * This is used as the deviceId for location sharing.
   */
  getDeviceToken: protectedProcedure.query(async ({ ctx }) => {
    // Parse cookies manually from the raw header (no cookie-parser middleware)
    const cookieHeader = ctx.req.headers.cookie || "";
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach(part => {
      const [k, ...v] = part.trim().split("=");
      if (k) cookies[k.trim()] = decodeURIComponent(v.join("="));
    });
    const existing = cookies["runlog_device_token"];
    if (existing && existing.length > 8) {
      return { deviceToken: existing };
    }
    // Generate a new stable token
    const token = `dt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    // Set as a long-lived non-httpOnly cookie so JS can read it
    const isSecure =
      ctx.req.protocol === "https" ||
      ((ctx.req.headers["x-forwarded-proto"] as string) || "").includes(
        "https"
      );
    const cookieVal = `runlog_device_token=${token}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=None${isSecure ? "; Secure" : ""}`;
    ctx.res.setHeader("Set-Cookie", cookieVal);
    return { deviceToken: token };
  }),

  /** List all extracted entities from all observation rows */
  getEntities: protectedProcedure.query(async () => {
    return getAllIntelligenceEntities();
  }),

  /** Manual backup check over every mined entity, run on demand from the
   * admin's own profile page — see intelligenceScan.ts for the rules.
   * Notifies only the admin who ran it (never the wider team), with one
   * notification per finding so each can be reviewed and dismissed on
   * its own. */
  runEntityScan: adminProcedure.mutation(async ({ ctx }) => {
    const entities = await getAllIntelligenceEntities();
    const allFindings = scanIntelligenceEntities(entities);
    const dismissed = await getDismissedFindingKeys();
    const findings = allFindings.filter(
      f => !dismissed.has(`${f.ruleId}::${scanFindingKey(f.shortForm)}`)
    );
    if (findings.length > 0) {
      await createNotificationsForUsers([ctx.user.id], {
        title: `Intelligence scan: ${findings.length} possible issue${findings.length > 1 ? "s" : ""}`,
        body: findings
          .slice(0, 5)
          .map(f => f.reason)
          .join(" • "),
        url: "/profile",
        sourceModule: "intelligenceScan",
      });
    }
    return { findings };
  }),

  /** Step 2 of the Local AI Roadmap — on-device NER pass looking for a
   * person mention the rule-based extractor missed entirely (not just a
   * typo of one it already found — see intelligenceScan.ts for that
   * case). Same on-demand, admin-only, notify-only-the-runner contract
   * as runEntityScan above. Returns a clear status instead of a cryptic
   * failure when the local model files haven't been deployed yet (see
   * scripts/dev/ner-model-setup.md) — this is expected on any
   * deployment that hasn't done that manual step, not an error. */
  runMissedEntityScan: adminProcedure.mutation(async ({ ctx }) => {
    const modelStatus = await getNerModelStatus();
    if (modelStatus !== "ready") {
      return { modelStatus, findings: [] as ScanFinding[] };
    }

    const [observations, entities] = await Promise.all([
      getObservationTextForEntityScan(),
      getAllIntelligenceEntities(),
    ]);
    const knownNames = entities
      .filter(e => e.type === "person")
      .map(e => ({ id: e.shortForm, label: e.shortForm }));

    const allFindings = await scanForMissedPersonMentions(
      observations,
      knownNames
    );
    const dismissed = await getDismissedFindingKeys();
    const findings = allFindings.filter(
      f => !dismissed.has(`${f.ruleId}::${scanFindingKey(f.shortForm)}`)
    );
    if (findings.length > 0) {
      await createNotificationsForUsers([ctx.user.id], {
        title: `Missed-entity scan: ${findings.length} possible name${findings.length > 1 ? "s" : ""}`,
        body: findings
          .slice(0, 5)
          .map(f => f.shortForm)
          .join(" • "),
        url: "/profile",
        sourceModule: "missedEntityScan",
      });
    }
    return { modelStatus, findings };
  }),

  /** Records "not this one" for a single scan finding (either rule) so
   * it doesn't keep reappearing on every future scan run — same shape as
   * the existing Face Match "not a match" dismissal, applied to Local AI
   * Roadmap findings. Identity is (ruleId, normalised shortForm), not a
   * database id, since a finding is recomputed fresh every scan, not a
   * persisted row — see scanFindingKey in db.ts. */
  dismissScanFinding: adminProcedure
    .input(
      z.object({ ruleId: z.string().min(1), shortForm: z.string().min(1) })
    )
    .mutation(async ({ ctx, input }) => {
      await dismissScanFinding(input.ruleId, input.shortForm, ctx.user.cin);
      return { success: true };
    }),

  /** Heat Map: location visit counts + coordinates for one Operation,
   * optionally narrowed to one Target, over a When window. */
  getHeatMapLocations: protectedProcedure
    .input(
      z.object({
        operationId: z.number(),
        targetId: z.number().nullable().optional(),
        when: z.discriminatedUnion("mode", [
          z.object({ mode: z.literal("sheet"), sheetId: z.number() }),
          z.object({ mode: z.literal("all") }),
          z.object({ mode: z.literal("last7") }),
          z.object({ mode: z.literal("last30") }),
          z.object({
            mode: z.literal("custom"),
            startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          }),
        ]),
      })
    )
    .query(async ({ input }) => {
      return getIntelligenceHeatMapLocations(input);
    }),

  /** Pattern of Life: time/location analysis for one target within one
   * operation — activity by day & time, where & when (location × time),
   * and home presence/departure-return times. */
  getPatternOfLife: protectedProcedure
    .input(z.object({ operationId: z.number(), targetId: z.number() }))
    .query(async ({ input }) => {
      const result = await getIntelTargetPatternOfLife(
        input.operationId,
        input.targetId
      );
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Operation or target not found.",
        });
      return result;
    }),

  /** Places Report: the places one target goes — home, work, gym, cafe… —
   * with every visit (see shared/placesReport.ts). Reads uncertified rows
   * too; the page filters by period itself. */
  getTargetPlaces: protectedProcedure
    .input(z.object({ operationId: z.number(), targetId: z.number() }))
    .query(async ({ input }) => {
      const result = await getIntelTargetPlaces(
        input.operationId,
        input.targetId
      );
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Operation or target not found.",
        });
      return result;
    }),

  /** Target Predictor: the places one target goes (located on the map), his
   * stops with where he went next, and where the chosen sheet last had him.
   * Reads uncertified rows too. The predicting is done on the client, from
   * the clock, by shared/targetPredictor.ts. */
  getTargetPredictor: protectedProcedure
    .input(
      z.object({
        operationId: z.number(),
        targetId: z.number(),
        sheetId: z.number().nullable(),
      })
    )
    .query(async ({ input }) => {
      const result = await getIntelTargetPredictor(
        input.operationId,
        input.targetId,
        input.sheetId
      );
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Operation or target not found.",
        });
      return result;
    }),

  /** Target Predictor: what the team set as "last seen" for this sheet today
   * (null when nothing is set). Polled every few seconds while the predictor is
   * on, so everyone sees the same position. */
  getPredictorLastSeen: protectedProcedure
    .input(z.object({ operationId: z.number(), sheetId: z.number() }))
    .query(({ input }) => getSharedSeen(input.sheetId)),

  /** Target Predictor: where the team says the target was last seen, set by
   * hand and shared with everyone who has the sheet open (today only; the
   * running sheet itself is not touched). */
  setPredictorLastSeen: protectedProcedure
    .input(
      z.object({
        operationId: z.number(),
        sheetId: z.number(),
        targetId: z.number(),
        kind: z.enum(["place", "point", "none", "sheet"]),
        placeKey: z.string().min(1).max(400).nullable(),
        lat: z.number().min(-90).max(90).nullable(),
        lng: z.number().min(-180).max(180).nullable(),
        seenMinutes: z.number().int().min(0).max(2879).nullable(),
        area: z.enum(["freeway", "main", "built", "back"]).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.kind === "place" && !input.placeKey)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A place is needed.",
        });
      if (input.kind === "point" && (input.lat === null || input.lng === null))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A point on the map is needed.",
        });
      await setPredictorLastSeen({ ...input, cin: ctx.user.cin ?? null });
      await createAuditLog({
        sheetId: input.sheetId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? null,
        action: "predictor_last_seen_changed",
        details: `Target Predictor last seen set (${
          input.kind === "none"
            ? "not seen yet"
            : input.kind === "sheet"
              ? "the running sheet's position, area set"
              : input.kind === "place"
                ? `at "${input.placeKey}"`
                : "at a point on the map"
        }${input.seenMinutes !== null ? `, ${Math.floor(input.seenMinutes / 60)}:${String(input.seenMinutes % 60).padStart(2, "0")}` : ""})`,
        createdAt: Date.now(),
      });
      return { ok: true };
    }),

  /** Target Predictor: go back to what the running sheet says. */
  clearPredictorLastSeen: protectedProcedure
    .input(z.object({ operationId: z.number(), sheetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await clearPredictorLastSeen(input.sheetId);
      await createAuditLog({
        sheetId: input.sheetId,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? null,
        action: "predictor_last_seen_changed",
        details:
          "Target Predictor last seen cleared (back to the running sheet)",
        createdAt: Date.now(),
      });
      return { ok: true };
    }),

  /** Places Report: an officer's own label on a place, shared with everyone
   * who can see the target. kind = null goes back to the automatic label. */
  setPlaceLabel: protectedProcedure
    .input(
      z.object({
        operationId: z.number(),
        targetId: z.number(),
        placeKey: z.string().min(1).max(400),
        placeName: z.string().max(600),
        kind: z.enum(LABELLABLE_KINDS).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const target = await getTargetById(input.targetId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target not found.",
        });
      await setTargetPlaceLabel({
        targetId: input.targetId,
        placeKey: input.placeKey,
        kind: input.kind,
        cin: ctx.user.cin ?? null,
      });
      await createAuditLog({
        sheetId: 0,
        userId: ctx.user.id,
        userName: ctx.user.cin ?? "Unknown",
        userCIN: ctx.user.cin ?? null,
        action: "place_label_changed",
        details: `Place "${input.placeName}" on target "${target.name}" ${
          input.kind ? `labelled as ${input.kind}` : "set back to automatic"
        }`,
        createdAt: Date.now(),
      });
      return { ok: true };
    }),

  /** Association graph — nodes and weighted edges from entity co-occurrence */
  getAssociationGraph: protectedProcedure
    .input(
      z.object({
        operationIds: z.array(z.number()).optional(),
        sheetIds: z.array(z.number()).optional(),
      })
    )
    .query(async ({ input }) => {
      return getAssociationGraph(input.operationIds, input.sheetIds);
    }),

  /** Target intelligence profile */
  targetProfile: protectedProcedure
    .input(z.object({ targetId: z.number() }))
    .query(async ({ input }) => {
      const profile = await getIntelTargetProfile(input.targetId);
      if (!profile)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Target not found.",
        });
      return profile;
    }),

  /** Operation intelligence profile */
  operationProfile: protectedProcedure
    .input(z.object({ operationId: z.number() }))
    .query(async ({ input }) => {
      const profile = await getIntelOperationProfile(input.operationId);
      if (!profile)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Operation not found.",
        });
      return profile;
    }),

  /** Associate intelligence profile (by label/name) */
  associateProfile: protectedProcedure
    .input(z.object({ label: z.string() }))
    .query(async ({ input }) => {
      const profile = await getIntelAssociateProfile(input.label);
      if (!profile)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Associate not found.",
        });
      return profile;
    }),

  /** Vehicle intelligence profile (by label) */
  vehicleProfile: protectedProcedure
    .input(z.object({ label: z.string() }))
    .query(async ({ input }) => {
      const profile = await getIntelVehicleProfile(input.label);
      if (!profile)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Vehicle not found.",
        });
      return profile;
    }),

  /** Location intelligence profile (by label) */
  locationProfile: protectedProcedure
    .input(z.object({ label: z.string() }))
    .query(async ({ input }) => {
      const profile = await getIntelLocationProfile(input.label);
      if (!profile)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Location not found.",
        });
      return profile;
    }),

  /** Whether this server has a Nearmap key — the Map page offers the
   * Fly + Nearmap split view (NM button) only when it does. The key itself
   * never leaves the server (tiles go through /api/nearmap/tile). */
  nearmapAvailable: protectedProcedure.query(async () => {
    const { ENV } = await import("../_core/env");
    return { configured: ENV.nearmapApiKey.length > 0 };
  }),

  /** When the Nearmap photos at a spot were taken ("YYYY-MM-DD"), so the Map
   * page can show how old the imagery is. null when unknown — the label is
   * then simply not shown. */
  nearmapCaptureDate: protectedProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    )
    .query(async ({ input }) => {
      const { fetchNearmapCaptureDate } = await import("../nearmapProxy");
      return { date: await fetchNearmapCaptureDate(input.lat, input.lng) };
    }),

  /** Intelligence mapping — all locations with linked targets/associates/vehicles */
  mappingLocations: protectedProcedure
    .input(
      z.object({
        operationIds: z.array(z.number()).optional(),
        targetIds: z.array(z.number()).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "investigator") {
        // Ignore whatever the client sent — substitute the investigator's
        // own grant, and drop targetIds entirely (it's an OR match
        // against operationIds in getIntelMappingLocations, so a
        // tampered targetId could otherwise reach a target outside
        // their allowed operations).
        return getIntelMappingLocations(
          getInvestigatorAllowedOperationIds(ctx.user),
          undefined
        );
      }
      return getIntelMappingLocations(input.operationIds, input.targetIds);
    }),

  /** Live user locations — operation-scoped, sharing-enabled users only */
  userLocations: protectedProcedure
    .input(
      z.object({
        operationIds: z.array(z.number()).default([]),
      })
    )
    .query(async ({ input, ctx }) => {
      return withHostedTeams(
        ctx.user,
        await filterLocationRows(
          toAccessUser(ctx.user),
          await getUserLocations(input.operationIds)
        )
      );
    }),

  /** Update (upsert) the caller's location and sharing preference */
  updateUserLocation: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
        lat: z.number(),
        lng: z.number(),
        operationIds: z.array(z.number()).default([]),
        sharingEnabled: z.boolean(),
        speed: z.number().nullable().optional(),
        heading: z.number().nullable().optional(),
        accuracy: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // A team that must share (Investigators) can't be switched off.
      const forced = await mustShareLocation(ctx.user);
      await upsertUserLocation(
        ctx.user.id,
        input.deviceId,
        input.lat,
        input.lng,
        ctx.user.role === "investigator"
          ? getInvestigatorAllowedOperationIds(ctx.user)
          : input.operationIds,
        forced ? true : input.sharingEnabled,
        input.speed ?? null,
        input.heading ?? null,
        input.accuracy ?? null
      );
      return { ok: true };
    }),

  /** Set the caller's own "on foot" pin flag (see users.onFoot) — always scoped to ctx.user.id */
  setOnFoot: protectedProcedure
    .input(z.object({ onFoot: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setUserOnFoot(ctx.user.id, input.onFoot);
      return { ok: true };
    }),

  /** Set the caller's own pin-appearance prefs (gender/skin-tone on the
   * on-foot glyph, vehicle icon for Wheels mode) — always scoped to
   * ctx.user.id, partial update. */
  setPinAppearance: protectedProcedure
    .input(
      z.object({
        pinGender: z.enum(["neutral", "male", "female"]).optional(),
        pinSkinTone: z.enum(["default", "brown"]).optional(),
        pinVehicleIcon: z
          .enum([
            "arrow",
            "dart",
            "cursor",
            "finger",
            "up_arrow_emoji",
            "rocket",
            "airplane",
            "pizza",
            "car",
            "racing_car",
            "motorcycle",
            "truck",
            "police_car",
          ])
          .optional(),
        // Hex string from PIN_COLOUR_SWATCHES, or null to clear back to
        // the team-default colour.
        pinColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable()
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await setUserPinAppearance(ctx.user.id, input);
      return { ok: true };
    }),

  /** Recorded trail for the given users since sinceMs — powers the map's live-trace lines */
  userLocationHistories: protectedProcedure
    .input(
      z.object({
        userIds: z.array(z.number()),
        sinceMs: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Only people whose live location this person is allowed to see.
      const visible = new Set(
        (
          await filterLocationRows(
            toAccessUser(ctx.user),
            await getUserLocations([])
          )
        ).map(r => r.userId)
      );
      visible.add(ctx.user.id);
      return getUserLocationHistories(
        input.userIds.filter(id => visible.has(id)),
        input.sinceMs
      );
    }),

  /** Get the target details (DEP/ARR/etc.) for a specific running sheet */
  getSheetTarget: protectedProcedure
    .input(z.object({ sheetId: z.number() }))
    .query(async ({ input }) => {
      const sheet = await getRunningSheetById(input.sheetId);
      if (!sheet || !sheet.targetId) return null;
      const target = await getTargetById(sheet.targetId);
      if (!target) return null;
      return {
        id: target.id,
        name: target.name,
        tgt: target.tgt,
        dep: target.dep,
        arr: target.arr,
        hb: target.hb,
        hbf: target.hbf,
        v1: target.v1,
        v1f: target.v1f,
        v2: target.v2,
        v2f: target.v2f,
        extraVehicles: target.extraVehicles ?? null,
        wildFields: target.wildFields ?? null,
      };
    }),

  /** Disable location sharing for the caller (for this device) */
  clearUserLocation: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Someone on a team that must share can't stop sharing.
      if (await mustShareLocation(ctx.user)) return { ok: true };
      await clearUserLocation(ctx.user.id, input.deviceId);
      return { ok: true };
    }),

  /** Get the caller's current sharing state for this device (for restoring toggle on load) */
  myLocationState: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getUserLocationState(ctx.user.id, input.deviceId);
    }),

  /** Preview the entities a chunk of observation text would extract, without saving anything. */
  previewEntities: protectedProcedure
    .input(z.object({ text: z.string() }))
    .query(async ({ input }) => {
      return extractEntitiesFromText(input.text);
    }),

  /** Region Search: which Commands hold a person, vehicle or address. Everyone
   * signed in sees the same matches; `canOpen` says whether the viewer may
   * open each in Intelligence (restricted operations are closed to other
   * Commands). See shared/regionSearch.ts. */
  regionSearch: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1).max(100),
        type: z.enum(["person", "vehicle", "address"]).optional(),
        command: z.enum(COMMAND_CODES).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return searchRegions(
        {
          command: ctx.user.command,
          allRegions: ctx.user.allRegions,
          reachableOperationIds: await reachableFor(toAccessUser(ctx.user)),
        },
        input
      );
    }),

  /** Fuzzy-duplicate check for a not-yet-saved entity label — backs the live confirm-dialog prompt. */
  checkPossibleDuplicates: protectedProcedure
    .input(
      z.object({
        type: z.enum(["person", "vehicle", "address", "business"]),
        label: z.string().min(1),
        /** Also return an entity with this exact name (registering a
         * record for someone already in the Intelligence folder). */
        includeExact: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      return checkPossibleDuplicates(input.type, input.label, {
        includeExact: input.includeExact,
      });
    }),

  /** Is this exact entity already a real (non-registry-only) sighting on a
   * different operation? Separate from checkPossibleDuplicates — that one
   * deliberately skips exact matches (they already auto-merge); this is
   * the informational warning for that exact-match case. */
  checkCrossOperationEntity: protectedProcedure
    .input(
      z.object({
        type: z.enum(["person", "vehicle", "address", "business"]),
        label: z.string().min(1),
        operationId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return checkCrossOperationEntity(
        input.type,
        input.label,
        input.operationId
      );
    }),

  /** Records "these are NOT the same entity" so the prompt never asks about this pair again. */
  markEntitiesNotDuplicate: protectedProcedure
    .input(
      z.object({
        type: z.enum(["person", "vehicle", "address", "business"]),
        labelA: z.string().min(1),
        labelB: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await markEntitiesNotDuplicate(
        input.type,
        input.labelA,
        input.labelB,
        ctx.user.cin ?? undefined
      );
      return { ok: true };
    }),

  /** Confirms two entities are the same — used by both the auto-prompt "Yes" and the manual Merge Entities tool. */
  mergeEntities: protectedProcedure
    .input(
      z.object({
        type: z.enum(["person", "vehicle", "address", "business"]),
        winnerLabel: z.string().min(1),
        loserLabel: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await mergeEntities(
          input.type,
          input.winnerLabel,
          input.loserLabel,
          ctx.user.cin ?? undefined
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Merge failed.",
        });
      }
      return { ok: true };
    }),

  /** Manual position/appearance corrections for auto-generated Intelligence
   * map pins — see the intelPinOverrides schema comment. */
  getPinOverrides: protectedProcedure.query(async () => {
    const overrides = await getIntelPinOverrides();
    // Keyed by entity label: keep those for entities this person can see.
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
    const known = new Set<string>();
    for (const e of await getAllIntelligenceEntities()) {
      known.add(norm(e.shortForm));
      for (const a of e.aliasLabels ?? []) known.add(norm(a));
    }
    return overrides.filter(o => known.has(norm(o.label)));
  }),

  savePinOverride: protectedProcedure
    .input(
      z.object({
        label: z.string().min(1),
        lat: z.number().optional(),
        lng: z.number().optional(),
        address: z.string().optional(),
        markerIcon: z.string().optional(),
        markerColour: z.string().optional(),
        rotation: z.number().optional(),
        customLabel: z.string().optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await saveIntelPinOverride(input, ctx.user.cin ?? undefined);
      return { ok: true };
    }),

  /** A place picked from the address suggestions: save Google's type for it
   * as its pin's sign (see savePlaceSignForText). */
  savePlaceSign: protectedProcedure
    .input(
      z.object({
        addressText: z.string().min(1).max(600),
        markerIcon: z.enum(PLACE_SIGN_ICONS as [string, ...string[]]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const saved = await savePlaceSignForText(
        input.addressText,
        input.markerIcon,
        ctx.user.cin ?? undefined
      );
      return { saved };
    }),

  /** Reverses a previous merge. */
  unmergeEntity: protectedProcedure
    .input(
      z.object({
        type: z.enum(["person", "vehicle", "address", "business"]),
        loserKey: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      await unmergeEntity(input.type, input.loserKey);
      return { ok: true };
    }),

  /** Lists all confirmed entity merges (most recent first) — backs an "undo merge" view. */
  listEntityMerges: protectedProcedure.query(async () => {
    const merges = await listEntityMerges();
    // The merge list names entities, so show only merges involving ones
    // this person can see (the request's Intelligence scope).
    const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
    const known = new Set<string>();
    for (const e of await getAllIntelligenceEntities()) {
      known.add(norm(e.shortForm));
      for (const a of e.aliasLabels ?? []) known.add(norm(a));
    }
    return merges.filter(
      m => known.has(norm(m.winnerLabel)) || known.has(norm(m.loserLabel))
    );
  }),

  /** Silent lookup: has this exact spelling already been confirmed against a Target/Associate? Backs auto-correcting a row's text on save without re-prompting. */
  getKnownPersonNameCorrection: protectedProcedure
    .input(z.object({ spelling: z.string().min(1) }))
    .query(async ({ input }) => {
      return getKnownPersonNameCorrection(input.spelling);
    }),

  /** Fuzzy-match a not-yet-saved person mention against the Target/Associate Registry — backs the save-time "is this an existing Target?" prompt. */
  checkPossibleTargetMatches: protectedProcedure
    .input(z.object({ label: z.string().min(1) }))
    .query(async ({ input }) => {
      return checkPossibleTargetMatches(input.label);
    }),

  /** Confirms a spelling belongs to an existing Target/Associate — this and future exact matches auto-correct silently from now on. */
  confirmPersonNameMatch: protectedProcedure
    .input(
      z.object({
        spelling: z.string().min(1),
        targetId: z.number().optional(),
        associateId: z.number().optional(),
        correctSpelling: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!input.targetId && !input.associateId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either targetId or associateId is required.",
        });
      }
      await confirmPersonNameMatch({
        ...input,
        decidedByCIN: ctx.user.cin ?? undefined,
      });
      return { ok: true };
    }),

  /** Records "not the same person" so this exact pairing isn't asked about again. */
  rejectPersonNameMatch: protectedProcedure
    .input(
      z.object({
        spelling: z.string().min(1),
        targetId: z.number().optional(),
        associateId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!input.targetId && !input.associateId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either targetId or associateId is required.",
        });
      }
      await rejectPersonNameMatch({
        ...input,
        decidedByCIN: ctx.user.cin ?? undefined,
      });
      return { ok: true };
    }),

  /** Substring search over existing entities of one type — backs the manual Merge Entities picker and the Target Registry autocomplete. */
  searchEntities: protectedProcedure
    .input(
      z.object({
        type: z.enum(["person", "vehicle", "address", "business"]),
        query: z.string().default(""),
        excludeTargets: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      return searchIntelligenceEntities(
        input.type,
        input.query,
        input.excludeTargets
      );
    }),

  /** Live suggestions for the observation field's inline mention
   * autocomplete — registered Target/Associate Registry people only. */
  searchPersonMentions: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      return searchRegisteredPersonMentions(input.query);
    }),

  /** Live suggestions for the observation field's address autocomplete —
   * addresses/businesses Intelligence already knows. */
  searchKnownAddresses: protectedProcedure
    .input(z.object({ query: z.string(), places: z.boolean().optional() }))
    .query(async ({ input }) => {
      return searchKnownAddresses(input.query, input.places);
    }),
});
