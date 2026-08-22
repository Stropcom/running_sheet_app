/**
 * The STOSEC Briefing create/edit form — used for a brand-new draft (no
 * briefingId), a not-yet-posted draft (briefingId set, status "draft"), and
 * re-editing an already-posted briefing (briefingId set, status "posted",
 * reached via the /edit route). Editing a posted briefing never re-notifies
 * on its own — "Save changes" only updates content; re-notifying everyone
 * is the separate, deliberate "Update & Re-notify" action.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INTEL_CHIP_CLASSES } from "@/components/IntelEntityChip";
import { SmeacLabel } from "@/components/SmeacLabel";
import { formatIntelVehicle, formatIntelAddress } from "@/lib/addressFormat";
import {
  ShieldAlert,
  Plus,
  X,
  User,
  Car,
  MapPin,
  Send,
  Save,
  Users,
  Radio,
} from "lucide-react";

interface TeamSlot {
  name: string;
  vehicle: string;
  foot: string;
  skill: string;
  kit: string;
  isTeamLeader: boolean;
}

const EMPTY_SLOT: TeamSlot = {
  name: "",
  vehicle: "",
  foot: "",
  skill: "",
  kit: "",
  isTeamLeader: false,
};

export function StosecBriefingForm({ briefingId }: { briefingId?: number }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const isEdit = briefingId != null;
  const existing = trpc.stosecBriefing.getById.useQuery(
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

  const [targetId, setTargetId] = useState<number | null>(null);
  const [voiOverride, setVoiOverride] = useState("");
  const [hbOverride, setHbOverride] = useState("");
  // Targets, vehicles, and locations are all scoped to the chosen operation
  // — an operation can have several targets, each with several vehicles and
  // addresses, and the urgent detail isn't always the primary target's own.
  const { data: opTargetsData } = trpc.target.list.useQuery(
    { operationId: operationId! },
    { enabled: operationId !== null }
  );

  const [situation, setSituation] = useState("");
  const [mission, setMission] = useState("");
  const [objectives, setObjectives] = useState<string[]>([""]);

  const [legalAuthArrest, setLegalAuthArrest] = useState("Crimes Act 1914");
  const [afpOrders, setAfpOrders] = useState("");
  const [warrant, setWarrant] = useState("");
  const [commsPrimary, setCommsPrimary] = useState("");
  const [commsSecondary, setCommsSecondary] = useState("");

  const [teamSlots, setTeamSlots] = useState<TeamSlot[]>([]);

  // Only apply defaults / server data once, so a background refetch never
  // clobbers what the officer is actively typing.
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    if (isEdit) {
      if (!existing.data) return;
      const b = existing.data;
      setOperationId(b.operationId);
      setSheetId(b.sheetId ?? null);
      setTargetId(b.targetId ?? null);
      setVoiOverride(b.voiOverride ?? "");
      setHbOverride(b.hbOverride ?? "");
      setSituation(b.situation ?? "");
      setMission(b.mission ?? "");
      setObjectives(b.objectives.length > 0 ? b.objectives : [""]);
      setLegalAuthArrest(b.legalAuthArrest ?? "");
      setAfpOrders(b.afpOrders ?? "");
      setWarrant(b.warrant ?? "");
      setCommsPrimary(b.commsPrimary ?? "");
      setCommsSecondary(b.commsSecondary ?? "");
      setTeamSlots(b.teamSlots.length > 0 ? b.teamSlots : []);
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

  // Auto-populate the team roster from the sheet once, on first load of a
  // new briefing — never overwrites slots the officer has already edited.
  const autoRosterAppliedRef = useRef(false);
  useEffect(() => {
    if (isEdit || autoRosterAppliedRef.current) return;
    if (!sheetId || teamSlots.length > 0) return;
    autoRosterAppliedRef.current = true;
    utils.stosecBriefing.getRosterPrefill
      .fetch({ sheetId })
      .then(slots => {
        if (slots.length > 0) setTeamSlots(slots);
      })
      .catch(() => {});
  }, [isEdit, sheetId, teamSlots.length, utils]);

  const activeSheets =
    (sheetsData as any[] | undefined)?.filter(s => !s.deletedAt) ?? [];
  const opTargets = (opTargetsData as any[] | undefined) ?? [];
  const selectedTarget = opTargets.find(t => t.id === targetId);

  interface FlatOption {
    value: string;
    label: string;
    sourceLabel: string;
  }
  function parseJsonArray(raw: string | null | undefined): any[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const vehicleOptions: FlatOption[] = [];
  const locationOptions: FlatOption[] = [];
  opTargets.forEach(t => {
    const vehicles = [
      ...(t.v1f || t.v1 ? [{ full: t.v1f, short: t.v1 }] : []),
      ...parseJsonArray(t.extraVehicles),
    ];
    vehicles.forEach((v, i) => {
      const label = v.full || v.short;
      if (!label) return;
      vehicleOptions.push({
        value: `${t.id}__${i}__${label}`,
        label,
        sourceLabel: t.name,
      });
    });
    const addresses = [
      ...(t.hbf || t.hb ? [{ full: t.hbf, short: t.hb }] : []),
      ...parseJsonArray(t.extraAddresses),
    ];
    addresses.forEach((a, i) => {
      const label = a.full || a.short;
      if (!label) return;
      locationOptions.push({
        value: `${t.id}__${i}__${label}`,
        label,
        sourceLabel: t.name,
      });
    });
  });

  const createMutation = trpc.stosecBriefing.create.useMutation();
  const updateMutation = trpc.stosecBriefing.update.useMutation();
  const postMutation = trpc.stosecBriefing.post.useMutation();

  const buildPayload = () => ({
    operationId: operationId!,
    sheetId,
    targetId,
    voiOverride: voiOverride.trim() || null,
    hbOverride: hbOverride.trim() || null,
    situation: situation.trim() || null,
    mission: mission.trim() || null,
    objectives: objectives.map(o => o.trim()).filter(Boolean),
    legalAuthArrest: legalAuthArrest.trim() || null,
    afpOrders: afpOrders.trim() || null,
    warrant: warrant.trim() || null,
    commsPrimary: commsPrimary.trim() || null,
    commsSecondary: commsSecondary.trim() || null,
    teamSlots,
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
          setLocation(`/administration/stosec/${briefingId}`);
        } else {
          toast.success("Draft saved");
          utils.stosecBriefing.getById.invalidate({ id: briefingId! });
        }
      } else {
        const { id } = await createMutation.mutateAsync(buildPayload());
        toast.success("Draft saved");
        setLocation(`/administration/stosec/${id}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const postBriefing = async () => {
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
      const result = await postMutation.mutateAsync({ id: id! });
      toast.success(
        `${isPosted ? "Re-posted" : "Posted"} — notified ${result.notified} users`
      );
      setLocation(`/administration/stosec/${id}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to post");
    } finally {
      setSaving(false);
    }
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
          <span>STOSEC Briefings</span>
          <span>/</span>
          <span className="text-foreground font-medium">
            {isPosted ? "Edit" : isEdit ? "Edit draft" : "New"}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold">
            {isPosted
              ? "Edit STOSEC Briefing"
              : isEdit
                ? "STOSEC Briefing (draft)"
                : "New STOSEC Briefing"}
          </h1>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-600 border border-amber-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Exceptional use only
          </span>
          {isEdit && existing.data && (
            <span className="text-[10px] font-mono font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5">
              Rev {existing.data.revision}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2.5 p-3 rounded-lg bg-card border border-border border-l-2 border-l-amber-500 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground">
            Reserved for urgent, exceptional circumstances
          </strong>{" "}
          — posting immediately notifies every signed-in user. The day-to-day
          tasking board is in Operation Manager.
        </div>
      </div>

      {/* Operation */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <Field label="Operation" compact>
          <Select
            value={operationId != null ? String(operationId) : ""}
            onValueChange={val => {
              setOperationId(Number(val));
              setSheetId(null);
              setTargetId(null);
              setVoiOverride("");
              setHbOverride("");
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Choose operation…" />
            </SelectTrigger>
            <SelectContent>
              {(operations as any[] | undefined)?.map(op => (
                <SelectItem key={op.id} value={String(op.id)}>
                  {op.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Running sheet (used to pull today's team roster)" compact>
          <Select
            value={sheetId != null ? String(sheetId) : ""}
            onValueChange={val => setSheetId(Number(val))}
            disabled={operationId == null}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Choose running sheet…" />
            </SelectTrigger>
            <SelectContent>
              {activeSheets.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.title || `Sheet #${s.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* SITUATION */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="S" label="Situation" />

        {operationId == null ? (
          <p className="text-xs text-muted-foreground">
            Choose an operation to see its targets, vehicles, and locations.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Field label="Person of interest" compact>
              <Select
                value={targetId != null ? String(targetId) : "__none__"}
                onValueChange={val => {
                  setTargetId(val === "__none__" ? null : Number(val));
                  setVoiOverride("");
                  setHbOverride("");
                }}
              >
                <SelectTrigger
                  className={`h-8 text-xs font-medium rounded-full border w-full ${INTEL_CHIP_CLASSES.person}`}
                >
                  <User className="h-3 w-3 mr-1 shrink-0" />
                  <SelectValue placeholder="None linked" className="truncate">
                    {selectedTarget
                      ? selectedTarget.tgt || selectedTarget.name
                      : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None linked</SelectItem>
                  {opTargets.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.tgt || t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Vehicle of interest" compact>
              <Select
                value={
                  voiOverride
                    ? (vehicleOptions.find(o => o.label === voiOverride)
                        ?.value ?? "__default__")
                    : "__default__"
                }
                onValueChange={val => {
                  if (val === "__default__") {
                    setVoiOverride("");
                    return;
                  }
                  const opt = vehicleOptions.find(o => o.value === val);
                  if (opt) setVoiOverride(opt.label);
                }}
                disabled={vehicleOptions.length === 0}
              >
                <SelectTrigger
                  className={`h-8 text-xs font-medium rounded-full border w-full ${INTEL_CHIP_CLASSES.vehicle}`}
                >
                  <Car className="h-3 w-3 mr-1 shrink-0" />
                  <SelectValue placeholder="None" className="truncate">
                    {(() => {
                      const raw =
                        voiOverride ||
                        selectedTarget?.v1f ||
                        selectedTarget?.v1;
                      return raw ? formatIntelVehicle(raw) : undefined;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    {selectedTarget && (selectedTarget.v1f || selectedTarget.v1)
                      ? `Target's own — ${formatIntelVehicle(selectedTarget.v1f || selectedTarget.v1)}`
                      : "None"}
                  </SelectItem>
                  {vehicleOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {formatIntelVehicle(o.label)} ({o.sourceLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Location" compact>
              <Select
                value={
                  hbOverride
                    ? (locationOptions.find(o => o.label === hbOverride)
                        ?.value ?? "__default__")
                    : "__default__"
                }
                onValueChange={val => {
                  if (val === "__default__") {
                    setHbOverride("");
                    return;
                  }
                  const opt = locationOptions.find(o => o.value === val);
                  if (opt) setHbOverride(opt.label);
                }}
                disabled={locationOptions.length === 0}
              >
                <SelectTrigger
                  className={`h-8 text-xs font-medium rounded-full border w-full ${INTEL_CHIP_CLASSES.address}`}
                >
                  <MapPin className="h-3 w-3 mr-1 shrink-0" />
                  <SelectValue placeholder="None" className="truncate">
                    {(() => {
                      const raw =
                        hbOverride || selectedTarget?.hbf || selectedTarget?.hb;
                      return raw ? formatIntelAddress(raw) : undefined;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    {selectedTarget && (selectedTarget.hbf || selectedTarget.hb)
                      ? `Target's own — ${formatIntelAddress(selectedTarget.hbf || selectedTarget.hb)}`
                      : "None"}
                  </SelectItem>
                  {locationOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {formatIntelAddress(o.label)} ({o.sourceLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <Field label="Situation" compact>
          <Textarea
            value={situation}
            onChange={e => setSituation(e.target.value)}
            placeholder="Brief the circumstances that make this urgent…"
            className="min-h-[70px] text-sm"
          />
        </Field>
      </div>

      {/* MISSION */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="M" label="Mission" />
        <Textarea
          value={mission}
          onChange={e => setMission(e.target.value)}
          placeholder="State the mission in one or two sentences…"
          className="min-h-[70px] text-sm"
        />
      </div>

      {/* EXECUTION */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-4">
        <SmeacLabel letter="E" label="Execution" />

        <div>
          <label className="text-xs font-semibold block mb-2">Objectives</label>
          <div className="space-y-2">
            {objectives.map((obj, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-muted text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <Input
                  value={obj}
                  onChange={e => {
                    const next = [...objectives];
                    next[i] = e.target.value;
                    setObjectives(next);
                  }}
                  placeholder="Add an objective…"
                  className="h-8 text-sm"
                />
                {objectives.length > 1 && (
                  <button
                    onClick={() =>
                      setObjectives(objectives.filter((_, j) => j !== i))
                    }
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="Remove objective"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setObjectives([...objectives, ""])}
              className="flex items-center gap-1.5 text-xs text-muted-foreground border border-dashed border-border rounded-md px-2.5 py-1.5 hover:bg-accent ml-7"
            >
              <Plus className="h-3 w-3" /> Add objective
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Surveillance team
            </label>
            <button
              onClick={() => {
                if (!sheetId) return;
                utils.stosecBriefing.getRosterPrefill
                  .fetch({ sheetId })
                  .then(slots => setTeamSlots(slots))
                  .catch(() => toast.error("Couldn't load roster"));
              }}
              disabled={!sheetId}
              className="text-xs text-primary font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Populate from roster
            </button>
          </div>

          <div className="space-y-2">
            {teamSlots.map((slot, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-border bg-background space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={slot.name}
                    onChange={e => {
                      const next = [...teamSlots];
                      next[i] = { ...next[i], name: e.target.value };
                      setTeamSlots(next);
                    }}
                    placeholder="Name"
                    className="h-8 text-sm font-medium flex-1"
                  />
                  <button
                    onClick={() => {
                      const next = [...teamSlots];
                      next[i] = {
                        ...next[i],
                        isTeamLeader: !next[i].isTeamLeader,
                      };
                      setTeamSlots(next);
                    }}
                    className={`shrink-0 h-8 px-2.5 rounded-md text-[10px] font-bold uppercase tracking-wide border transition-colors ${
                      slot.isTeamLeader
                        ? "bg-amber-500/15 text-amber-600 border-amber-500/40 dark:text-amber-400"
                        : "text-muted-foreground border-border hover:bg-accent"
                    }`}
                    title="Toggle Team Leader"
                  >
                    TL
                  </button>
                  <button
                    onClick={() =>
                      setTeamSlots(teamSlots.filter((_, j) => j !== i))
                    }
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove team member"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["vehicle", "foot", "skill", "kit"] as const).map(field => (
                    <Field
                      key={field}
                      label={field[0].toUpperCase() + field.slice(1)}
                      compact
                    >
                      <Input
                        value={slot[field]}
                        onChange={e => {
                          const next = [...teamSlots];
                          next[i] = { ...next[i], [field]: e.target.value };
                          setTeamSlots(next);
                        }}
                        placeholder="—"
                        className="h-8 text-sm"
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => setTeamSlots([...teamSlots, { ...EMPTY_SLOT }])}
            className="flex items-center gap-1.5 text-xs text-muted-foreground border border-dashed border-border rounded-md px-2.5 py-1.5 hover:bg-accent mt-2"
          >
            <Plus className="h-3 w-3" /> Add team member
          </button>
        </div>
      </div>

      {/* ADMINISTRATION & LOGISTICS */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="A" label="Administration & Logistics" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <Field label="Legal auth — arrest" compact>
            <Input
              value={legalAuthArrest}
              onChange={e => setLegalAuthArrest(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="AFP Orders" compact>
            <Input
              value={afpOrders}
              onChange={e => setAfpOrders(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Warrant" compact>
            <Input
              value={warrant}
              onChange={e => setWarrant(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
        </div>
      </div>

      {/* COMMAND & SIGNAL */}
      <div className="p-4 rounded-xl bg-card border border-border space-y-3">
        <SmeacLabel letter="C" label="Command & Signal" icon={Radio} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field label="Comms Primary" compact>
            <Input
              value={commsPrimary}
              onChange={e => setCommsPrimary(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Comms Secondary" compact>
            <Input
              value={commsSecondary}
              onChange={e => setCommsSecondary(e.target.value)}
              className="h-8 text-sm"
            />
          </Field>
        </div>
      </div>

      {/* Post bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-xl bg-card border border-amber-500/40 shadow-[0_0_0_3px_rgba(245,158,11,0.08)]">
        <div className="flex items-start gap-3">
          <Send className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold">
              {isPosted
                ? "Save changes, or re-notify everyone"
                : "Post & notify all users"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              {isPosted
                ? "Save changes quietly, or re-post to send everyone a fresh alert with the updated content."
                : "Every signed-in user receives an immediate alert and can acknowledge it from their notifications. This can't be undone once posted."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={saveDraft} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isPosted ? "Save changes" : "Save as draft"}
          </Button>
          <Button
            onClick={postBriefing}
            disabled={saving}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {saving ? (
              <Spinner className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isPosted ? "Update & Re-notify" : "Post STOSEC"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  compact,
  children,
}: {
  label: string;
  compact?: boolean;
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
      {children}
    </div>
  );
}
