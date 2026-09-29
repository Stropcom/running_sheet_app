/**
 * The read-only body of a SMEAC briefing — target chips, the S/M/E/A/C
 * sections, and the "posted by" line. No header chrome, no edit/export/
 * acknowledge actions: those differ by where this is shown (the map's
 * docked SmeacMapOverlay adds a close button and an Acknowledge action;
 * the SMEAC Briefings list page's inline review row adds Edit/Export
 * buttons instead — see SmeacBriefingListPage.tsx). Pulled out of
 * SmeacMapOverlay.tsx so both places render the exact same document rather
 * than two hand-maintained copies of the same ~350 lines of JSX.
 */
import { INTEL_CHIP_CLASSES } from "@/components/IntelEntityChip";
import { SmeacLabel } from "@/components/SmeacLabel";
import { formatIntelVehicle, formatIntelAddress } from "@/lib/addressFormat";
import { MapPin, Car, User, Users, Radio } from "lucide-react";
import { format } from "date-fns";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type SmeacBriefingDetail = RouterOutputs["smeacBriefing"]["getById"];

export function SmeacReadOnlyContent({
  briefing,
}: {
  briefing: SmeacBriefingDetail;
}) {
  const rawHome =
    briefing.hbOverride || briefing.target?.hbf || briefing.target?.hb;
  const rawVehicle =
    briefing.voiOverride || briefing.target?.v1f || briefing.target?.v1;

  return (
    <div className="space-y-4">
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-card border border-border shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        {briefing.acknowledgedCount} acknowledged
      </span>

      {/* TARGET — precedes SMEAC, not part of it */}
      {(briefing.target || briefing.extraLocations.length > 0) && (
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Target
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {briefing.target && (
              <span
                className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-medium border truncate ${INTEL_CHIP_CLASSES.person}`}
              >
                <User className="w-3 h-3 shrink-0" />
                <span className="truncate">{briefing.target.name}</span>
              </span>
            )}
            {rawVehicle && (
              <span
                className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-medium border truncate ${INTEL_CHIP_CLASSES.vehicle}`}
              >
                <Car className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {formatIntelVehicle(rawVehicle)}
                </span>
              </span>
            )}
            {rawHome && (
              <span
                className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-medium border truncate ${INTEL_CHIP_CLASSES.address}`}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{formatIntelAddress(rawHome)}</span>
              </span>
            )}
            {briefing.extraLocations.map((loc, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-medium border truncate ${INTEL_CHIP_CLASSES.address}`}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{formatIntelAddress(loc)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SITUATION */}
      {(briefing.backgroundIntel ||
        briefing.knownRisks ||
        briefing.otherAgencies.length > 0) && (
        <div className="space-y-2.5">
          <SmeacLabel letter="S" label="Situation" />
          {briefing.backgroundIntel && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Background / intelligence
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {briefing.backgroundIntel}
              </p>
            </div>
          )}
          {briefing.knownRisks && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Known risks or threats
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {briefing.knownRisks}
              </p>
            </div>
          )}
          {briefing.otherAgencies.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Other agencies / teams
              </p>
              <div className="flex flex-wrap gap-1.5">
                {briefing.otherAgencies.map((a, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MISSION */}
      {briefing.mission && (
        <div className="space-y-1.5">
          <SmeacLabel letter="M" label="Mission" />
          <p className="text-sm whitespace-pre-wrap">{briefing.mission}</p>
        </div>
      )}

      {/* EXECUTION */}
      {(briefing.overallPlan ||
        briefing.actionsOn ||
        briefing.situationChange ||
        briefing.objectives.length > 0 ||
        briefing.teamSlots.length > 0 ||
        briefing.mapSnapshotUrl) && (
        <div className="space-y-3">
          <SmeacLabel letter="E" label="Execution" />
          {briefing.mapSnapshotUrl && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                Map snapshot
              </p>
              <img
                src={briefing.mapSnapshotUrl}
                alt="Map snapshot"
                className="w-full rounded-lg border border-border"
              />
            </div>
          )}
          {briefing.overallPlan && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Overall plan
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {briefing.overallPlan}
              </p>
            </div>
          )}
          {briefing.actionsOn && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Actions on
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {briefing.actionsOn}
              </p>
            </div>
          )}
          {briefing.situationChange && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Situation change
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {briefing.situationChange}
              </p>
            </div>
          )}
          {briefing.objectives.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                Objectives
              </p>
              <ol className="space-y-1">
                {briefing.objectives.map((o, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {o}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {briefing.teamSlots.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Users className="h-3 w-3" />
                Surveillance team
              </p>
              <div className="space-y-2">
                {briefing.teamSlots.map((slot, i) => {
                  const acked =
                    !!slot.cin && briefing.acknowledgedCins.includes(slot.cin);
                  const pillClass = !slot.cin
                    ? "bg-muted text-muted-foreground border-border"
                    : acked
                      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400"
                      : "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400";
                  return (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg border border-border bg-background"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${pillClass}`}
                          title={
                            !slot.cin
                              ? "Not linked to a user — acknowledgement can't be tracked"
                              : acked
                                ? "Acknowledged"
                                : "Not yet acknowledged"
                          }
                        >
                          {slot.cin && (
                            <span
                              className={`h-1.5 w-1.5 rounded-full shrink-0 ${acked ? "bg-emerald-500" : "bg-red-500"}`}
                            />
                          )}
                          {slot.name}
                        </span>
                        {slot.isTeamLeader && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            TL
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <TeamField label="Vehicle" value={slot.vehicle} />
                        <TeamField label="Foot" value={slot.foot} />
                        <TeamField label="Skill" value={slot.skill} />
                        <TeamField label="Kit" value={slot.kit} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADMINISTRATION & LOGISTICS */}
      {(briefing.legalAuthArrest ||
        briefing.afpOrders ||
        briefing.warrant ||
        briefing.accoutrements.length > 0 ||
        briefing.covertIdentifiers.length > 0 ||
        !briefing.firstAidAllVehicles) && (
        <div className="space-y-2.5">
          <SmeacLabel letter="A" label="Administration & Logistics" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {briefing.legalAuthArrest && (
              <AdminField
                label="Legal auth — arrest"
                value={briefing.legalAuthArrest}
              />
            )}
            {briefing.afpOrders && (
              <AdminField label="AFP Orders" value={briefing.afpOrders} />
            )}
            {briefing.warrant && (
              <AdminField label="Warrant" value={briefing.warrant} />
            )}
          </div>
          {briefing.accoutrements.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Accoutrements
              </p>
              <div className="flex flex-wrap gap-1.5">
                {briefing.accoutrements.map((a, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {briefing.covertIdentifiers.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Covert police identifier
              </p>
              <div className="flex flex-wrap gap-1.5">
                {briefing.covertIdentifiers.map((a, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs">
            {briefing.firstAidAllVehicles
              ? "First aid kit confirmed in all vehicles"
              : `First aid held by ${briefing.firstAidMemberName || "—"}`}
          </p>
        </div>
      )}

      {/* COMMAND & SIGNAL */}
      {(briefing.commsPrimary ||
        briefing.commsSecondary ||
        briefing.locationOfTeamLeader ||
        briefing.reportingProcedures ||
        briefing.teamSlots.some(s => s.isTeamLeader)) && (
        <div className="space-y-2.5">
          <SmeacLabel letter="C" label="Command & Signal" icon={Radio} />
          {briefing.teamSlots.some(s => s.isTeamLeader) && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Team leader
              </p>
              <p className="text-sm">
                {briefing.teamSlots.find(s => s.isTeamLeader)?.name}
              </p>
            </div>
          )}
          {briefing.locationOfTeamLeader && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Location of team leader
              </p>
              <p className="text-sm">{briefing.locationOfTeamLeader}</p>
            </div>
          )}
          {briefing.reportingProcedures && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                Reporting procedures
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {briefing.reportingProcedures}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {briefing.commsPrimary && (
              <AdminField label="Comms Primary" value={briefing.commsPrimary} />
            )}
            {briefing.commsSecondary && (
              <AdminField
                label="Comms Secondary"
                value={briefing.commsSecondary}
              />
            )}
          </div>
        </div>
      )}

      {briefing.postedAt && (
        <p className="text-xs text-muted-foreground">
          Posted by {briefing.postedByCIN} ·{" "}
          {format(new Date(briefing.postedAt), "d MMM yyyy, h:mm a")}
        </p>
      )}
    </div>
  );
}

function TeamField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium truncate">{value}</p>
    </div>
  );
}

function AdminField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
