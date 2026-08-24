/**
 * The recipient-facing view of a POSTED SMEAC briefing, docked over the
 * live Mapping page rather than replacing it — so the officer can read the
 * briefing while the real map (with its full markers, team tags, etc.)
 * keeps running underneath/beside it. Opened via `?smeac=<id>` on
 * /intelligence/mapping (see IntelligenceMapping.tsx), which is also what
 * the SMEAC "Post" notification links to. Closing just clears the query
 * param — reopening is clicking the notification again, or the list page.
 *
 * Mirrors SmeacBriefingForm's SMEAC section structure (via the shared
 * SmeacLabel) so the read view and the edit view read as the same
 * document. Editing only happens from the Administration list page, not
 * from here — this panel is read + acknowledge only.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { INTEL_CHIP_CLASSES } from "@/components/IntelEntityChip";
import { SmeacLabel } from "@/components/SmeacLabel";
import { formatIntelVehicle, formatIntelAddress } from "@/lib/addressFormat";
import {
  X,
  MapPin,
  Check,
  ShieldAlert,
  Pencil,
  Car,
  User,
  Users,
  Radio,
} from "lucide-react";
import { format } from "date-fns";

export function SmeacMapOverlay({
  briefingId,
  onClose,
}: {
  briefingId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  // Polled while open so a team member's pill turns green for everyone
  // watching as acknowledgements come in, not just on their own action.
  const { data: briefing, isLoading } = trpc.smeacBriefing.getById.useQuery(
    { id: briefingId },
    { refetchInterval: 8000 }
  );
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);

  const acknowledge = trpc.smeacBriefing.acknowledge.useMutation({
    onSuccess: ack => {
      setAcknowledgedAt(ack.acknowledgedAt);
      utils.smeacBriefing.getById.invalidate({ id: briefingId });
    },
    onError: e => toast.error(e.message ?? "Failed to acknowledge"),
  });

  const myAckAt = acknowledgedAt ?? briefing?.myAcknowledgedAt ?? null;
  const rawHome = briefing
    ? briefing.hbOverride || briefing.target?.hbf || briefing.target?.hb
    : null;
  const rawVehicle = briefing
    ? briefing.voiOverride || briefing.target?.v1f || briefing.target?.v1
    : null;

  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[420px] flex flex-col bg-card/97 backdrop-blur-sm border-l border-border shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
        <h1 className="text-sm font-semibold flex-1 min-w-0 truncate">
          {briefing ? `SMEAC — ${briefing.operationName}` : "SMEAC"}
        </h1>
        {briefing && (
          <span className="text-[10px] font-mono font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            Rev {briefing.revision}
          </span>
        )}
        {user?.role === "admin" && briefing && (
          <button
            onClick={() =>
              setLocation(`/administration/smeac/${briefing.id}/edit`)
            }
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Edit briefing"
            title="Edit briefing"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Close"
          title="Close — reopen from Notifications"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !briefing ? (
          <p className="p-5 text-sm text-muted-foreground">
            Briefing not found.
          </p>
        ) : (
          <div className="p-5 space-y-4">
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
                      <span className="truncate">
                        {formatIntelAddress(rawHome)}
                      </span>
                    </span>
                  )}
                  {briefing.extraLocations.map((loc, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-medium border truncate ${INTEL_CHIP_CLASSES.address}`}
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {formatIntelAddress(loc)}
                      </span>
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
                    <p className="text-sm">{briefing.backgroundIntel}</p>
                  </div>
                )}
                {briefing.knownRisks && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                      Known risks or threats
                    </p>
                    <p className="text-sm">{briefing.knownRisks}</p>
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
                <p className="text-sm">{briefing.mission}</p>
              </div>
            )}

            {/* EXECUTION */}
            {(briefing.overallPlan ||
              briefing.actionsOn ||
              briefing.situationChange ||
              briefing.objectives.length > 0 ||
              briefing.teamSlots.length > 0) && (
              <div className="space-y-3">
                <SmeacLabel letter="E" label="Execution" />
                {briefing.overallPlan && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                      Overall plan
                    </p>
                    <p className="text-sm">{briefing.overallPlan}</p>
                  </div>
                )}
                {briefing.actionsOn && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                      Actions on
                    </p>
                    <p className="text-sm">{briefing.actionsOn}</p>
                  </div>
                )}
                {briefing.situationChange && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                      Situation change
                    </p>
                    <p className="text-sm">{briefing.situationChange}</p>
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
                          <span className="text-muted-foreground">
                            {i + 1}.
                          </span>
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
                          !!slot.cin &&
                          briefing.acknowledgedCins.includes(slot.cin);
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
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium border transition-colors ${pillClass}`}
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
                    <p className="text-sm">{briefing.reportingProcedures}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {briefing.commsPrimary && (
                    <AdminField
                      label="Comms Primary"
                      value={briefing.commsPrimary}
                    />
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

            <div className="pt-2">
              {myAckAt ? (
                <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-muted text-sm font-semibold">
                  <Check className="h-4 w-4 text-emerald-600" />
                  Acknowledged · {format(new Date(myAckAt), "h:mm a")}
                </div>
              ) : (
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => acknowledge.mutate({ id: briefing.id })}
                  disabled={acknowledge.isPending}
                >
                  {acknowledge.isPending ? (
                    <Spinner className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Acknowledge
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                Close anytime — reopen from Notifications
              </p>
            </div>
          </div>
        )}
      </div>
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
