/**
 * The UCO Surveillance Deployment Guide create/edit form — same shape as
 * SmeacBriefingForm (draft -> post & choose who to notify, editing a posted
 * guide never re-notifies on its own). Unlike SMEAC, most sections are a
 * fixed reference document (purpose, iSURV key, command & control) with a
 * handful of per-deployment fields layered on top, and the Notify picker is
 * two-tier: the active running sheet's roster pre-selected, everyone else
 * opt-in — see UcoGuideNotifyDialog below.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getLastActiveContext } from "@/lib/lastActiveContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { INTEL_CHIP_CLASSES } from "@/components/IntelEntityChip";
import { SmeacLabel } from "@/components/SmeacLabel";
import { formatIntelVehicle, formatIntelAddress } from "@/lib/addressFormat";
import { Eye, Plus, X, User, Car, MapPin, Send, Save } from "lucide-react";

const ACCOUTREMENT_OPTIONS = [
  "Firearm",
  "OC spray",
  "Taser",
  "Handcuffs / zipcuffs",
  "BSRV",
  "Portable radio / WAVE",
];
const MOE_OPTIONS = ["HUX", "RAM"];

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

export function UcoGuideForm({ briefingId }: { briefingId?: number }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const isEdit = briefingId != null;
  const existing = trpc.ucoGuide.getById.useQuery(
    { id: briefingId! },
    { enabled: isEdit }
  );

  const { data: operations } = trpc.operation.list.useQuery();
  const [operationId, setOperationId] = useState<number | null>(null);
  const { data: sheetsData } = trpc.sheet.listByOperation.useQuery(
    { operationId: operationId! },
    { enabled: operationId !== null }
  );
  const [sheetId, setSheetId] = useState<number | null>(null);

  const { data: opTargetsData } = trpc.target.list.useQuery(
    { operationId: operationId! },
    { enabled: operationId !== null }
  );
  const [targetId, setTargetId] = useState<number | null>(null);

  const [accoutrements, setAccoutrements] = useState<string[]>([]);
  const [moeEquipment, setMoeEquipment] = useState<string[]>([]);

  const [opBackground, setOpBackground] = useState("");
  const [opObjective, setOpObjective] = useState("");
  const [riskAssessment, setRiskAssessment] = useState("");
  const [ucoPhotoRef, setUcoPhotoRef] = useState("");
  const [ucoVehiclePhotoRef, setUcoVehiclePhotoRef] = useState("");
  const [ucoNames, setUcoNames] = useState("");

  const [planObjective, setPlanObjective] = useState("");
  const [planTimings, setPlanTimings] = useState("");
  const [planControllerLocation, setPlanControllerLocation] = useState("");
  const [planTracking, setPlanTracking] = useState("");
  const [planComms, setPlanComms] = useState("");
  const [planDangerSignal, setPlanDangerSignal] = useState("");
  const [planIngressEgress, setPlanIngressEgress] = useState("");
  const [planAuthorisedActions, setPlanAuthorisedActions] = useState("");

  const [teamLeaderCin, setTeamLeaderCin] = useState<string>("");
  const [seniorOperativeCin, setSeniorOperativeCin] = useState<string>("");
  const [huxCin, setHuxCin] = useState<string>("");
  const [ramCin, setRamCin] = useState<string>("");
  const [additionalMemberCins, setAdditionalMemberCins] = useState<string[]>([
    "",
  ]);
  const [tacticsNotes, setTacticsNotes] = useState("");

  const [currentLevel, setCurrentLevel] = useState(2);
  const [levelNotes, setLevelNotes] = useState<string[]>(["", "", "", "", ""]);

  const [commsVehiclePrimary, setCommsVehiclePrimary] = useState("");
  const [commsVehicleAlternate, setCommsVehicleAlternate] = useState("");
  const [commsFootPrimary, setCommsFootPrimary] = useState("");
  const [commsFootAlternate, setCommsFootAlternate] = useState("");
  const [commsNotes, setCommsNotes] = useState("");

  const usersQuery = trpc.opManager.listUsers.useQuery();
  const rosterQuery = trpc.ucoGuide.getRosterPrefill.useQuery(
    { sheetId: sheetId! },
    { enabled: sheetId !== null }
  );
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(
    new Set()
  );

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    if (isEdit) {
      if (!existing.data) return;
      const b = existing.data;
      setOperationId(b.operationId);
      setSheetId(b.sheetId ?? null);
      setTargetId(b.targetId ?? null);
      setAccoutrements(b.accoutrements ?? []);
      setMoeEquipment(b.moeEquipment ?? []);
      setOpBackground(b.opBackground ?? "");
      setOpObjective(b.opObjective ?? "");
      setRiskAssessment(b.riskAssessment ?? "");
      setUcoPhotoRef(b.ucoPhotoRef ?? "");
      setUcoVehiclePhotoRef(b.ucoVehiclePhotoRef ?? "");
      setUcoNames(b.ucoNames ?? "");
      setPlanObjective(b.planObjective ?? "");
      setPlanTimings(b.planTimings ?? "");
      setPlanControllerLocation(b.planControllerLocation ?? "");
      setPlanTracking(b.planTracking ?? "");
      setPlanComms(b.planComms ?? "");
      setPlanDangerSignal(b.planDangerSignal ?? "");
      setPlanIngressEgress(b.planIngressEgress ?? "");
      setPlanAuthorisedActions(b.planAuthorisedActions ?? "");
      setTeamLeaderCin(b.teamLeaderCin ?? "");
      setSeniorOperativeCin(b.seniorOperativeCin ?? "");
      setHuxCin(b.huxCin ?? "");
      setRamCin(b.ramCin ?? "");
      setAdditionalMemberCins(
        b.additionalMemberCins.length > 0 ? b.additionalMemberCins : [""]
      );
      setTacticsNotes(b.tacticsNotes ?? "");
      setCurrentLevel(b.currentLevel ?? 2);
      setLevelNotes(
        b.levelNotes.length === 5 ? b.levelNotes : ["", "", "", "", ""]
      );
      setCommsVehiclePrimary(b.commsVehiclePrimary ?? "");
      setCommsVehicleAlternate(b.commsVehicleAlternate ?? "");
      setCommsFootPrimary(b.commsFootPrimary ?? "");
      setCommsFootAlternate(b.commsFootAlternate ?? "");
      setCommsNotes(b.commsNotes ?? "");
      initializedRef.current = true;
    } else {
      const ctx = getLastActiveContext();
      if (ctx) {
        setOperationId(ctx.operationId);
        setSheetId(ctx.sheetId);
      }
      initializedRef.current = true;
    }
  }, [isEdit, existing.data]);

  const activeSheets =
    (sheetsData as any[] | undefined)?.filter(s => !s.deletedAt) ?? [];
  const opTargets = (opTargetsData as any[] | undefined) ?? [];
  const selectedTarget = opTargets.find(t => t.id === targetId);
  const rawVehicle = selectedTarget
    ? selectedTarget.v1f || selectedTarget.v1
    : null;
  const rawAddress = selectedTarget
    ? selectedTarget.hbf || selectedTarget.hb
    : null;

  const allUsers = (usersQuery.data as any[] | undefined) ?? [];
  const sortedUsers = [...allUsers].sort((a, b) =>
    (a.cin ?? "").localeCompare(b.cin ?? "", undefined, { numeric: true })
  );
  const roster = (rosterQuery.data as { cin: string; name: string }[]) ?? [];
  // Role dropdowns (Team Leader / SO / HUX / RAM) only offer whoever's on
  // the running sheet, plus anyone manually added below as an additional
  // team member — not every registered user, since a role must be filled
  // by someone actually on this deployment.
  const rosterCinSet = new Set(roster.map(r => r.cin.toUpperCase()));
  const additionalCinSet = new Set(
    additionalMemberCins.filter(Boolean).map(c => c.toUpperCase())
  );
  const roleSelectableUsers = sortedUsers.filter(
    u =>
      rosterCinSet.has((u.cin ?? "").toUpperCase()) ||
      additionalCinSet.has((u.cin ?? "").toUpperCase())
  );
  // The full "who was on this deployment" roster — running sheet roster plus
  // any manually-added members — separate from the four named roles above
  // (which are a subset of this) and used both as the document's team list
  // and as the Notify picker's default-selected set below.
  const deploymentTeamCins = Array.from(
    new Set(Array.from(rosterCinSet).concat(Array.from(additionalCinSet)))
  );
  const nameForCin = (cin: string) =>
    sortedUsers.find(u => (u.cin ?? "").toUpperCase() === cin)?.name ?? cin;

  const createMutation = trpc.ucoGuide.create.useMutation();
  const updateMutation = trpc.ucoGuide.update.useMutation();
  const postMutation = trpc.ucoGuide.post.useMutation();

  const buildPayload = () => ({
    operationId: operationId!,
    sheetId,
    targetId,
    accoutrements,
    moeEquipment,
    opBackground: opBackground.trim() || null,
    opObjective: opObjective.trim() || null,
    riskAssessment: riskAssessment.trim() || null,
    ucoPhotoRef: ucoPhotoRef.trim() || null,
    ucoVehiclePhotoRef: ucoVehiclePhotoRef.trim() || null,
    ucoNames: ucoNames.trim() || null,
    planObjective: planObjective.trim() || null,
    planTimings: planTimings.trim() || null,
    planControllerLocation: planControllerLocation.trim() || null,
    planTracking: planTracking.trim() || null,
    planComms: planComms.trim() || null,
    planDangerSignal: planDangerSignal.trim() || null,
    planIngressEgress: planIngressEgress.trim() || null,
    planAuthorisedActions: planAuthorisedActions.trim() || null,
    teamLeaderCin: teamLeaderCin || null,
    seniorOperativeCin: seniorOperativeCin || null,
    huxCin: huxCin || null,
    ramCin: ramCin || null,
    additionalMemberCins: additionalMemberCins.filter(Boolean),
    teamMemberCins: deploymentTeamCins,
    tacticsNotes: tacticsNotes.trim() || null,
    currentLevel,
    levelNotes,
    commsVehiclePrimary: commsVehiclePrimary.trim() || null,
    commsVehicleAlternate: commsVehicleAlternate.trim() || null,
    commsFootPrimary: commsFootPrimary.trim() || null,
    commsFootAlternate: commsFootAlternate.trim() || null,
    commsNotes: commsNotes.trim() || null,
  });

  const [saving, setSaving] = useState(false);
  const isPosted = isEdit && existing.data?.status === "posted";

  const saveDraft = async () => {
    if (!operationId) {
      toast.error("Choose an operation first");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: briefingId!,
          ...buildPayload(),
        });
        if (isPosted) {
          toast.success("Changes saved");
          setLocation(`/administration/uco-guide/${briefingId}`);
        } else {
          toast.success("Draft saved");
          utils.ucoGuide.getById.invalidate({ id: briefingId! });
        }
      } else {
        const { id } = await createMutation.mutateAsync(buildPayload());
        toast.success("Draft saved");
        setLocation(`/administration/uco-guide/${id}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const postGuide = async (userIds: number[]) => {
    if (!operationId) {
      toast.error("Choose an operation first");
      return;
    }
    setSaving(true);
    try {
      let id = briefingId;
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: briefingId!,
          ...buildPayload(),
        });
      } else {
        const created = await createMutation.mutateAsync(buildPayload());
        id = created.id;
      }
      const result = await postMutation.mutateAsync({ id: id!, userIds });
      toast.success(
        `${isPosted ? "Re-posted" : "Posted"} — notified ${result.notified} users`
      );
      setLocation(`/administration/uco-guide/${id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to post");
    } finally {
      setSaving(false);
    }
  };

  // Notify picker default: roster (primary) pre-selected, everyone else off.
  const rosterAppliedRef = useRef(false);
  const openNotifyDialog = () => {
    if (!operationId) {
      toast.error("Choose an operation first");
      return;
    }
    // Pre-select everyone on the deployment — running sheet roster plus any
    // manually-added members — not just the roster, so adding someone below
    // also puts them in the notify list by default.
    const teamCinSet = new Set(deploymentTeamCins);
    const preselectedIds = new Set(
      sortedUsers
        .filter(u => teamCinSet.has((u.cin ?? "").toUpperCase()))
        .map(u => u.id)
    );
    setSelectedUserIds(preselectedIds);
    setNotifyDialogOpen(true);
  };

  const handleConfirmNotify = () => {
    setNotifyDialogOpen(false);
    postGuide(Array.from(selectedUserIds));
  };

  if (isEdit && existing.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span>Administration</span>
          <span>/</span>
          <span>UCO Guide</span>
          <span>/</span>
          <span className="text-foreground font-medium">
            {isPosted ? "Edit" : isEdit ? "Edit draft" : "New"}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold">
            {isPosted
              ? "Edit UCO Surveillance Deployment Guide"
              : isEdit
                ? "UCO Surveillance Deployment Guide (draft)"
                : "New UCO Surveillance Deployment Guide"}
          </h1>
          <span
            className={
              isPosted
                ? "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                : "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-muted text-muted-foreground"
            }
          >
            {isPosted ? "Posted" : "Draft"}
          </span>
        </div>
      </div>

      {/* Operation / Sheet / Target context */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Operation">
            <Select
              value={operationId?.toString() ?? ""}
              onValueChange={v => {
                setOperationId(Number(v));
                setSheetId(null);
                setTargetId(null);
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Choose an operation…" />
              </SelectTrigger>
              <SelectContent>
                {(operations as any[] | undefined)?.map(op => (
                  <SelectItem key={op.id} value={op.id.toString()}>
                    {op.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Running sheet">
            <Select
              value={sheetId?.toString() ?? ""}
              onValueChange={v => setSheetId(Number(v))}
              disabled={!operationId}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Choose a running sheet…" />
              </SelectTrigger>
              <SelectContent>
                {activeSheets.map(s => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.title ?? `Sheet #${s.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <SmeacLabel letter="T" label="Target" icon={Eye} />
        <Field label="Linked target" compact>
          <Select
            value={targetId?.toString() ?? ""}
            onValueChange={v => setTargetId(Number(v))}
            disabled={!operationId}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Choose a target…" />
            </SelectTrigger>
            <SelectContent>
              {opTargets.map(t => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {selectedTarget && (
          <div className="flex flex-wrap gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${INTEL_CHIP_CLASSES.person}`}
            >
              <User className="w-3 h-3 shrink-0" />
              {selectedTarget.name}
            </span>
            {rawVehicle && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${INTEL_CHIP_CLASSES.vehicle}`}
              >
                <Car className="w-3 h-3 shrink-0" />
                {formatIntelVehicle(rawVehicle)}
              </span>
            )}
            {rawAddress && (
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${INTEL_CHIP_CLASSES.address}`}
              >
                <MapPin className="w-3 h-3 shrink-0" />
                {formatIntelAddress(rawAddress)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Information & Intelligence */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="1" label="Information & intelligence" />
        <p className="text-[11px] font-semibold text-muted-foreground -mt-1">
          Operation & target
        </p>
        <Field label="Operation background" compact>
          <Textarea
            value={opBackground}
            onChange={e => setOpBackground(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </Field>
        <Field label="Operation objective" compact>
          <Textarea
            value={opObjective}
            onChange={e => setOpObjective(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </Field>
        <Field
          label="Risk assessment"
          compact
          hint="Incl. target's knowledge of police and/or covert methodology"
        >
          <Textarea
            value={riskAssessment}
            onChange={e => setRiskAssessment(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </Field>
        <p className="text-[11px] font-semibold text-muted-foreground">UCO</p>
        <Field label="UCO photograph(s)" compact>
          <Input
            value={ucoPhotoRef}
            onChange={e => setUcoPhotoRef(e.target.value)}
            className="h-8 text-sm"
          />
        </Field>
        <Field label="UCO vehicle photograph(s)" compact>
          <Input
            value={ucoVehiclePhotoRef}
            onChange={e => setUcoVehiclePhotoRef(e.target.value)}
            className="h-8 text-sm"
          />
        </Field>
        <Field label="Name(s) used during deployment by the UCO" compact>
          <Input
            value={ucoNames}
            onChange={e => setUcoNames(e.target.value)}
            className="h-8 text-sm"
          />
        </Field>
      </div>

      {/* UCO Deployment Plan */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="2" label="UCO deployment plan" />
        <Field label="Objective" compact>
          <Textarea
            value={planObjective}
            onChange={e => setPlanObjective(e.target.value)}
            className="min-h-[50px] text-sm"
          />
        </Field>
        <Field label="Timings" compact>
          <Textarea
            value={planTimings}
            onChange={e => setPlanTimings(e.target.value)}
            className="min-h-[50px] text-sm"
          />
        </Field>
        <Field label="Controller location" compact>
          <Textarea
            value={planControllerLocation}
            onChange={e => setPlanControllerLocation(e.target.value)}
            className="min-h-[50px] text-sm"
          />
        </Field>
        <Field label="Tracking / iSURV" compact>
          <Textarea
            value={planTracking}
            onChange={e => setPlanTracking(e.target.value)}
            className="min-h-[50px] text-sm"
          />
        </Field>
        <Field label="Communications" compact>
          <Textarea
            value={planComms}
            onChange={e => setPlanComms(e.target.value)}
            className="min-h-[50px] text-sm"
          />
        </Field>
        <Field label="Warning / danger signal" compact>
          <Textarea
            value={planDangerSignal}
            onChange={e => setPlanDangerSignal(e.target.value)}
            className="min-h-[50px] text-sm"
          />
        </Field>
        <Field label="Ingress / egress routes" compact>
          <Textarea
            value={planIngressEgress}
            onChange={e => setPlanIngressEgress(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </Field>
        <Field label="UCO's authorised actions" compact>
          <Textarea
            value={planAuthorisedActions}
            onChange={e => setPlanAuthorisedActions(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </Field>
      </div>

      {/* iSURV icon key — static reference */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          iSURV icon key
        </p>
        <p className="text-xs text-muted-foreground">
          iSURV should be marked up with all relevant surveillance and tactical
          icons: target location (stronghold), Final Action Point (FAP),
          vehicle/foot ingress-egress, EB location, optical device, TCP, and UCO
          RV with controller post-deployment.
        </p>
      </div>

      {/* Surveillance team */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel
          letter="3"
          label="Surveillance team — tactics & structure"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <RoleSelect
            label="Team Leader"
            value={teamLeaderCin}
            onChange={setTeamLeaderCin}
            users={roleSelectableUsers}
          />
          <RoleSelect
            label="Senior Operative"
            value={seniorOperativeCin}
            onChange={setSeniorOperativeCin}
            users={roleSelectableUsers}
          />
          <RoleSelect
            label="HUX"
            value={huxCin}
            onChange={setHuxCin}
            users={roleSelectableUsers}
          />
          <RoleSelect
            label="RAM"
            value={ramCin}
            onChange={setRamCin}
            users={roleSelectableUsers}
          />
        </div>
        {roleSelectableUsers.length === 0 && (
          <p className="text-[11px] text-muted-foreground -mt-1">
            No running sheet roster loaded yet — choose an operation and running
            sheet above, or add a member below, to fill these roles.
          </p>
        )}
        <div>
          <label className="text-xs font-semibold block mb-2">
            Additional team members
          </label>
          <div className="space-y-2">
            {additionalMemberCins.map((cin, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-muted text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <Select
                  value={cin}
                  onValueChange={v => {
                    const next = [...additionalMemberCins];
                    next[i] = v;
                    setAdditionalMemberCins(next);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm flex-1">
                    <SelectValue placeholder="Choose a member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedUsers.map(u => (
                      <SelectItem key={u.id} value={u.cin ?? ""}>
                        {u.cin ?? "—"} — {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {additionalMemberCins.length > 1 && (
                  <button
                    onClick={() =>
                      setAdditionalMemberCins(
                        additionalMemberCins.filter((_, j) => j !== i)
                      )
                    }
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="Remove team member"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setAdditionalMemberCins([...additionalMemberCins, ""])
              }
              className="flex items-center gap-1.5 text-xs text-muted-foreground border border-dashed border-border rounded-md px-2.5 py-1.5 hover:bg-accent ml-7"
            >
              <Plus className="h-3 w-3" /> Add team member
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold mb-1.5">Team on deployment</p>
          {deploymentTeamCins.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {deploymentTeamCins.map(cin => (
                <span
                  key={cin}
                  className="px-2.5 py-1 rounded-full text-xs font-medium border border-border bg-muted"
                >
                  {nameForCin(cin)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No one yet — choose a running sheet, or add a member above.
            </p>
          )}
        </div>
        <Field label="Tactics notes" compact>
          <Textarea
            value={tacticsNotes}
            onChange={e => setTacticsNotes(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </Field>
      </div>

      {/* Equipment */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="4" label="Member accoutrements" />
        <EquipmentGroup
          options={ACCOUTREMENT_OPTIONS}
          selected={accoutrements}
          onChange={setAccoutrements}
        />
        <p className="text-[11px] font-semibold text-muted-foreground pt-1">
          MOE equipment
        </p>
        <EquipmentGroup
          options={MOE_OPTIONS}
          selected={moeEquipment}
          onChange={setMoeEquipment}
        />
      </div>

      {/* Surveillance level */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="5" label="Surveillance level" />
        <p className="text-xs text-muted-foreground -mt-1">
          Select the starting level — it can be upgraded or downgraded from the
          posted guide as the deployment progresses.
        </p>
        {LEVELS.map(lv => (
          <div
            key={lv.n}
            onClick={() => setCurrentLevel(lv.n)}
            className={`p-3 rounded-lg border cursor-pointer transition-colors ${
              currentLevel === lv.n
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-border hover:bg-accent/50"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <input
                type="radio"
                checked={currentLevel === lv.n}
                onChange={() => setCurrentLevel(lv.n)}
                className="accent-amber-600"
              />
              <span className="text-sm font-bold">
                {lv.n}. {lv.label}
              </span>
              <span
                className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${RISK_CLASSES[lv.risk]}`}
              >
                {lv.riskLabel}
              </span>
            </div>
            <p className="text-xs mb-1">{lv.desc}</p>
            <p className="text-[11px] italic text-muted-foreground mb-2">
              e.g. {lv.example}
            </p>
            {lv.warn && (
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-2">
                {lv.warn}
              </p>
            )}
            <Textarea
              value={levelNotes[lv.n - 1]}
              onChange={e => {
                const next = [...levelNotes];
                next[lv.n - 1] = e.target.value;
                setLevelNotes(next);
              }}
              onClick={e => e.stopPropagation()}
              placeholder="Additional information for this level…"
              className="min-h-[50px] text-sm bg-background"
            />
          </div>
        ))}
      </div>

      {/* Communication */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="6" label="Communication" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="AFP vehicle primary" compact>
            <Input
              value={commsVehiclePrimary}
              onChange={e => setCommsVehiclePrimary(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="AFP vehicle alternate" compact>
            <Input
              value={commsVehicleAlternate}
              onChange={e => setCommsVehicleAlternate(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="AFP foot primary" compact>
            <Input
              value={commsFootPrimary}
              onChange={e => setCommsFootPrimary(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="AFP foot alternate" compact>
            <Input
              value={commsFootAlternate}
              onChange={e => setCommsFootAlternate(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
        </div>
        <Field label="Additional guidance" compact>
          <Textarea
            value={commsNotes}
            onChange={e => setCommsNotes(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        </Field>
      </div>

      {/* Command & control — static reference */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Command & control
        </p>
        <p className="text-xs text-muted-foreground">
          UCO actions are decided by the UCO controller, communicated to the SU
          team via the SU TL. SU team actions are decided by the SU TL and SU
          SO. All information/observations go via primary or alternate channels
          and are monitored at the TCP for timely decisions.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-xl bg-card border border-amber-500/40 shadow-[0_0_0_3px_rgba(245,158,11,0.08)]">
        <div className="flex items-start gap-3">
          <Send className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold">
              {isPosted
                ? "Save changes, or re-notify"
                : "Post & choose who to notify"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              {isPosted
                ? "Save changes quietly, or re-post to send a fresh alert to whoever you choose."
                : "Choose who receives an immediate alert; they can acknowledge it from their notifications."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={saveDraft} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isPosted ? "Save changes" : "Save as draft"}
          </Button>
          <Button
            onClick={openNotifyDialog}
            disabled={saving}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {saving ? (
              <Spinner className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isPosted ? "Update & Re-notify" : "Post & Notify"}
          </Button>
        </div>
      </div>

      <UcoGuideNotifyDialog
        open={notifyDialogOpen}
        onOpenChange={setNotifyDialogOpen}
        roster={deploymentTeamCins.map(cin => ({ cin, name: nameForCin(cin) }))}
        users={sortedUsers}
        selectedUserIds={selectedUserIds}
        setSelectedUserIds={setSelectedUserIds}
        onConfirm={handleConfirmNotify}
        confirmLabel={isPosted ? "Update & Re-notify" : "Post & Notify"}
        saving={saving}
      />
    </div>
  );
}

function RoleSelect({
  label,
  value,
  onChange,
  users,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  users: any[];
}) {
  return (
    <Field label={label} compact>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="— none —" />
        </SelectTrigger>
        <SelectContent>
          {users.map(u => (
            <SelectItem key={u.id} value={u.cin ?? ""}>
              {u.cin ?? "—"} — {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function EquipmentGroup({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const allChecked = options.every(o => selected.includes(o));
  return (
    <div>
      <button
        type="button"
        onClick={() => onChange(allChecked ? [] : [...options])}
        className="text-[11px] font-semibold text-amber-600 hover:underline mb-1.5"
      >
        {allChecked ? "Clear all" : "Select all"}
      </button>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map(o => (
          <label
            key={o}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              checked={selected.includes(o)}
              onCheckedChange={checked => {
                if (checked) onChange([...selected, o]);
                else onChange(selected.filter(x => x !== o));
              }}
            />
            {o}
          </label>
        ))}
      </div>
    </div>
  );
}

function UcoGuideNotifyDialog({
  open,
  onOpenChange,
  roster,
  users,
  selectedUserIds,
  setSelectedUserIds,
  onConfirm,
  confirmLabel,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roster: { cin: string; name: string }[];
  users: any[];
  selectedUserIds: Set<number>;
  setSelectedUserIds: (fn: (prev: Set<number>) => Set<number>) => void;
  onConfirm: () => void;
  confirmLabel: string;
  saving: boolean;
}) {
  const rosterCins = new Set(roster.map(r => r.cin));
  const primaryUsers = users.filter(u =>
    rosterCins.has((u.cin ?? "").toUpperCase())
  );
  const secondaryUsers = users.filter(
    u => !rosterCins.has((u.cin ?? "").toUpperCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Select who to notify</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3 max-h-80 overflow-y-auto">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
              On this deployment
            </p>
            {primaryUsers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No running sheet roster or additional members yet — choose an
                operation and running sheet above, or add members in
                Surveillance team.
              </p>
            )}
            {primaryUsers.map(u => (
              <UserCheckboxRow
                key={u.id}
                user={u}
                checked={selectedUserIds.has(u.id)}
                onToggle={checked =>
                  setSelectedUserIds(prev => {
                    const next = new Set(prev);
                    if (checked) next.add(u.id);
                    else next.delete(u.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
              All other users
            </p>
            {secondaryUsers.map(u => (
              <UserCheckboxRow
                key={u.id}
                user={u}
                checked={selectedUserIds.has(u.id)}
                onToggle={checked =>
                  setSelectedUserIds(prev => {
                    const next = new Set(prev);
                    if (checked) next.add(u.id);
                    else next.delete(u.id);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={saving}
            className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Send className="h-3.5 w-3.5" />
            {confirmLabel} ({selectedUserIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserCheckboxRow({
  user,
  checked,
  onToggle,
}: {
  user: any;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox
        id={`uco-notify-user-${user.id}`}
        checked={checked}
        onCheckedChange={c => onToggle(!!c)}
      />
      <Label
        htmlFor={`uco-notify-user-${user.id}`}
        className="cursor-pointer flex items-center gap-2"
      >
        <span className="font-mono text-xs text-muted-foreground w-10">
          {user.cin ?? "—"}
        </span>
        <span>{user.name}</span>
      </Label>
    </div>
  );
}

function Field({
  label,
  compact,
  hint,
  children,
}: {
  label: string;
  compact?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className={
          compact
            ? "text-[11px] font-medium text-muted-foreground block mb-1"
            : "text-xs font-semibold block mb-1.5"
        }
      >
        {label}
      </label>
      {hint && (
        <p className="text-[10px] text-muted-foreground/80 mb-1">{hint}</p>
      )}
      {children}
    </div>
  );
}
