import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShieldCheck,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadBase64(base64: string, filename: string, mime: string) {
  const link = document.createElement("a");
  link.href = `data:${mime};base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Returns today as DD/MM/YYYY */
function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Converts ISO yyyy-MM-dd to DD/MM/YYYY */
function isoToDDMMYYYY(iso: string) {
  if (!iso) return "";
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}

/** Converts a Date object to DD/MM/YYYY */
function dateToDDMMYYYY(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${
        done
          ? "bg-emerald-500 text-white"
          : active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {done ? "✓" : n}
    </div>
  );
}

// ─── Document type selector ───────────────────────────────────────────────────

type DocType = "stat-dec" | "wipc-request" | null;

function DocTypeCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  value: DocType;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card hover:bg-muted/40 text-foreground"
      }`}
    >
      <FileText className={`w-5 h-5 mt-0.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {selected && <ChevronRight className="w-4 h-4 text-primary ml-auto mt-1 shrink-0" />}
    </button>
  );
}

// ─── Member entry ─────────────────────────────────────────────────────────────

interface WipcMember {
  fullName: string;
  dob: string;       // ISO yyyy-MM-dd (for date input)
  afpId: string;
  isUco: boolean;
  isOco: boolean;
  isCin: boolean;
  cinNumber: string;
  aiInitials: string;
  aiKnownAs: string;
  deploymentStart: string; // ISO
  deploymentEnd: string;   // ISO
}

function emptyMember(): WipcMember {
  return {
    fullName: "",
    dob: "",
    afpId: "",
    isUco: false,
    isOco: false,
    isCin: true,
    cinNumber: "",
    aiInitials: "",
    aiKnownAs: "",
    deploymentStart: "",
    deploymentEnd: "",
  };
}

function MemberCard({
  index,
  member,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  member: WipcMember;
  onChange: (updated: WipcMember) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  function set<K extends keyof WipcMember>(key: K, value: WipcMember[K]) {
    onChange({ ...member, [key]: value });
  }

  return (
    <div className="border border-border rounded-lg p-4 flex flex-col gap-3 bg-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Member {index + 1}</p>
        {canRemove && (
          <Button variant="ghost" size="icon" onClick={onRemove} className="h-7 w-7 text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Row 1: Full Name + DOB */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Full Name</Label>
          <Input value={member.fullName} onChange={(e) => set("fullName", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Date of Birth</Label>
          <Input
            type="date"
            value={member.dob}
            onChange={(e) => set("dob", e.target.value)}
          />
        </div>
      </div>

      {/* Row 2: AFP ID + Checkboxes + CIN Number */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>AFP ID</Label>
          <Input value={member.afpId} onChange={(e) => set("afpId", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <div className="flex items-center gap-4 h-10">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox checked={member.isUco} onCheckedChange={(v) => set("isUco", !!v)} />
              UCO
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox checked={member.isOco} onCheckedChange={(v) => set("isOco", !!v)} />
              OCO
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox checked={member.isCin} onCheckedChange={(v) => set("isCin", !!v)} />
              CIN
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>CIN Number</Label>
          <Input value={member.cinNumber} onChange={(e) => set("cinNumber", e.target.value)} />
        </div>
      </div>

      {/* Row 3: AI Initials + AI Known As */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>AI Initials</Label>
          <Input value={member.aiInitials} onChange={(e) => set("aiInitials", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>AI Known As</Label>
          <Input value={member.aiKnownAs} onChange={(e) => set("aiKnownAs", e.target.value)} />
        </div>
      </div>

      {/* Row 4: Deployment Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Deployment Start</Label>
          <Input
            type="date"
            value={member.deploymentStart}
            onChange={(e) => set("deploymentStart", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Deployment End</Label>
          <Input
            type="date"
            value={member.deploymentEnd}
            onChange={(e) => set("deploymentEnd", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WIPCPage() {
  const { isAuthenticated } = useAuth();

  // Step 1: choose operation
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);

  // Step 2: choose document type
  const [docType, setDocType] = useState<DocType>(null);

  // ── Stat Dec fields ──────────────────────────────────────────────────────────
  const [declarantFullName, setDeclarantFullName] = useState("");
  const [witnessFullName, setWitnessFullName] = useState("");
  // Store as ISO for date input, display as DD/MM/YYYY in document
  const [declarationDateIso, setDeclarationDateIso] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });

  // ── WIPC Request fields ──────────────────────────────────────────────────────
  const [courtDateIso, setCourtDateIso] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });
  const [courtLocation, setCourtLocation] = useState("");
  const [requestingCommander, setRequestingCommander] = useState("COLLIE");
  const [assistantCommissioner, setAssistantCommissioner] = useState("SCANLAN");
  const [isUrgent, setIsUrgent] = useState(false);
  const [operationDetails, setOperationDetails] = useState("");
  const [officerFullName, setOfficerFullName] = useState("");
  const [officerAfpId, setOfficerAfpId] = useState("");
  const [officerWorkLocation, setOfficerWorkLocation] = useState("WC Surveillance");
  const [officerPortfolio, setOfficerPortfolio] = useState("CTO");
  const [officerContact, setOfficerContact] = useState("");

  // ── Members Requiring WIPC ───────────────────────────────────────────────────
  const [members, setMembers] = useState<WipcMember[]>([emptyMember()]);

  function addMember() {
    setMembers((prev) => [...prev, emptyMember()]);
  }
  function removeMember(idx: number) {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateMember(idx: number, updated: WipcMember) {
    setMembers((prev) => prev.map((m, i) => (i === idx ? updated : m)));
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: operations, isLoading: opsLoading } = trpc.operation.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Fetch first/last sheet dates for the selected operation to auto-fill deployment dates
  const { data: sheetDates } = trpc.wipc.getOperationSheetDates.useQuery(
    { operationId: selectedOpId ?? 0 },
    { enabled: !!selectedOpId }
  );

  const selectedOp = useMemo(
    () => operations?.find((o) => o.id === selectedOpId) ?? null,
    [operations, selectedOpId]
  );

  // When sheetDates loads, auto-fill deployment dates on all members that have empty dates
  const prevOpIdRef = useState<number | null>(null);
  if (sheetDates && selectedOpId !== prevOpIdRef[0]) {
    prevOpIdRef[1](selectedOpId);
    if (sheetDates.start || sheetDates.end) {
      setMembers((prev) =>
        prev.map((m) => ({
          ...m,
          deploymentStart: m.deploymentStart || sheetDates.start || "",
          deploymentEnd: m.deploymentEnd || sheetDates.end || "",
        }))
      );
    }
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const [isGenerating, setIsGenerating] = useState(false);

  const generateStatDecMutation = trpc.wipc.generateStatDec.useMutation({
    onSuccess(data) {
      downloadBase64(data.base64, data.filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      toast.success("Statutory Declaration generated");
      setIsGenerating(false);
    },
    onError(err) {
      toast.error(`Failed to generate: ${err.message}`);
      setIsGenerating(false);
    },
  });

  const generateWipcRequestMutation = trpc.wipc.generateWipcRequest.useMutation({
    onSuccess(data) {
      downloadBase64(data.base64, data.filename, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      toast.success("WIPC Request generated");
      setIsGenerating(false);
    },
    onError(err) {
      toast.error(`Failed to generate: ${err.message}`);
      setIsGenerating(false);
    },
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  const canGenerateStatDec =
    !!selectedOp &&
    declarantFullName.trim() !== "" &&
    witnessFullName.trim() !== "" &&
    declarationDateIso !== "";

  const canGenerateWipcRequest =
    !!selectedOp &&
    courtDateIso !== "" &&
    courtLocation.trim() !== "" &&
    requestingCommander.trim() !== "" &&
    assistantCommissioner.trim() !== "" &&
    officerFullName.trim() !== "" &&
    officerAfpId.trim() !== "" &&
    officerWorkLocation.trim() !== "" &&
    officerPortfolio.trim() !== "" &&
    officerContact.trim() !== "";

  // ── Step logic ─────────────────────────────────────────────────────────────

  const step = !selectedOp ? 1 : !docType ? 2 : 3;

  // ── Generate handler ───────────────────────────────────────────────────────

  function handleGenerate() {
    if (!selectedOp) return;
    setIsGenerating(true);

    if (docType === "stat-dec") {
      generateStatDecMutation.mutate({
        operationName: selectedOp.name,
        declarantFullName,
        witnessFullName,
        declarationDate: isoToDDMMYYYY(declarationDateIso),
      });
    } else if (docType === "wipc-request") {
      generateWipcRequestMutation.mutate({
        operationName: selectedOp.name,
        operationDetails,
        courtDate: isoToDDMMYYYY(courtDateIso),
        courtLocation,
        requestingCommander,
        assistantCommissioner,
        isUrgent,
        requestingOfficerFullName: officerFullName,
        requestingOfficerAfpId: officerAfpId,
        requestingOfficerWorkLocation: officerWorkLocation,
        requestingOfficerPortfolio: officerPortfolio,
        requestingOfficerContact: officerContact,
        members: members.map((m) => ({
          fullName: m.fullName,
          dob: isoToDDMMYYYY(m.dob),
          afpId: m.afpId,
          isUco: m.isUco,
          isOco: m.isOco,
          isCin: m.isCin,
          cinNumber: m.cinNumber,
          aiInitials: m.aiInitials,
          aiKnownAs: m.aiKnownAs,
          deploymentStart: isoToDDMMYYYY(m.deploymentStart),
          deploymentEnd: isoToDDMMYYYY(m.deploymentEnd),
        })),
      });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-8">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-primary shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-foreground">WIPC Documents</h1>
            <p className="text-sm text-muted-foreground">Generate Witness Identity Protection Certificate documents</p>
          </div>
        </div>

        {/* ── Step 1: Choose Operation ── */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <StepBadge n={1} active={step === 1} done={step > 1} />
            <h2 className="font-semibold text-foreground">Choose Operation</h2>
          </div>

          <div className="pl-10 flex flex-col gap-2">
            {opsLoading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : !operations || operations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No operations found.</p>
            ) : (
              operations.map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    setSelectedOpId(op.id);
                    setDocType(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                    selectedOpId === op.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card hover:bg-muted/40 text-foreground"
                  }`}
                >
                  <span className="font-medium text-sm">{op.name}</span>
                  {selectedOpId === op.id && (
                    <ChevronRight className="w-4 h-4 text-primary ml-auto shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </section>

        {/* ── Step 2: Choose Document Type ── */}
        {selectedOp && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <StepBadge n={2} active={step === 2} done={step > 2} />
              <h2 className="font-semibold text-foreground">Choose Document Type</h2>
            </div>

            <div className="pl-10 flex flex-col gap-2">
              <DocTypeCard
                selected={docType === "stat-dec"}
                value="stat-dec"
                title="Statutory Declaration"
                description="Generate a Statutory Declaration for a witness"
                onClick={() => setDocType("stat-dec")}
              />
              <DocTypeCard
                selected={docType === "wipc-request"}
                value="wipc-request"
                title="WIPC Request"
                description="Generate an Application for Witness Identity Protection Certificate"
                onClick={() => setDocType("wipc-request")}
              />
            </div>
          </section>
        )}

        {/* ── Step 3a: Stat Dec Form ── */}
        {docType === "stat-dec" && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <StepBadge n={3} active={step === 3} done={false} />
              <h2 className="font-semibold text-foreground">Statutory Declaration Details</h2>
            </div>

            <div className="pl-10 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="declarant-name">Full Name of Declarant</Label>
                <Input
                  id="declarant-name"
                  value={declarantFullName}
                  onChange={(e) => setDeclarantFullName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="witness-name">Full Name of Witness</Label>
                <Input
                  id="witness-name"
                  value={witnessFullName}
                  onChange={(e) => setWitnessFullName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Federal Agent — 1120 Hay Street, WEST PERTH</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decl-date">Declaration Date</Label>
                <Input
                  id="decl-date"
                  type="date"
                  value={declarationDateIso}
                  onChange={(e) => setDeclarationDateIso(e.target.value)}
                />
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!canGenerateStatDec || isGenerating}
                className="w-full sm:w-auto"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate Statutory Declaration"
                )}
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 3b: WIPC Request Form ── */}
        {docType === "wipc-request" && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <StepBadge n={3} active={step === 3} done={false} />
              <h2 className="font-semibold text-foreground">WIPC Request Details</h2>
            </div>

            <div className="pl-10 flex flex-col gap-4">
              {/* Urgency */}
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <Checkbox
                  id="urgent"
                  checked={isUrgent}
                  onCheckedChange={(v) => setIsUrgent(!!v)}
                />
                <Label htmlFor="urgent" className="cursor-pointer font-semibold text-amber-400">
                  URGENT — Mark this request as urgent
                </Label>
              </div>

              {/* Court details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="court-date">Court Date</Label>
                  <Input
                    id="court-date"
                    type="date"
                    value={courtDateIso}
                    onChange={(e) => setCourtDateIso(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="court-location">Court Location</Label>
                  <Input
                    id="court-location"
                    value={courtLocation}
                    onChange={(e) => setCourtLocation(e.target.value)}
                  />
                </div>
              </div>

              {/* Commanders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="req-commander">Requesting Commander</Label>
                  <Input
                    id="req-commander"
                    value={requestingCommander}
                    onChange={(e) => setRequestingCommander(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="asst-commissioner">Assistant Commissioner</Label>
                  <Input
                    id="asst-commissioner"
                    value={assistantCommissioner}
                    onChange={(e) => setAssistantCommissioner(e.target.value)}
                  />
                </div>
              </div>

              {/* Operation Details */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="op-details">Operation Details</Label>
                <Textarea
                  id="op-details"
                  rows={3}
                  value={operationDetails}
                  onChange={(e) => setOperationDetails(e.target.value)}
                />
              </div>

              {/* Requesting Officer Details */}
              <div className="border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground mb-3">Requesting Officer Details</p>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="officer-name">Full Name</Label>
                    <Input
                      id="officer-name"
                      value={officerFullName}
                      onChange={(e) => setOfficerFullName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-afpid">AFP ID</Label>
                      <Input
                        id="officer-afpid"
                        value={officerAfpId}
                        onChange={(e) => setOfficerAfpId(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-location">Work Location</Label>
                      <Input
                        id="officer-location"
                        value={officerWorkLocation}
                        onChange={(e) => setOfficerWorkLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-portfolio">Portfolio</Label>
                      <Input
                        id="officer-portfolio"
                        value={officerPortfolio}
                        onChange={(e) => setOfficerPortfolio(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-contact">Contact Number</Label>
                      <Input
                        id="officer-contact"
                        value={officerContact}
                        onChange={(e) => setOfficerContact(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Members Requiring WIPC (Page 3) ── */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground">Members Requiring WIPC</p>
                  <span className="text-xs text-muted-foreground">Page 3 of document</span>
                </div>

                <div className="flex flex-col gap-3">
                  {members.map((member, idx) => (
                    <MemberCard
                      key={idx}
                      index={idx}
                      member={member}
                      onChange={(updated) => updateMember(idx, updated)}
                      onRemove={() => removeMember(idx)}
                      canRemove={members.length > 1}
                    />
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={addMember}
                  className="mt-3 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Another Member
                </Button>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={!canGenerateWipcRequest || isGenerating}
                className="w-full sm:w-auto"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate WIPC Request"
                )}
              </Button>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
