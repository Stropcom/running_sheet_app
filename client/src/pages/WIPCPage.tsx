import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ShieldCheck,
  ChevronRight,
  FileText,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function downloadBase64(base64: string, filename: string, mime: string) {
  const link = document.createElement("a");
  link.href = `data:${mime};base64,${base64}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
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
  value,
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
  const [declarationDate, setDeclarationDate] = useState(todayIso);

  // ── WIPC Request fields ──────────────────────────────────────────────────────
  const [courtDate, setCourtDate] = useState(todayIso);
  const [courtLocation, setCourtLocation] = useState("");
  const [requestingCommander, setRequestingCommander] = useState("Commander ");
  const [assistantCommissioner, setAssistantCommissioner] = useState("A/C ");
  const [isUrgent, setIsUrgent] = useState(false);
  const [officerFullName, setOfficerFullName] = useState("");
  const [officerAfpId, setOfficerAfpId] = useState("");
  const [officerWorkLocation, setOfficerWorkLocation] = useState("");
  const [officerPortfolio, setOfficerPortfolio] = useState("");
  const [officerContact, setOfficerContact] = useState("");

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: operations, isLoading: opsLoading } = trpc.operation.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const selectedOp = useMemo(
    () => operations?.find((o) => o.id === selectedOpId) ?? null,
    [operations, selectedOpId]
  );

  // ── Mutations ──────────────────────────────────────────────────────────────

  const statDecMutation = trpc.wipc.generateStatDec.useMutation({
    onError: (e) => {
      toast.error(e.message);
    },
    onSuccess: (data) => {
      downloadBase64(
        data.base64,
        data.filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      toast.success("Statutory Declaration downloaded");
    },
  });

  const wipcRequestMutation = trpc.wipc.generateWipcRequest.useMutation({
    onError: (e) => {
      toast.error(e.message);
    },
    onSuccess: (data) => {
      downloadBase64(
        data.base64,
        data.filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      toast.success("WIPC Request downloaded");
    },
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  // step: 1 = pick op, 2 = pick doc type, 3 = fill form
  const step = selectedOpId === null ? 1 : docType === null ? 2 : 3;

  const canGenerateStatDec =
    !!selectedOp &&
    declarantFullName.trim().length > 0 &&
    witnessFullName.trim().length > 0 &&
    declarationDate.trim().length > 0;

  const canGenerateWipcRequest =
    !!selectedOp &&
    courtDate.trim().length > 0 &&
    courtLocation.trim().length > 0 &&
    requestingCommander.trim().length > 0 &&
    assistantCommissioner.trim().length > 0 &&
    officerFullName.trim().length > 0 &&
    officerAfpId.trim().length > 0 &&
    officerWorkLocation.trim().length > 0 &&
    officerPortfolio.trim().length > 0 &&
    officerContact.trim().length > 0;

  const isGenerating = statDecMutation.isPending || wipcRequestMutation.isPending;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleGenerate = () => {
    if (!selectedOp) return;
    if (docType === "stat-dec" && canGenerateStatDec) {
      statDecMutation.mutate({
        operationName: selectedOp.name,
        declarantFullName: declarantFullName.trim(),
        witnessFullName: witnessFullName.trim(),
        declarationDate: declarationDate.trim(),
      });
    } else if (docType === "wipc-request" && canGenerateWipcRequest) {
      wipcRequestMutation.mutate({
        operationName: selectedOp.name,
        courtDate: courtDate.trim(),
        courtLocation: courtLocation.trim(),
        requestingCommander: requestingCommander.trim(),
        assistantCommissioner: assistantCommissioner.trim(),
        isUrgent,
        requestingOfficerFullName: officerFullName.trim(),
        requestingOfficerAfpId: officerAfpId.trim(),
        requestingOfficerWorkLocation: officerWorkLocation.trim(),
        requestingOfficerPortfolio: officerPortfolio.trim(),
        requestingOfficerContact: officerContact.trim(),
      });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!isAuthenticated) return null;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-8">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">WIPC Documents</h1>
            <p className="text-sm text-muted-foreground">
              Generate Witness Identity Protection Certificate documents
            </p>
          </div>
        </div>

        {/* ── Step 1: Choose Operation ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <StepBadge n={1} active={step === 1} done={step > 1} />
            <h2 className="font-semibold text-foreground">Choose Operation</h2>
          </div>

          {opsLoading ? (
            <div className="flex flex-col gap-2 pl-10">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="pl-10 flex flex-col gap-1.5">
              {(operations ?? []).map((op) => (
                <button
                  key={op.id}
                  onClick={() => {
                    setSelectedOpId(op.id);
                    setDocType(null);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors ${
                    selectedOpId === op.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card hover:bg-muted/40 text-foreground"
                  }`}
                >
                  <span className="font-medium">{op.name}</span>
                  {selectedOpId === op.id && (
                    <ChevronRight className="w-4 h-4 text-primary" />
                  )}
                </button>
              ))}
              {(operations ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground italic pl-1">No operations found.</p>
              )}
            </div>
          )}
        </section>

        {/* ── Step 2: Choose Document Type ── */}
        {selectedOpId !== null && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <StepBadge n={2} active={step === 2} done={step > 2} />
              <h2 className="font-semibold text-foreground">Choose Document Type</h2>
            </div>

            <div className="pl-10 flex flex-col gap-2">
              <DocTypeCard
                selected={docType === "stat-dec"}
                value="stat-dec"
                title="Statutory Declaration"
                description="Formal declaration by a witness for identity protection purposes"
                onClick={() => setDocType("stat-dec")}
              />
              <DocTypeCard
                selected={docType === "wipc-request"}
                value="wipc-request"
                title="WIPC Request"
                description="Request to the court for a Witness Identity Protection Certificate"
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
              {/* Info card */}
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <p>Fixed values: Address — <span className="font-mono text-foreground">1120 Hay Street, WEST PERTH</span> &nbsp;|&nbsp; Declared at — <span className="font-mono text-foreground">PERTH</span></p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="declarant-name">Full Name of Declarant</Label>
                <Input
                  id="declarant-name"
                  placeholder="e.g. JOHN SMITH"
                  value={declarantFullName}
                  onChange={(e) => setDeclarantFullName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="witness-name">Full Name of Witness (Field 8)</Label>
                <Input
                  id="witness-name"
                  placeholder="e.g. JANE DOE"
                  value={witnessFullName}
                  onChange={(e) => setWitnessFullName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Appears in Field 8 followed by "Federal Agent" and "1120 Hay Street, WEST PERTH"
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="declaration-date">Declaration Date</Label>
                <Input
                  id="declaration-date"
                  type="date"
                  value={declarationDate}
                  onChange={(e) => setDeclarationDate(e.target.value)}
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
                    value={courtDate}
                    onChange={(e) => setCourtDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="court-location">Court Location</Label>
                  <Input
                    id="court-location"
                    placeholder="e.g. Perth Magistrates Court"
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
                    placeholder="Commander ..."
                    value={requestingCommander}
                    onChange={(e) => setRequestingCommander(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="asst-commissioner">Assistant Commissioner</Label>
                  <Input
                    id="asst-commissioner"
                    placeholder="A/C ..."
                    value={assistantCommissioner}
                    onChange={(e) => setAssistantCommissioner(e.target.value)}
                  />
                </div>
              </div>

              {/* Requesting officer */}
              <div className="border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground mb-3">Requesting Officer Details</p>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="officer-name">Full Name</Label>
                    <Input
                      id="officer-name"
                      placeholder="Full legal name"
                      value={officerFullName}
                      onChange={(e) => setOfficerFullName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-afpid">AFP ID</Label>
                      <Input
                        id="officer-afpid"
                        placeholder="e.g. 12345"
                        value={officerAfpId}
                        onChange={(e) => setOfficerAfpId(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-location">Work Location</Label>
                      <Input
                        id="officer-location"
                        placeholder="e.g. Perth"
                        value={officerWorkLocation}
                        onChange={(e) => setOfficerWorkLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-portfolio">Portfolio / Team</Label>
                      <Input
                        id="officer-portfolio"
                        placeholder="e.g. Serious Organised Crime"
                        value={officerPortfolio}
                        onChange={(e) => setOfficerPortfolio(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="officer-contact">Contact Number</Label>
                      <Input
                        id="officer-contact"
                        placeholder="e.g. 08 9000 0000"
                        value={officerContact}
                        onChange={(e) => setOfficerContact(e.target.value)}
                      />
                    </div>
                  </div>
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
