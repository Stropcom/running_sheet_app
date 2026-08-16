import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ShieldCheck,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Lock,
  Save,
  UserCheck,
} from "lucide-react";
import { downloadBase64File } from "@/lib/downloadFile";

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

function StepBadge({
  n,
  active,
  done,
}: {
  n: number;
  active: boolean;
  done: boolean;
}) {
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
      <FileText
        className={`w-5 h-5 mt-0.5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`}
      />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      {selected && (
        <ChevronRight className="w-4 h-4 text-primary ml-auto mt-1 shrink-0" />
      )}
    </button>
  );
}

// ─── Member entry ─────────────────────────────────────────────────────────────

interface WipcMember {
  fullName: string;
  dob: string; // ISO yyyy-MM-dd (for date input)
  afpId: string;
  isUco: boolean;
  isOco: boolean;
  isCin: boolean;
  cinNumber: string;
  aiInitials: string;
  aiKnownAs: string;
  deploymentStart: string; // ISO
  deploymentEnd: string; // ISO
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
        <p className="text-sm font-semibold text-foreground">
          Member {index + 1}
        </p>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-7 w-7 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Row 1: Full Name + DOB */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Full Name</Label>
          <Input
            value={member.fullName}
            onChange={e => set("fullName", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Date of Birth</Label>
          <Input
            type="date"
            value={member.dob}
            onChange={e => set("dob", e.target.value)}
          />
        </div>
      </div>

      {/* Row 2: AFP ID + Checkboxes + CIN Number */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>AFP ID</Label>
          <Input
            value={member.afpId}
            onChange={e => set("afpId", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <div className="flex items-center gap-4 h-10">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={member.isUco}
                onCheckedChange={v => set("isUco", !!v)}
              />
              UCO
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={member.isOco}
                onCheckedChange={v => set("isOco", !!v)}
              />
              OCO
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={member.isCin}
                onCheckedChange={v => set("isCin", !!v)}
              />
              CIN
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>CIN Number</Label>
          <Input
            value={member.cinNumber}
            onChange={e => set("cinNumber", e.target.value)}
          />
        </div>
      </div>

      {/* Row 3: AI Initials + AI Known As */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>AI Initials</Label>
          <Input
            value={member.aiInitials}
            onChange={e => set("aiInitials", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>AI Known As</Label>
          <Input
            value={member.aiKnownAs}
            onChange={e => set("aiKnownAs", e.target.value)}
          />
        </div>
      </div>

      {/* Row 4: Deployment Dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Deployment Start</Label>
          <Input
            type="date"
            value={member.deploymentStart}
            onChange={e => set("deploymentStart", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Deployment End</Label>
          <Input
            type="date"
            value={member.deploymentEnd}
            onChange={e => set("deploymentEnd", e.target.value)}
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // ── WIPC Request fields ──────────────────────────────────────────────────────
  const [courtDateIso, setCourtDateIso] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [courtLocation, setCourtLocation] = useState("");
  const [requestingCommander, setRequestingCommander] = useState("COLLIE");
  const [assistantCommissioner, setAssistantCommissioner] = useState("SCANLAN");
  const [isUrgent, setIsUrgent] = useState(false);
  const [operationDetails, setOperationDetails] = useState("");
  const [officerFullName, setOfficerFullName] = useState("");
  const [officerAfpId, setOfficerAfpId] = useState("");
  const [officerWorkLocation, setOfficerWorkLocation] =
    useState("WC Surveillance");
  const [officerPortfolio, setOfficerPortfolio] = useState("CTO");
  const [officerContact, setOfficerContact] = useState("");

  // ── Members Requiring WIPC ───────────────────────────────────────────────────
  const [members, setMembers] = useState<WipcMember[]>([emptyMember()]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showMemberSearch, setShowMemberSearch] = useState(false);

  function addMember() {
    setMembers(prev => [...prev, emptyMember()]);
  }
  function removeMember(idx: number) {
    setMembers(prev => prev.filter((_, i) => i !== idx));
  }
  function updateMember(idx: number, updated: WipcMember) {
    setMembers(prev => prev.map((m, i) => (i === idx ? updated : m)));
  }
  function addMemberFromRegistry(saved: {
    fullName: string;
    dob?: string | null;
    afpId: string;
    isUco: boolean;
    isOco: boolean;
    isCin: boolean;
    cinNumber?: string | null;
    aiInitials?: string | null;
    aiKnownAs?: string | null;
  }) {
    const m: WipcMember = {
      fullName: saved.fullName,
      dob: saved.dob || "",
      afpId: saved.afpId,
      isUco: saved.isUco,
      isOco: saved.isOco,
      isCin: saved.isCin,
      cinNumber: saved.cinNumber || "",
      aiInitials: saved.aiInitials || "",
      aiKnownAs: saved.aiKnownAs || "",
      deploymentStart: "",
      deploymentEnd: "",
    };
    setMembers(prev => {
      const last = prev[prev.length - 1];
      if (last && !last.fullName && !last.afpId) {
        return [...prev.slice(0, -1), m];
      }
      return [...prev, m];
    });
    setMemberSearch("");
    setShowMemberSearch(false);
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: operations, isLoading: opsLoading } =
    trpc.operation.list.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  // Fetch first/last sheet dates for the selected operation to auto-fill deployment dates
  const { data: sheetDates } = trpc.wipc.getOperationSheetDates.useQuery(
    { operationId: selectedOpId ?? 0 },
    { enabled: !!selectedOpId }
  );

  // Fetch saved member registry (vault)
  const { data: savedMembers } = trpc.wipc.listMembers.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Filtered members for search dropdown
  const filteredSavedMembers = useMemo(() => {
    if (!savedMembers) return [];
    const q = memberSearch.toLowerCase();
    if (!q) return savedMembers;
    return savedMembers.filter(
      m =>
        m.fullName.toLowerCase().includes(q) ||
        m.afpId.toLowerCase().includes(q) ||
        (m.aiKnownAs && m.aiKnownAs.toLowerCase().includes(q))
    );
  }, [savedMembers, memberSearch]);

  const utils = trpc.useUtils();
  const saveMemberMutation = trpc.wipc.saveMember.useMutation({
    onSuccess() {
      toast.success("🔒 Member saved to vault registry");
      utils.wipc.listMembers.invalidate();
    },
    onError(err) {
      toast.error(`Failed to save member: ${err.message}`);
    },
  });

  // Fetch saved officer profile (vault)
  const { data: savedOfficerProfile, isLoading: profileLoading } =
    trpc.wipc.getOfficerProfile.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  const selectedOp = useMemo(
    () => operations?.find(o => o.id === selectedOpId) ?? null,
    [operations, selectedOpId]
  );

  // Auto-fill officer details from saved vault profile
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    if (savedOfficerProfile && !profileLoaded) {
      setProfileLoaded(true);
      if (savedOfficerProfile.fullName)
        setOfficerFullName(savedOfficerProfile.fullName as string);
      if (savedOfficerProfile.afpId)
        setOfficerAfpId(savedOfficerProfile.afpId as string);
      if (savedOfficerProfile.workLocation)
        setOfficerWorkLocation(savedOfficerProfile.workLocation as string);
      if (savedOfficerProfile.portfolio)
        setOfficerPortfolio(savedOfficerProfile.portfolio as string);
      if (savedOfficerProfile.contactNumber)
        setOfficerContact(savedOfficerProfile.contactNumber as string);
    }
  }, [savedOfficerProfile, profileLoaded]);

  // When sheetDates loads, auto-fill deployment dates on all members that have empty dates
  const [lastAutoFillOpId, setLastAutoFillOpId] = useState<number | null>(null);
  useEffect(() => {
    if (sheetDates && selectedOpId && selectedOpId !== lastAutoFillOpId) {
      setLastAutoFillOpId(selectedOpId);
      if (sheetDates.start || sheetDates.end) {
        setMembers(prev =>
          prev.map(m => ({
            ...m,
            deploymentStart: m.deploymentStart || sheetDates.start || "",
            deploymentEnd: m.deploymentEnd || sheetDates.end || "",
          }))
        );
      }
    }
  }, [sheetDates, selectedOpId, lastAutoFillOpId]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const saveOfficerProfileMutation = trpc.wipc.saveOfficerProfile.useMutation({
    onSuccess() {
      toast.success("🔒 Officer profile saved to vault");
      setIsSavingProfile(false);
    },
    onError(err) {
      toast.error(`Failed to save profile: ${err.message}`);
      setIsSavingProfile(false);
    },
  });

  function handleSaveOfficerProfile() {
    if (!officerFullName.trim() || !officerAfpId.trim()) {
      toast.error("Full name and AFP ID are required to save profile");
      return;
    }
    setIsSavingProfile(true);
    saveOfficerProfileMutation.mutate({
      fullName: officerFullName,
      afpId: officerAfpId,
      workLocation: officerWorkLocation,
      portfolio: officerPortfolio,
      contactNumber: officerContact,
    });
  }

  const generateStatDecMutation = trpc.wipc.generateStatDec.useMutation({
    onSuccess(data) {
      downloadBase64File(
        data.base64,
        data.filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      toast.success("Statutory Declaration generated");
      setIsGenerating(false);
    },
    onError(err) {
      toast.error(`Failed to generate: ${err.message}`);
      setIsGenerating(false);
    },
  });

  const generateWipcRequestMutation = trpc.wipc.generateWipcRequest.useMutation(
    {
      onSuccess(data) {
        downloadBase64File(
          data.base64,
          data.filename,
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        toast.success("WIPC Request generated");
        setIsGenerating(false);
      },
      onError(err) {
        toast.error(`Failed to generate: ${err.message}`);
        setIsGenerating(false);
      },
    }
  );

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
        members: members.map(m => ({
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
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-7 h-7 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">
                WIPC Documents
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Lock className="w-3 h-3" />
                AES-256 Encrypted Vault
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Generate Witness Identity Protection Certificate documents — all
              officer and member data is encrypted at rest
            </p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Encrypted at rest means names, dates of birth and IDs are
              scrambled before they're stored, so they can't be read directly
              from the database — only this app can unscramble them when you
              view a record.
            </p>
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
              <p className="text-sm text-muted-foreground">
                No operations found.
              </p>
            ) : (
              operations.map(op => (
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
              <h2 className="font-semibold text-foreground">
                Choose Document Type
              </h2>
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
              <h2 className="font-semibold text-foreground">
                Statutory Declaration Details
              </h2>
            </div>

            <div className="pl-10 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="declarant-name">Full Name of Declarant</Label>
                <Input
                  id="declarant-name"
                  value={declarantFullName}
                  onChange={e => setDeclarantFullName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="witness-name">Full Name of Witness</Label>
                <Input
                  id="witness-name"
                  value={witnessFullName}
                  onChange={e => setWitnessFullName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Federal Agent — 1120 Hay Street, WEST PERTH
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decl-date">Declaration Date</Label>
                <Input
                  id="decl-date"
                  type="date"
                  value={declarationDateIso}
                  onChange={e => setDeclarationDateIso(e.target.value)}
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
              <h2 className="font-semibold text-foreground">
                WIPC Request Details
              </h2>
            </div>

            <div className="pl-10 flex flex-col gap-4">
              {/* Urgency */}
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <Checkbox
                  id="urgent"
                  checked={isUrgent}
                  onCheckedChange={v => setIsUrgent(!!v)}
                />
                <Label
                  htmlFor="urgent"
                  className="cursor-pointer font-semibold text-amber-400"
                >
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
                    onChange={e => setCourtDateIso(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="court-location">Court Location</Label>
                  <Input
                    id="court-location"
                    value={courtLocation}
                    onChange={e => setCourtLocation(e.target.value)}
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
                    onChange={e => setRequestingCommander(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="asst-commissioner">
                    Assistant Commissioner
                  </Label>
                  <Input
                    id="asst-commissioner"
                    value={assistantCommissioner}
                    onChange={e => setAssistantCommissioner(e.target.value)}
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
                  onChange={e => setOperationDetails(e.target.value)}
                />
              </div>

              {/* Requesting Officer Details */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      Requesting Officer Details
                    </p>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Lock className="w-2.5 h-2.5" />
                      Vault
                    </span>
                  </div>
                  {profileLoading ? (
                    <span className="text-xs text-muted-foreground">
                      Loading saved profile…
                    </span>
                  ) : savedOfficerProfile ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <UserCheck className="w-3 h-3" />
                      Profile loaded from vault
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="officer-name">Full Name</Label>
                    <Input
                      id="officer-name"
                      value={officerFullName}
                      onChange={e => setOfficerFullName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-afpid">AFP ID</Label>
                      <Input
                        id="officer-afpid"
                        value={officerAfpId}
                        onChange={e => setOfficerAfpId(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-location">Work Location</Label>
                      <Input
                        id="officer-location"
                        value={officerWorkLocation}
                        onChange={e => setOfficerWorkLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-portfolio">Portfolio</Label>
                      <Input
                        id="officer-portfolio"
                        value={officerPortfolio}
                        onChange={e => setOfficerPortfolio(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-contact">Contact Number</Label>
                      <Input
                        id="officer-contact"
                        value={officerContact}
                        onChange={e => setOfficerContact(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Save to vault button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveOfficerProfile}
                    disabled={
                      isSavingProfile ||
                      !officerFullName.trim() ||
                      !officerAfpId.trim()
                    }
                    className="w-full sm:w-auto gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                  >
                    {isSavingProfile ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" /> Save Officer Profile to
                        Vault
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* ── Members Requiring WIPC (Page 3) ── */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      Members Requiring WIPC
                    </p>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Lock className="w-2.5 h-2.5" />
                      Vault
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Page 3 of document
                  </span>
                </div>

                {/* Saved member search / recall */}
                {savedMembers && savedMembers.length > 0 && (
                  <div className="mb-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                    <p className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      Recall member from vault registry
                    </p>
                    <div className="relative">
                      <Input
                        value={memberSearch}
                        onChange={e => {
                          setMemberSearch(e.target.value);
                          setShowMemberSearch(true);
                        }}
                        onFocus={() => setShowMemberSearch(true)}
                        placeholder="Search by name, AFP ID or AI known as…"
                        className="text-sm"
                      />
                      {showMemberSearch && filteredSavedMembers.length > 0 && (
                        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredSavedMembers.map(sm => (
                            <button
                              key={sm.id}
                              type="button"
                              onClick={() => addMemberFromRegistry(sm)}
                              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-left transition-colors"
                            >
                              <span className="font-medium">{sm.fullName}</span>
                              <span className="text-xs text-muted-foreground">
                                {sm.afpId}
                                {sm.aiKnownAs ? ` · ${sm.aiKnownAs}` : ""}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {members.map((member, idx) => (
                    <div key={idx} className="flex flex-col gap-2">
                      <MemberCard
                        index={idx}
                        member={member}
                        onChange={updated => updateMember(idx, updated)}
                        onRemove={() => removeMember(idx)}
                        canRemove={members.length > 1}
                      />
                      {/* Save this member to vault */}
                      {member.fullName.trim() && member.afpId.trim() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            saveMemberMutation.mutate({
                              fullName: member.fullName,
                              afpId: member.afpId,
                              dob: member.dob || undefined,
                              isUco: member.isUco,
                              isOco: member.isOco,
                              isCin: member.isCin,
                              cinNumber: member.cinNumber || undefined,
                              aiInitials: member.aiInitials || undefined,
                              aiKnownAs: member.aiKnownAs || undefined,
                            })
                          }
                          className="self-end gap-1.5 text-xs text-amber-400 hover:bg-amber-500/10 h-7"
                        >
                          <Save className="w-3 h-3" />
                          Save to vault
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addMember}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Another Member
                  </Button>
                </div>
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
