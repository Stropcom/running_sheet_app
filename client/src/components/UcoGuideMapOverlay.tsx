/**
 * The recipient-facing view of a POSTED UCO Surveillance Deployment Guide,
 * docked over the live Mapping page rather than replacing it — same pattern
 * as SmeacMapOverlay. Opened via `?ucoGuide=<id>` on /intelligence/mapping,
 * which is also what the guide's Post notification links to. Closing just
 * clears the query param — reopening is clicking the notification again.
 *
 * Unlike SMEAC, most of the document is a fixed reference (purpose, iSURV
 * key, command & control) rendered plainly and always open — there is
 * nothing to collapse, the panel just scrolls. The one live control is the
 * surveillance level tracker: any recipient can upgrade/downgrade it as the
 * deployment progresses, independent of acknowledgement.
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
  Eye,
  Pencil,
  Car,
  User,
  Users,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";

interface LevelDef {
  n: number;
  label: string;
  risk: "low" | "med" | "high";
  riskLabel: string;
  desc: string;
  example: string;
  warn?: string;
}
const LEVELS: LevelDef[] = [
  {
    n: 1,
    label: "Covert containment",
    risk: "low",
    riskLabel: "Low risk",
    desc: "Observations maintained on access points of the target location, containing the UCO and/or target.",
    example:
      "Observations maintained on the end of a vehicle or pedestrian access point to a location perimeter — but not a door to the building.",
  },
  {
    n: 2,
    label: "Covert entry/exit points",
    risk: "low",
    riskLabel: "Low/medium risk",
    desc: "Observations maintained on direct access points to the residence or building containing the UCO and/or target.",
    example:
      "Observations maintained directly on the front door of a house or business premises where the UCO is located or will be located.",
  },
  {
    n: 3,
    label: "Covert direct",
    risk: "med",
    riskLabel: "Medium/high risk",
    desc: "Observations maintained directly on the UCO and/or target.",
    example:
      "Direct line-of-sight observations of the UCO inside a café, hotel, or in a park.",
  },
  {
    n: 4,
    label: "Covert interaction",
    risk: "high",
    riskLabel: "High risk",
    desc: "A covert interaction/communication with the UCO — used to ascertain the risk status of the UCO if covert communications have failed and there is doubt about risk level or safety.",
    example:
      "Inside a pub with a high-risk target, communications failed, and the target appears to be becoming aggressive.",
    warn: "Know the name being used by the UCO, and have a cover story.",
  },
  {
    n: 5,
    label: "Overt interdiction",
    risk: "high",
    riskLabel: "High / imminent risk",
    desc: "Last-resort level — an imminent threat of danger to the safety of the UCO.",
    example:
      "The UCO indicates, via covert communications, an agreed danger signal or word.",
    warn: "Any interdiction must be conducted in accordance with Commissioner's Order 3 (CO3) and Operational Safety Assessment (OSA) training.",
  },
];
const RISK_CLASSES: Record<LevelDef["risk"], string> = {
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  med: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  high: "bg-red-500/15 text-red-700 dark:text-red-400",
};
// Follows the level's own risk colour rather than a fixed amber, so the
// current level stays unmistakable at every risk tier — a level 4/5 (red)
// current level doesn't get lost against its own already-red risk pill.
const RISK_TEXT_CLASSES: Record<LevelDef["risk"], string> = {
  low: "text-emerald-700 dark:text-emerald-400",
  med: "text-amber-700 dark:text-amber-400",
  high: "text-red-700 dark:text-red-400",
};
const LEVEL_HERO_CLASSES: Record<LevelDef["risk"], string> = {
  low: "border-emerald-500/60 bg-emerald-500/5",
  med: "border-amber-500/60 bg-amber-500/5",
  high: "border-red-500/60 bg-red-500/5",
};
const LEVEL_LADDER_ROW_CLASSES: Record<LevelDef["risk"], string> = {
  low: "bg-emerald-500/10",
  med: "bg-amber-500/10",
  high: "bg-red-500/10",
};
const LEVEL_LADDER_DOT_CLASSES: Record<LevelDef["risk"], string> = {
  low: "bg-emerald-500 text-white",
  med: "bg-amber-500 text-white",
  high: "bg-red-500 text-white",
};

export function UcoGuideMapOverlay({
  briefingId,
  onClose,
}: {
  briefingId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: guide, isLoading } = trpc.ucoGuide.getById.useQuery(
    { id: briefingId },
    { refetchInterval: 8000 }
  );
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);

  const acknowledge = trpc.ucoGuide.acknowledge.useMutation({
    onSuccess: ack => {
      setAcknowledgedAt(ack.acknowledgedAt);
      utils.ucoGuide.getById.invalidate({ id: briefingId });
    },
    onError: e => toast.error(e.message ?? "Failed to acknowledge"),
  });

  const setLevelMutation = trpc.ucoGuide.setLevel.useMutation({
    onSuccess: () => utils.ucoGuide.getById.invalidate({ id: briefingId }),
    onError: e => toast.error(e.message ?? "Failed to update level"),
  });

  const myAckAt = acknowledgedAt ?? guide?.myAcknowledgedAt ?? null;
  const rawVehicle = guide
    ? guide.voiOverride || guide.target?.v1f || guide.target?.v1
    : null;
  const rawAddress = guide
    ? guide.hbOverride || guide.target?.hbf || guide.target?.hb
    : null;

  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[440px] flex flex-col bg-card/97 backdrop-blur-sm border-l border-border shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Eye className="h-4 w-4 text-amber-500 shrink-0" />
        <h1 className="text-sm font-semibold flex-1 min-w-0 truncate">
          UCO Surveillance Deployment Guide
        </h1>
        {guide && (
          <span className="text-[10px] font-mono font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            Rev {guide.revision}
          </span>
        )}
        {user?.role === "admin" && guide && (
          <button
            onClick={() =>
              setLocation(`/administration/uco-guide/${guide.id}/edit`)
            }
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Edit guide"
            title="Edit guide"
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
        ) : !guide ? (
          <p className="p-5 text-sm text-muted-foreground">Guide not found.</p>
        ) : (
          <div className="p-5 space-y-4">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-card border border-border shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {guide.acknowledgedCount} acknowledged
            </span>

            {/* TARGET */}
            {(guide.target || guide.extraLocations.length > 0) && (
              <div className="space-y-1.5">
                <SmeacLabel letter="T" label="Target" icon={Eye} />
                <div className="flex flex-wrap gap-1.5">
                  {guide.target && (
                    <span
                      className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-medium border truncate ${INTEL_CHIP_CLASSES.person}`}
                    >
                      <User className="w-3 h-3 shrink-0" />
                      <span className="truncate">{guide.target.name}</span>
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
                  {rawAddress && (
                    <span
                      className={`inline-flex items-center gap-1.5 max-w-full px-3 py-1.5 rounded-full text-xs font-medium border truncate ${INTEL_CHIP_CLASSES.address}`}
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {formatIntelAddress(rawAddress)}
                      </span>
                    </span>
                  )}
                  {guide.extraLocations.map((loc, i) => (
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

            {/* PURPOSE & SCOPE — static reference */}
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Purpose & scope
              </h3>
              <p className="text-sm">
                Guide for Surveillance Unit (SU) deployment where an Under Cover
                Operative (UCO) is involved — safety and security of the UCO and
                SU, levels of covert response, and overt interdiction/recovery
                of the UCO.
              </p>
            </div>

            {/* INFORMATION & INTELLIGENCE */}
            <div className="space-y-2.5">
              <SmeacLabel letter="1" label="Information & intelligence" />
              <TextItem
                label="Operation background"
                value={guide.opBackground}
              />
              <TextItem label="Operation objective" value={guide.opObjective} />
              <TextItem label="Risk assessment" value={guide.riskAssessment} />
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <AdminField
                  label="UCO photograph(s)"
                  value={guide.ucoPhotoRef}
                />
                <AdminField
                  label="UCO vehicle photograph(s)"
                  value={guide.ucoVehiclePhotoRef}
                />
              </div>
              <TextItem
                label="Name(s) used by the UCO"
                value={guide.ucoNames}
              />
            </div>

            {/* UCO DEPLOYMENT PLAN */}
            <div className="space-y-2.5">
              <SmeacLabel letter="2" label="UCO deployment plan" />
              <TextItem label="Objective" value={guide.planObjective} />
              <TextItem label="Timings" value={guide.planTimings} />
              <TextItem
                label="Controller location"
                value={guide.planControllerLocation}
              />
              <TextItem label="Tracking / iSURV" value={guide.planTracking} />
              <TextItem label="Communications" value={guide.planComms} />
              <TextItem
                label="Warning / danger signal"
                value={guide.planDangerSignal}
              />
              <TextItem
                label="Ingress / egress routes"
                value={guide.planIngressEgress}
              />
              <TextItem
                label="UCO's authorised actions"
                value={guide.planAuthorisedActions}
              />
            </div>

            {/* iSURV ICON KEY — static reference */}
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                iSURV icon key
              </h3>
              <p className="text-sm">
                Mark up target location (stronghold), Final Action Point (FAP),
                vehicle/foot ingress-egress, EB location, optical device, TCP,
                and the UCO RV with controller post-deployment.
              </p>
            </div>

            {/* SURVEILLANCE TEAM */}
            <div className="space-y-2.5">
              <SmeacLabel
                letter="3"
                label="Surveillance team — tactics & structure"
                icon={Users}
              />
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <RolePill
                  label="Team Leader"
                  value={guide.teamLeaderCin}
                  acknowledgedCins={guide.acknowledgedCins}
                />
                <RolePill
                  label="Senior Operative"
                  value={guide.seniorOperativeCin}
                  acknowledgedCins={guide.acknowledgedCins}
                />
                <RolePill
                  label="HUX"
                  value={guide.huxCin}
                  acknowledgedCins={guide.acknowledgedCins}
                />
                <RolePill
                  label="RAM"
                  value={guide.ramCin}
                  acknowledgedCins={guide.acknowledgedCins}
                />
              </div>
              {guide.teamMemberCins.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1">
                    Team on deployment
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {guide.teamMemberCins.map((cin, i) => {
                      const acked = guide.acknowledgedCins.includes(cin);
                      return (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            acked
                              ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400"
                              : "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400"
                          }`}
                          title={
                            acked ? "Acknowledged" : "Not yet acknowledged"
                          }
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full shrink-0 ${acked ? "bg-emerald-500" : "bg-red-500"}`}
                          />
                          {cin}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <TextItem label="Tactics notes" value={guide.tacticsNotes} />
            </div>

            {/* EQUIPMENT */}
            <div className="space-y-2.5">
              <SmeacLabel letter="4" label="Member accoutrements / equipment" />
              {guide.accoutrements.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {guide.accoutrements.map((a, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">None selected.</p>
              )}
              <p className="text-[11px] font-semibold text-muted-foreground">
                MOE equipment
              </p>
              {guide.moeEquipment.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {guide.moeEquipment.map((a, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">None selected.</p>
              )}
            </div>

            {/* SURVEILLANCE LEVEL — the one live control */}
            <div className="space-y-2.5">
              <SmeacLabel letter="5" label="Surveillance level" />
              <CurrentLevelHero
                level={LEVELS.find(l => l.n === guide.currentLevel)!}
                note={guide.levelNotes[guide.currentLevel - 1]}
                canUpgrade={guide.currentLevel < 5}
                canDowngrade={guide.currentLevel > 1}
                onUpgrade={() =>
                  setLevelMutation.mutate({
                    id: guide.id,
                    level: Math.min(5, guide.currentLevel + 1),
                  })
                }
                onDowngrade={() =>
                  setLevelMutation.mutate({
                    id: guide.id,
                    level: Math.max(1, guide.currentLevel - 1),
                  })
                }
              />
              <LevelLadder
                currentLevel={guide.currentLevel}
                levelNotes={guide.levelNotes}
              />
            </div>

            {/* COMMUNICATION */}
            <div className="space-y-2.5">
              <SmeacLabel letter="6" label="Communication" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <AdminField
                  label="AFP vehicle primary"
                  value={guide.commsVehiclePrimary}
                />
                <AdminField
                  label="AFP vehicle alternate"
                  value={guide.commsVehicleAlternate}
                />
                <AdminField
                  label="AFP foot primary"
                  value={guide.commsFootPrimary}
                />
                <AdminField
                  label="AFP foot alternate"
                  value={guide.commsFootAlternate}
                />
              </div>
              <TextItem label="Additional guidance" value={guide.commsNotes} />
            </div>

            {/* COMMAND & CONTROL — static reference */}
            <div className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Command & control
              </h3>
              <p className="text-sm">
                UCO actions are decided by the UCO controller, communicated to
                the SU team via the SU TL. SU team actions are decided by the SU
                TL and SU SO. All information/observations go via primary or
                alternate channels and are monitored at the TCP for timely
                decisions.
              </p>
            </div>

            {guide.postedAt && (
              <p className="text-xs text-muted-foreground">
                Posted by {guide.postedByCIN} ·{" "}
                {format(new Date(guide.postedAt), "d MMM yyyy, h:mm a")}
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
                  onClick={() => acknowledge.mutate({ id: guide.id })}
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

// The current surveillance level, pinned above the compact ladder in full
// detail — the level's own risk colour marks it as current, rather than a
// fixed highlight colour that gets lost against an already-red level 4/5.
function CurrentLevelHero({
  level,
  note,
  canUpgrade,
  canDowngrade,
  onUpgrade,
  onDowngrade,
}: {
  level: LevelDef;
  note: string;
  canUpgrade: boolean;
  canDowngrade: boolean;
  onUpgrade: () => void;
  onDowngrade: () => void;
}) {
  return (
    <div
      className={`rounded-lg border-2 p-3 ${LEVEL_HERO_CLASSES[level.risk]}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={`text-[9px] font-bold uppercase tracking-wide ${RISK_TEXT_CLASSES[level.risk]}`}
        >
          Current surveillance level
        </span>
        <div className="ml-auto flex flex-col gap-0.5">
          <button
            onClick={onUpgrade}
            disabled={!canUpgrade}
            className="h-5 w-6 flex items-center justify-center rounded border border-border bg-background hover:bg-accent disabled:opacity-30"
            title="Upgrade"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            onClick={onDowngrade}
            disabled={!canDowngrade}
            className="h-5 w-6 flex items-center justify-center rounded border border-border bg-background hover:bg-accent disabled:opacity-30"
            title="Downgrade"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold">
          {level.n}. {level.label}
        </span>
        <span
          className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${RISK_CLASSES[level.risk]}`}
        >
          {level.riskLabel}
        </span>
      </div>
      <p className="text-xs mb-1">{level.desc}</p>
      <p className="text-[11px] italic text-muted-foreground mb-1">
        e.g. {level.example}
      </p>
      {level.warn && (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-1">
          {level.warn}
        </p>
      )}
      {note && <p className="text-xs mt-1">{note}</p>}
    </div>
  );
}

// The other four levels, collapsed to a single line each — "current" is
// which level has the full-detail hero above, not something to spot in a
// list of otherwise-identical cards. A level with its own note still shows
// it (deployment-specific guidance shouldn't be hidden), just indented
// under its row instead of duplicating the hero's full layout.
function LevelLadder({
  currentLevel,
  levelNotes,
}: {
  currentLevel: number;
  levelNotes: string[];
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {LEVELS.map((lv, i) => {
        const isCurrent = lv.n === currentLevel;
        const note = isCurrent ? "" : levelNotes[lv.n - 1];
        return (
          <div
            key={lv.n}
            className={`px-2.5 py-1.5 ${i > 0 ? "border-t border-border" : ""} ${
              isCurrent ? LEVEL_LADDER_ROW_CLASSES[lv.risk] : "bg-background"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  isCurrent
                    ? LEVEL_LADDER_DOT_CLASSES[lv.risk]
                    : "border border-border text-muted-foreground"
                }`}
              >
                {lv.n}
              </span>
              <span
                className={`text-xs flex-1 min-w-0 truncate ${
                  isCurrent ? "font-semibold" : "text-muted-foreground"
                }`}
              >
                {lv.label}
              </span>
              <span
                className={`text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                  isCurrent
                    ? RISK_TEXT_CLASSES[lv.risk]
                    : "text-muted-foreground/70"
                }`}
              >
                {lv.riskLabel}
              </span>
            </div>
            {note && (
              <p className="text-[11px] text-muted-foreground mt-1 pl-6">
                {note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TextItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function AdminField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function RolePill({
  label,
  value,
  acknowledgedCins,
}: {
  label: string;
  value: string | null;
  acknowledgedCins: string[];
}) {
  if (!value) return null;
  const acked = acknowledgedCins.includes(value);
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground mb-1">
        {label}
      </p>
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
          acked
            ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400"
            : "bg-red-500/15 text-red-700 border-red-500/40 dark:text-red-400"
        }`}
        title={acked ? "Acknowledged" : "Not yet acknowledged"}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${acked ? "bg-emerald-500" : "bg-red-500"}`}
        />
        {value}
      </span>
    </div>
  );
}
