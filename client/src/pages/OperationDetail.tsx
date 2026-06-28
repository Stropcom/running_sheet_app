import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Plus,
  FileText,
  ChevronRight,
  Trash2,
  Calendar,
  ArrowLeft,
  FolderOpen,
  Hash,
  Building2,
  UserPlus,
  X,
  Camera,
  Pencil,
  Target,
  Save,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import { toast } from "sonner";

type CinEntry = { cin: string; hasImages: boolean; isTeamLeader?: boolean; isAuthor?: boolean };

type ProfileType = "TGT" | "HB" | "V1" | "V2" | "WB";

const PROFILE_LABELS: Record<ProfileType, string> = {
  TGT: "Target (TGT)",
  HB: "Home (HB)",
  V1: "Vehicle (V1)",
  V2: "Vehicle (V2)",
  WB: "Work (WB)",
};

/** Default field labels per profile type */
const DEFAULT_FIELDS: Record<ProfileType, string[]> = {
  TGT: ["Full Name", "DOB", "Description", "Known Associates", "Other"],
  HB: ["Address", "Suburb", "State", "Postcode", "Other"],
  V1: ["Registration", "Make", "Model", "Colour", "Other"],
  V2: ["Registration", "Make", "Model", "Colour", "Other"],
  WB: ["Address", "Suburb", "State", "Postcode", "Other"],
};

type ProfileFormState = {
  id?: number;
  field1Label: string; field1Value: string;
  field2Label: string; field2Value: string;
  field3Label: string; field3Value: string;
  field4Label: string; field4Value: string;
  field5Label: string; field5Value: string;
  notes: string;
};

function emptyForm(type: ProfileType): ProfileFormState {
  const [l1, l2, l3, l4, l5] = DEFAULT_FIELDS[type];
  return {
    field1Label: l1, field1Value: "",
    field2Label: l2, field2Value: "",
    field3Label: l3, field3Value: "",
    field4Label: l4, field4Value: "",
    field5Label: l5, field5Value: "",
    notes: "",
  };
}

/** Target profile form for one type */
function TargetTypeForm({
  operationId,
  type,
}: {
  operationId: number;
  type: ProfileType;
}) {
  const utils = trpc.useUtils();
  const { data: profiles, isLoading: profilesLoading } = trpc.target.list.useQuery({ operationId });
  const existing = profiles?.find((p) => p.type === type);

  const [form, setForm] = useState<ProfileFormState>(() => emptyForm(type));
  const [dirty, setDirty] = useState(false);

  // Populate or reset form whenever profiles load or operationId/type changes
  useEffect(() => {
    if (profilesLoading) return; // wait for data
    if (existing) {
      setForm({
        id: existing.id,
        field1Label: existing.field1Label ?? DEFAULT_FIELDS[type][0],
        field1Value: existing.field1Value ?? "",
        field2Label: existing.field2Label ?? DEFAULT_FIELDS[type][1],
        field2Value: existing.field2Value ?? "",
        field3Label: existing.field3Label ?? DEFAULT_FIELDS[type][2],
        field3Value: existing.field3Value ?? "",
        field4Label: existing.field4Label ?? DEFAULT_FIELDS[type][3],
        field4Value: existing.field4Value ?? "",
        field5Label: existing.field5Label ?? DEFAULT_FIELDS[type][4],
        field5Value: existing.field5Value ?? "",
        notes: existing.notes ?? "",
      });
    } else {
      // No saved profile for this type — reset to defaults
      setForm(emptyForm(type));
    }
    setDirty(false);
  }, [profilesLoading, existing?.id, operationId, type]);

  const upsert = trpc.target.upsert.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      setDirty(false);
      toast.success(`${PROFILE_LABELS[type]} saved`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    upsert.mutate({ ...form, operationId, type });
  };

  const setField = (key: keyof ProfileFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const fields: Array<{ labelKey: keyof ProfileFormState; valueKey: keyof ProfileFormState }> = [
    { labelKey: "field1Label", valueKey: "field1Value" },
    { labelKey: "field2Label", valueKey: "field2Value" },
    { labelKey: "field3Label", valueKey: "field3Value" },
    { labelKey: "field4Label", valueKey: "field4Value" },
    { labelKey: "field5Label", valueKey: "field5Value" },
  ];

  if (profilesLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {fields.map(({ labelKey, valueKey }) => (
        <div key={labelKey} className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {form[labelKey] as string}
          </label>
          <Input
            value={form[valueKey] as string}
            onChange={(e) => setField(valueKey, e.target.value)}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
        <Textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={3}
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="gap-2"
          onClick={handleSave}
          disabled={upsert.isPending || !dirty}
        >
          <Save className="w-3.5 h-3.5" />
          {upsert.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}


/** Individual sheet card — fetches cert status and highlights green when all CINs certified */
function SheetCard({
  sheet,
  cinNames,
  isAdmin,
  onNavigate,
  onDelete,
}: {
  sheet: { id: number; title: string; createdAt: Date; sheetCins?: string | null };
  cinNames: string[];
  isAdmin: boolean;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const { data: certStatus } = trpc.sheet.cinCertStatus.useQuery(
    { sheetId: sheet.id, cins: cinNames },
    { enabled: cinNames.length > 0, staleTime: 30_000 },
  );

  const allCertified =
    cinNames.length > 0 &&
    certStatus !== undefined &&
    certStatus.every((s) => s.certified);

  return (
    <div
      className={`group relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-150 cursor-pointer ${
        allCertified
          ? "border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/15 hover:border-emerald-500/80"
          : "border-border bg-card hover:bg-accent/20 hover:border-primary/30"
      }`}
      onClick={onNavigate}
    >
      <div className={`p-2.5 rounded-lg border shrink-0 ${
        allCertified ? "bg-emerald-500/20 border-emerald-500/40" : "bg-muted/60 border-border"
      }`}>
        <FileText className={`w-5 h-5 ${
          allCertified ? "text-emerald-400" : "text-muted-foreground"
        }`} />
      </div>

      <div className="flex-1 min-w-0">
        <span className={`font-semibold truncate block ${
          allCertified ? "text-emerald-300" : "text-foreground"
        }`}>{sheet.title}</span>
        {cinNames.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {cinNames.map((cin) => {
              const certified = certStatus?.find((s) => s.cin === cin)?.certified ?? false;
              return (
                <span
                  key={cin}
                  className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-mono ${
                    certified
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-red-500/40 bg-red-500/10 text-red-400"
                  }`}
                >
                  {cin}
                </span>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span>Created {format(new Date(sheet.createdAt), "d MMM yyyy, HH:mm")}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <Button
            size="icon"
            variant="ghost"
            className="w-8 h-8 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
        <ChevronRight className={`w-4 h-4 transition-colors ${
          allCertified ? "text-emerald-400" : "text-muted-foreground group-hover:text-foreground"
        }`} />
      </div>
    </div>
  );
}

export default function OperationDetail() {
  const { isAuthenticated, user } = useAuth();
  const params = useParams<{ id: string }>();
  const operationId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();

  // Create sheet state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [cinList, setCinList] = useState<CinEntry[]>([]);
  const [cinInput, setCinInput] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Edit operation state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPromis, setEditPromis] = useState("");
  const [editIms, setEditIms] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const utils = trpc.useUtils();

  const { data: operation, isLoading: opLoading } = trpc.operation.get.useQuery(
    { id: operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  const { data: sheets, isLoading: sheetsLoading } = trpc.sheet.listByOperation.useQuery(
    { operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  // Populate edit form when operation loads
  useEffect(() => {
    if (operation) {
      setEditName(operation.name ?? "");
      setEditPromis(operation.promisNumber ?? "");
      setEditIms(operation.imsNumber ?? "");
      setEditUnit(operation.investigationUnit ?? "");
    }
  }, [operation]);

  const createSheet = trpc.sheet.create.useMutation({
    onSuccess: (data) => {
      utils.sheet.listByOperation.invalidate({ operationId });
      setCreateOpen(false);
      setNewTitle("");
      setCinList([]);
      setCinInput("");
      toast.success("Running sheet created");
      navigate(`/sheet/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateOperation = trpc.operation.update.useMutation({
    onSuccess: () => {
      utils.operation.get.invalidate({ id: operationId });
      setEditOpen(false);
      toast.success("Operation updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteSheet = trpc.sheet.delete.useMutation({
    onSuccess: () => {
      utils.sheet.listByOperation.invalidate({ operationId });
      setDeleteId(null);
      toast.success("Sheet deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAddCin = () => {
    const trimmed = cinInput.trim();
    if (!trimmed) return;
    if (cinList.some((c) => c.cin.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("CIN already added");
      return;
    }
    setCinList((prev) => [...prev, { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false }]);
    setCinInput("");
  };

  const handleRemoveCin = (cin: string) => {
    setCinList((prev) => prev.filter((c) => c.cin !== cin));
  };

  const handleToggleImages = (cin: string) => {
    setCinList((prev) =>
      prev.map((c) => c.cin === cin ? { ...c, hasImages: !c.hasImages } : c)
    );
  };

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    createSheet.mutate({
      operationId,
      title: newTitle.trim(),
      sheetCins: cinList.length > 0 ? cinList : undefined,
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setNewTitle("");
      setCinList([]);
      setCinInput("");
    }
    setCreateOpen(open);
  };

  const handleEditSave = () => {
    if (!editName.trim()) return;
    updateOperation.mutate({
      id: operationId,
      name: editName.trim(),
      promisNumber: editPromis.trim() || null,
      imsNumber: editIms.trim() || null,
      investigationUnit: editUnit.trim() || null,
    });
  };

  const isLoading = opLoading || sheetsLoading;

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Operations
          </button>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium truncate">
            {opLoading ? "Loading…" : (operation?.name ?? "Operation")}
          </span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <FolderOpen className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground">
                {opLoading ? <Skeleton className="h-7 w-48" /> : (operation?.name ?? "Operation")}
              </h1>
              {!opLoading && operation && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-7 h-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditOpen(true)}
                  title="Edit operation details"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            {/* Operation metadata */}
            {!opLoading && operation && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 ml-11">
                {operation.promisNumber && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Hash className="w-3.5 h-3.5" />
                    PROMIS: <span className="text-foreground font-medium ml-0.5">{operation.promisNumber}</span>
                  </span>
                )}
                {operation.imsNumber && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Hash className="w-3.5 h-3.5" />
                    IMS: <span className="text-foreground font-medium ml-0.5">{operation.imsNumber}</span>
                  </span>
                )}
                {operation.investigationUnit && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="w-3.5 h-3.5" />
                    <span className="text-foreground font-medium">{operation.investigationUnit}</span>
                  </span>
                )}
              </div>
            )}
          </div>
          <Button
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4" />
            New Running Sheet
          </Button>
        </div>

        {/* Main tabs: Running Sheets | Add Target */}
        <Tabs defaultValue="sheets" className="mt-2">
          <TabsList className="mb-4">
            <TabsTrigger value="sheets">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Running Sheets
            </TabsTrigger>
            <TabsTrigger value="target">
              <Target className="w-3.5 h-3.5 mr-1.5" />
              Add Target
            </TabsTrigger>
          </TabsList>

          {/* ── Running Sheets tab ── */}
          <TabsContent value="sheets">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : !sheets || sheets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-muted/40 mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium mb-1">No running sheets yet</p>
            <p className="text-muted-foreground text-sm mb-4">
              Create the first running sheet for this operation
            </p>
            <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              New Running Sheet
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sheets.map((sheet) => {
              const parsedCins: CinEntry[] = (() => {
                try {
                  const raw: CinEntry[] = sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
                  return [...raw].sort((a, b) => {
                    if (a.isTeamLeader && !b.isTeamLeader) return -1;
                    if (!a.isTeamLeader && b.isTeamLeader) return 1;
                    const aNum = parseInt(a.cin, 10); const bNum = parseInt(b.cin, 10);
                    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                    return a.cin.localeCompare(b.cin);
                  });
                }
                catch { return []; }
              })();
              const cinNames = parsedCins.map((c) => c.cin);
              return (
                <SheetCard
                  key={sheet.id}
                  sheet={sheet}
                  cinNames={cinNames}
                  isAdmin={user?.role === "admin"}
                  onNavigate={() => navigate(`/sheet/${sheet.id}`)}
                  onDelete={() => setDeleteId(sheet.id)}
                />
              );
            })}
          </div>
        )}

        {sheets && sheets.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-right">
            {sheets.length} running sheet{sheets.length !== 1 ? "s" : ""}
          </p>
        )}
          </TabsContent>

          {/* ── Add Target tab ── */}
          <TabsContent value="target">
            <div className="flex flex-col gap-6">
              {(["TGT", "HB", "V1", "V2", "WB"] as ProfileType[]).map((type) => (
                <div key={type} className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    {PROFILE_LABELS[type]}
                  </h3>
                  <TargetTypeForm operationId={operationId} type={type} />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Operation Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Operation</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Operation Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Operation name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">PROMIS Number</label>
              <Input
                placeholder="e.g. PROM-2024-001"
                value={editPromis}
                onChange={(e) => setEditPromis(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">IMS Number</label>
              <Input
                placeholder="e.g. IMS-2024-001"
                value={editIms}
                onChange={(e) => setEditIms(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Investigation Unit</label>
              <Input
                placeholder="e.g. Major Crime Unit"
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleEditSave}
              disabled={!editName.trim() || updateOperation.isPending}
            >
              {updateOperation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Sheet Dialog */}
      <Dialog open={createOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Running Sheet</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* Title */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Title <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Day 1 — Morning Shift"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>

            {/* TEAM */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                TEAM <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Add the CINs of all members on duty today. Mark the Team Leader and Running Sheet Author. Tick the camera icon if images were taken by that member.
              </p>

              {/* CIN input row */}
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Enter CIN and press Add"
                  value={cinInput}
                  onChange={(e) => setCinInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCin(); } }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCin}
                  disabled={!cinInput.trim()}
                  className="gap-1.5 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>

              {/* CIN list */}
              {cinList.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>CIN</span>
                    <span className="flex items-center gap-1 justify-center" title="Team Leader"><span className="text-yellow-400">★</span> TL</span>
                    <span className="flex items-center gap-1 justify-center" title="Author"><span className="text-sky-400">✏</span> Author</span>
                    <span className="flex items-center gap-1 justify-center"><Camera className="w-3 h-3" /></span>
                    <span></span>
                  </div>
                  {cinList.map((entry) => (
                    <div
                      key={entry.cin}
                      className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <span className="text-sm font-mono font-medium text-foreground">{entry.cin}</span>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!entry.isTeamLeader}
                          onCheckedChange={() =>
                            setCinList((prev) =>
                              prev.map((c) => c.cin === entry.cin ? { ...c, isTeamLeader: !c.isTeamLeader } : c)
                            )
                          }
                          className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                        />
                      </div>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!entry.isAuthor}
                          onCheckedChange={() =>
                            setCinList((prev) =>
                              prev.map((c) => c.cin === entry.cin ? { ...c, isAuthor: !c.isAuthor } : c)
                            )
                          }
                          className="data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                        />
                      </div>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={entry.hasImages}
                          onCheckedChange={() => handleToggleImages(entry.cin)}
                          className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                      </div>
                      <button
                        onClick={() => handleRemoveCin(entry.cin)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogClose(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newTitle.trim() || createSheet.isPending}
            >
              {createSheet.isPending ? "Creating…" : "Create Sheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Running Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the running sheet and all its rows, members, and certifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteSheet.mutate({ id: deleteId })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
