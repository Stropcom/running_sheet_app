import { ClearInputButton } from "@/components/ClearInputButton";
import {
  OperationSearchHits,
  type SearchRowHit,
} from "@/components/OperationSearchHits";
import { useMyTeams } from "@/lib/teams";
import { useAuth } from "@/_core/hooks/useAuth";
import { OperationRegionFields } from "@/components/OperationRegionFields";
import { DEFAULT_COMMAND, type CommandCode } from "@shared/commands";
import { trpc, trpcClient } from "@/lib/trpc";
import { setLastActiveContext } from "@/lib/lastActiveContext";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  buildRunningSheetTitle,
  getTargetTitleBracket,
  perthDateISO,
} from "@shared/runningSheetTitle";
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
import { useViewMode } from "@/contexts/ViewModeContext";
import {
  Plus,
  FileText,
  ChevronRight,
  Trash2,
  ArrowLeft,
  FolderOpen,
  Hash,
  Building2,
  UserPlus,
  X,
  Camera,
  Pencil,
  Star,
  Target,
  Search,
  CheckCircle2,
  History,
  FileDown,
  IdCard,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { CopyMoveSheetDialog } from "@/components/CopyMoveSheetDialog";
import {
  AddTargetDialog,
  type RegistryCreatePayload,
} from "@/components/AddTargetDialog";
import { OperationProfileContent } from "@/components/OperationProfileContent";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import type { CinEntry } from "./operationDetail/types";
import { TargetPanel } from "./operationDetail/TargetPanel";
import {
  DeploymentRollupPanel,
  buildRollupExportPdf,
} from "./operationDetail/DeploymentRollup";
import { SheetCard } from "./operationDetail/SheetCard";
import { SheetTileCard } from "./operationDetail/SheetTileCard";

export default function OperationDetail() {
  const { isAuthenticated, user } = useAuth();
  const params = useParams<{ id: string }>();
  const operationId = parseInt(params.id ?? "0", 10);
  const [, navigate] = useLocation();
  const search = useSearch();

  // Remembers this as the officer's most recent operation context (no
  // specific sheet) — used only to pre-fill the New SMEAC Briefing form.
  useEffect(() => {
    if (operationId) {
      setLastActiveContext({ operationId, sheetId: null });
    }
  }, [operationId]);

  // Derive active tab and target to auto-expand from URL search params
  const searchParams = new URLSearchParams(search);
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "target"
      ? "target"
      : tabParam === "rollup"
        ? "rollup"
        : tabParam === "profile"
          ? "profile"
          : "sheets";
  const autoExpandTargetId = searchParams.get("targetId")
    ? parseInt(searchParams.get("targetId")!, 10)
    : undefined;
  const fromSheetId = searchParams.get("fromSheet")
    ? parseInt(searchParams.get("fromSheet")!, 10)
    : undefined;

  // Create sheet state
  const [createOpen, setCreateOpen] = useState(false);
  const [newSheetDate, setNewSheetDate] = useState(() =>
    perthDateISO(new Date())
  );
  const [newTargetId, setNewTargetId] = useState<number | null>(null);
  const [targetMode, setTargetMode] = useState<"none" | "link">("none");
  const [createTargetDialogOpen, setCreateTargetDialogOpen] = useState(false);

  const [cinList, setCinList] = useState<CinEntry[]>([]);
  const [cinInput, setCinInput] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [sheetSearch, setSheetSearch] = useState("");
  // The same line search as the Operations page, inside this operation: every
  // running sheet line that has the typed words (or a CIN) on it.
  const { data: lineSearch } = trpc.operation.searchLines.useQuery(
    { operationId, query: sheetSearch.trim() },
    { enabled: sheetSearch.trim().length > 0 }
  );
  const { viewMode } = useViewMode();
  // Copy/Move sheet dialog state
  const [copyMoveSheet, setCopyMoveSheet] = useState<{
    id: number;
    title: string;
  } | null>(null);

  // Edit operation state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPromis, setEditPromis] = useState("");
  const [editIms, setEditIms] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editCommand, setEditCommand] = useState<CommandCode>(DEFAULT_COMMAND);
  const [editRestricted, setEditRestricted] = useState(false);

  const utils = trpc.useUtils();

  const { data: operation, isLoading: opLoading } = trpc.operation.get.useQuery(
    { id: operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  const { data: sheets, isLoading: sheetsLoading } =
    trpc.sheet.listByOperation.useQuery(
      { operationId },
      { enabled: isAuthenticated && !!operationId }
    );

  // Fetch targets for this operation (used in create sheet dialog)
  const { data: operationTargets } = trpc.target.list.useQuery(
    { operationId },
    { enabled: isAuthenticated && !!operationId }
  );

  // Fetch ALL targets across all operations for the create-sheet target picker
  const { data: allTargetsForSheet } = trpc.target.listAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const [targetSearch, setTargetSearch] = useState("");

  // Full record for the selected target — used only for the title preview
  // below (the list queries above don't carry surname on every row).
  const { data: newSheetTarget } = trpc.target.getById.useQuery(
    { id: newTargetId ?? 0 },
    { enabled: !!newTargetId }
  );

  const newSheetTitlePreview = buildRunningSheetTitle({
    sheetDate: newSheetDate || null,
    authorCIN: cinList.find(c => c.isAuthor)?.cin ?? null,
    operationName: operation?.name ?? "…",
    targetBracketLabel:
      targetMode === "link"
        ? getTargetTitleBracket(newSheetTarget ?? null)
        : null,
  });

  // Fetch all users so we can add a whole team at once
  const { data: allUsers } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const myTeams = useMyTeams();
  // Teams an admin switched off "Offer on New Running Sheet" (e.g. PTT,
  // Capability, Admin, Investigators) get no button in the New Sheet dialog.
  const newSheetTeams = myTeams.filter(t => t.offerOnNewSheet);

  // Populate edit form when operation loads
  useEffect(() => {
    if (operation) {
      setEditName(operation.name ?? "");
      setEditPromis(operation.promisNumber ?? "");
      setEditIms(operation.imsNumber ?? "");
      setEditUnit(operation.investigationUnit ?? "");
      setEditCommand((operation.command as CommandCode) ?? DEFAULT_COMMAND);
      setEditRestricted(!!operation.restricted);
    }
  }, [operation]);

  const createSheet = trpc.sheet.create.useMutation({
    onSuccess: data => {
      utils.sheet.listByOperation.invalidate({ operationId });
      setCreateOpen(false);
      setNewSheetDate(perthDateISO(new Date()));
      setCinList([]);
      setCinInput("");
      toast.success("Running sheet created");
      navigate(`/sheet/${data.id}`);
    },
    onError: e => toast.error(e.message),
  });

  // New Target from within the "New Running Sheet" dialog — same structured
  // Add Target dialog as everywhere else, linked straight to this operation.
  const createTargetForSheet = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.list.invalidate({ operationId });
      utils.target.listAll.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const createLinkedTargetForSheet =
    trpc.target.registry.createLinkedFromAssociate.useMutation({
      onSuccess: () => {
        utils.target.list.invalidate({ operationId });
        utils.target.listAll.invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    });

  const updateOperation = trpc.operation.update.useMutation({
    onSuccess: () => {
      utils.operation.get.invalidate({ id: operationId });
      setEditOpen(false);
      toast.success("Operation updated");
    },
    onError: e => toast.error(e.message),
  });

  // Delete operation (moved from Home page into Edit dialog)
  const [deleteOpConfirm, setDeleteOpConfirm] = useState(false);
  const { data: deleteOpStats } = trpc.operation.deleteStats.useQuery(
    { id: operationId },
    { enabled: deleteOpConfirm }
  );
  const deleteOp = trpc.operation.delete.useMutation({
    onSuccess: () => {
      toast.success("Operation deleted");
      navigate("/");
    },
    onError: e => toast.error(e.message),
  });

  const deleteSheet = trpc.sheet.delete.useMutation({
    onSuccess: () => {
      utils.sheet.listByOperation.invalidate({ operationId });
      setDeleteId(null);
      toast.success("Sheet deleted");
    },
    onError: e => toast.error(e.message),
  });

  const handleAddTeam = (teamId: number) => {
    if (!allUsers) {
      toast.error("User list not available");
      return;
    }
    const members = allUsers.filter(u => u.teamId === teamId && !u.archivedAt);
    if (members.length === 0) {
      toast.error("No members found in that team");
      return;
    }
    let added = 0;
    setCinList(prev => {
      let updated = [...prev];
      for (const m of members) {
        if (!updated.some(c => c.cin.toLowerCase() === m.cin.toLowerCase())) {
          updated = [
            ...updated,
            {
              cin: m.cin,
              hasImages: false,
              isTeamLeader: false,
              isAuthor: false,
            },
          ];
          added++;
        }
      }
      return updated;
    });
    if (added === 0) toast.info("All team members already added");
    else
      toast.success(
        `Added ${added} member${added !== 1 ? "s" : ""} from ${myTeams.find(t => t.id === teamId)?.name ?? "the team"}`
      );
  };

  const handleAddCin = () => {
    const trimmed = cinInput.trim();
    if (!trimmed) return;
    if (cinList.some(c => c.cin.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("CIN already added");
      return;
    }
    setCinList(prev => [
      ...prev,
      { cin: trimmed, hasImages: false, isTeamLeader: false, isAuthor: false },
    ]);
    setCinInput("");
  };

  const handleRemoveCin = (cin: string) => {
    setCinList(prev => prev.filter(c => c.cin !== cin));
  };

  const handleToggleImages = (cin: string) => {
    setCinList(prev =>
      prev.map(c => (c.cin === cin ? { ...c, hasImages: !c.hasImages } : c))
    );
  };

  const handleCreate = () => {
    if (!newSheetDate) return;
    createSheet.mutate({
      operationId,
      sheetDate: newSheetDate,
      targetId: targetMode === "link" ? (newTargetId ?? undefined) : undefined,
      sheetCins: cinList.length > 0 ? cinList : undefined,
    });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setNewSheetDate(perthDateISO(new Date()));
      setNewTargetId(null);
      setTargetMode("none");
      setTargetSearch("");
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
      // Admin-only fields — only sent when an admin is editing (the server
      // rejects them from anyone else).
      ...(user?.role === "admin"
        ? { command: editCommand, restricted: editRestricted }
        : {}),
    });
  };

  // ── PDF export dialog — lives in the header (see Add/Export button
  // stack below) so it's reachable from any tab, not just Deployment
  // Rollup ────────────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"operation" | "target">(
    "operation"
  );
  const [exportTargetId, setExportTargetId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (exportMode === "target" && !exportTargetId) {
      toast.error("Pick a target to export.");
      return;
    }
    setIsExporting(true);
    try {
      const exportRows = await trpcClient.summary.exportRollup.query({
        operationId,
        targetId: exportMode === "target" ? exportTargetId : null,
      });
      if (exportRows.length === 0) {
        toast.error("No Supervisor Summaries to export for this selection.");
        return;
      }
      const targetName =
        exportMode === "target"
          ? (operationTargets?.find(t => t.id === exportTargetId)?.name ?? null)
          : null;
      buildRollupExportPdf({
        operationName: operation?.name ?? "Operation",
        targetName,
        rows: exportRows,
      });
      setExportOpen(false);
    } catch {
      toast.error("Couldn't build the export — please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = opLoading || sheetsLoading;

  return (
    <DashboardLayout>
      <Tabs
        value={activeTab}
        onValueChange={v => {
          const sp = new URLSearchParams(window.location.search);
          sp.set("tab", v);
          if (v !== "target") sp.delete("targetId");
          navigate(`/operation/${operationId}?${sp.toString()}`);
        }}
      >
        <div className="p-6 lg:p-8">
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
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2.5 rounded-lg bg-blue-700/10 border border-blue-700/20">
                  <FolderOpen className="w-5 h-5 text-blue-700" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground">
                  {opLoading ? (
                    <Skeleton className="h-7 w-48" />
                  ) : (
                    (operation?.name ?? "Operation")
                  )}
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
                      PROMIS:{" "}
                      <span className="text-foreground font-medium ml-0.5">
                        {operation.promisNumber}
                      </span>
                    </span>
                  )}
                  {operation.imsNumber && (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Hash className="w-3.5 h-3.5" />
                      IMS:{" "}
                      <span className="text-foreground font-medium ml-0.5">
                        {operation.imsNumber}
                      </span>
                    </span>
                  )}
                  {operation.investigationUnit && (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="text-foreground font-medium">
                        {operation.investigationUnit}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="shrink-0">
              {activeTab === "sheets" && (
                <Button
                  size="sm"
                  className="gap-1.5 justify-center"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                  <span className="hidden sm:inline">&nbsp;Running Sheet</span>
                </Button>
              )}
              {activeTab === "rollup" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 justify-center"
                  onClick={() => setExportOpen(true)}
                >
                  <FileDown className="w-3.5 h-3.5" />
                  Export
                </Button>
              )}
            </div>
          </div>

          {/* Main tabs: Running Sheets | Deployment Summaries */}
          {/* flex-wrap so the "Back to Running Sheet" button below drops to
            its own line on a narrow screen rather than squeezing the tabs
            off one row. */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* grid-cols-3 (not the default flex-1) so all three triggers
                stay exactly the same width as each other at every screen
                size, not just on mobile — equal-width, symmetrical tabs is
                a standing UI requirement for this app, see CLAUDE.md.
                "Deployment Summaries" and "Operation Profile" each shorten
                below sm, where there isn't room for the full label; sm+
                shows the full name. min-w-0 + truncate stays on as a
                safety net if that shared width ever gets tight regardless. */}
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger
                value="sheets"
                className="w-full min-w-0 text-xs sm:text-sm"
              >
                <FileText className="hidden sm:block w-3.5 h-3.5 mr-1.5 shrink-0" />
                <span className="truncate sm:hidden">Sheets</span>
                <span className="truncate hidden sm:inline">
                  Running Sheets
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="rollup"
                className="w-full min-w-0 text-xs sm:text-sm"
              >
                <History className="hidden sm:block w-3.5 h-3.5 mr-1.5 shrink-0" />
                <span className="truncate sm:hidden">Summaries</span>
                <span className="truncate hidden sm:inline">
                  Deployment Summaries
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="profile"
                className="w-full min-w-0 text-xs sm:text-sm"
              >
                <IdCard className="hidden sm:block w-3.5 h-3.5 mr-1.5 shrink-0" />
                <span className="truncate sm:hidden">Profile</span>
                <span className="truncate hidden sm:inline">
                  Operation Profile
                </span>
              </TabsTrigger>
              {/* No visible "Add Target" trigger — target creation/editing
                  lives in the New Running Sheet dialog, the Edit Running
                  Sheet target-edit pencil, and the Target Registry page.
                  The tab/content itself (TabsContent value="target" below)
                  stays wired up so those deep links (?tab=target&targetId=…)
                  still land on the same TargetPanel as before. */}
            </TabsList>
            {/* Back to Running Sheet — shown when navigated here from a sheet */}
            {fromSheetId && (
              <button
                onClick={() => navigate(`/sheet/${fromSheetId}`)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md border border-border hover:border-border bg-background hover:bg-muted/40"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Running Sheet
              </button>
            )}
          </div>
        </div>
        {/* end header wrapper — none of this page's tabs cap width with a
        max-w-* anymore, so the header above and every tab's content below
        read as one consistent full-width surface. */}

        {/* ── Running Sheets tab ── */}
        {/* The padding classes go on this inner div, not on TabsContent
          itself — TabsContent is a flex item (shadcn's own "flex-1"
          default, inside the Tabs root's "flex flex-col"), and a flex
          item's default min-width:auto refuses to shrink below its
          content's natural width, which previously fought a max-w-4xl
          constraint placed directly on TabsContent (too-narrow centering
          on desktop, horizontal overflow on phone with a long card
          title). A plain block-level div doesn't have that flex quirk —
          kept even though there's no width cap left to protect, since
          TabsContent still can't safely carry className directly. */}
        <TabsContent value="sheets">
          <div className="px-6 lg:px-8 pb-6 lg:pb-8">
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : !sheets || sheets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-2xl bg-muted/40 mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-foreground font-medium mb-1">
                  No running sheets yet
                </p>
                <p className="text-muted-foreground text-sm mb-4">
                  Create the first running sheet for this operation
                </p>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="w-4 h-4" />
                  New Running Sheet
                </Button>
              </div>
            ) : (
              (() => {
                const filteredSheets = sheets.filter(sheet => {
                  if (!sheetSearch.trim()) return true;
                  const q = sheetSearch.trim().toLowerCase();
                  if (sheet.title.toLowerCase().includes(q)) return true;
                  const cins: CinEntry[] = (() => {
                    try {
                      return sheet.sheetCins ? JSON.parse(sheet.sheetCins) : [];
                    } catch {
                      return [];
                    }
                  })();
                  if (cins.some(c => c.cin.toLowerCase().includes(q)))
                    return true;
                  const tgt = operationTargets?.find(
                    t =>
                      t.id === (sheet as { targetId?: number | null }).targetId
                  );
                  if (tgt && tgt.name.toLowerCase().includes(q)) return true;
                  return false;
                });
                return (
                  <div className="flex flex-col gap-2">
                    {/* Search bar */}
                    <div className="relative mb-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search sheets by title, CIN or target, or any line…"
                        value={sheetSearch}
                        onChange={e => setSheetSearch(e.target.value)}
                        className="pl-8 pr-9 h-9 text-sm"
                      />
                      <ClearInputButton
                        value={sheetSearch}
                        onClear={() => setSheetSearch("")}
                      />
                    </div>
                    {sheetSearch.trim() && lineSearch && (
                      <OperationSearchHits
                        hits={lineSearch.hits as SearchRowHit[]}
                        total={lineSearch.total}
                        query={sheetSearch.trim()}
                      />
                    )}
                    {sheetSearch.trim() &&
                      filteredSheets.length === 0 &&
                      lineSearch &&
                      lineSearch.total === 0 && (
                        <p className="text-sm text-muted-foreground italic px-1">
                          No running sheet or line matches “{sheetSearch.trim()}
                          ”.
                        </p>
                      )}
                    {viewMode === "tile" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredSheets.map(sheet => {
                          const parsedCins: CinEntry[] = (() => {
                            try {
                              const raw: CinEntry[] = sheet.sheetCins
                                ? JSON.parse(sheet.sheetCins)
                                : [];
                              return [...raw].sort((a, b) => {
                                if (a.isTeamLeader && !b.isTeamLeader)
                                  return -1;
                                if (!a.isTeamLeader && b.isTeamLeader) return 1;
                                const aNum = parseInt(a.cin, 10);
                                const bNum = parseInt(b.cin, 10);
                                if (!isNaN(aNum) && !isNaN(bNum))
                                  return aNum - bNum;
                                return a.cin.localeCompare(b.cin);
                              });
                            } catch {
                              return [];
                            }
                          })();
                          const cinNames = parsedCins.map(c => c.cin);
                          const assignedTarget = operationTargets?.find(
                            t =>
                              t.id ===
                              (sheet as { targetId?: number | null }).targetId
                          );
                          return (
                            <SheetTileCard
                              key={sheet.id}
                              sheet={sheet}
                              cinNames={cinNames}
                              cinEntries={parsedCins}
                              targetName={assignedTarget?.name}
                              isAdmin={
                                user?.role === "admin" ||
                                user?.role === "member"
                              }
                              onNavigate={() => navigate(`/sheet/${sheet.id}`)}
                              onCopyMove={() =>
                                setCopyMoveSheet({
                                  id: sheet.id,
                                  title: sheet.title,
                                })
                              }
                            />
                          );
                        })}
                      </div>
                    ) : (
                      filteredSheets.map(sheet => {
                        const parsedCins: CinEntry[] = (() => {
                          try {
                            const raw: CinEntry[] = sheet.sheetCins
                              ? JSON.parse(sheet.sheetCins)
                              : [];
                            return [...raw].sort((a, b) => {
                              if (a.isTeamLeader && !b.isTeamLeader) return -1;
                              if (!a.isTeamLeader && b.isTeamLeader) return 1;
                              const aNum = parseInt(a.cin, 10);
                              const bNum = parseInt(b.cin, 10);
                              if (!isNaN(aNum) && !isNaN(bNum))
                                return aNum - bNum;
                              return a.cin.localeCompare(b.cin);
                            });
                          } catch {
                            return [];
                          }
                        })();
                        const cinNames = parsedCins.map(c => c.cin);
                        const assignedTarget = operationTargets?.find(
                          t =>
                            t.id ===
                            (sheet as { targetId?: number | null }).targetId
                        );
                        return (
                          <SheetCard
                            key={sheet.id}
                            sheet={sheet}
                            cinNames={cinNames}
                            cinEntries={parsedCins}
                            isAdmin={
                              user?.role === "admin" || user?.role === "member"
                            }
                            targetName={assignedTarget?.name ?? null}
                            onNavigate={() => navigate(`/sheet/${sheet.id}`)}
                            onDelete={() => setDeleteId(sheet.id)}
                            onCopyMove={() =>
                              setCopyMoveSheet({
                                id: sheet.id,
                                title: sheet.title,
                              })
                            }
                          />
                        );
                      })
                    )}
                  </div>
                );
              })()
            )}

            {sheets && sheets.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3 text-right">
                {sheets.length} running sheet{sheets.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        </TabsContent>

        {/* ── Deployment Summaries tab ── */}
        <TabsContent value="rollup">
          <div className="px-6 lg:px-8 pb-6 lg:pb-8">
            <DeploymentRollupPanel
              operationId={operationId}
              targets={operationTargets}
            />
          </div>
        </TabsContent>

        {/* ── Operation Profile tab — the same Operation Profile page
              ("Full Profile" from the Intelligence folder) mounted inline,
              so an officer doesn't have to leave this page to see it. No
              wrapper div here — OperationProfileContent carries its own
              px-6/lg:px-8 padding, matching the header above and the other
              three tabs' own wrapper now that none of them cap width with
              a max-w-*, so the whole page (header, tab bar, and every
              tab's content) reads as one consistent full-width surface. */}
        <TabsContent value="profile">
          <OperationProfileContent operationId={operationId} />
        </TabsContent>

        {/* ── Add Target tab ── */}
        <TabsContent value="target">
          <div className="px-6 lg:px-8 pb-6 lg:pb-8">
            <TargetPanel
              operationId={operationId}
              operationName={operation?.name ?? ""}
              autoExpandId={autoExpandTargetId}
              fromSheetId={fromSheetId}
            />
          </div>
        </TabsContent>
      </Tabs>

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
                onChange={e => setEditName(e.target.value.toUpperCase())}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                PROMIS Number
              </label>
              <Input
                placeholder="e.g. PROM-2024-001"
                value={editPromis}
                onChange={e => setEditPromis(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                IMS Number
              </label>
              <Input
                placeholder="e.g. IMS-2024-001"
                value={editIms}
                onChange={e => setEditIms(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Investigation Unit
              </label>
              <Input
                placeholder="e.g. Major Crime Unit"
                value={editUnit}
                onChange={e => setEditUnit(e.target.value)}
              />
            </div>
            <OperationRegionFields
              command={editCommand}
              restricted={editRestricted}
              canEdit={user?.role === "admin"}
              commandEditable
              onCommand={setEditCommand}
              onRestricted={setEditRestricted}
            />
          </div>
          <DialogFooter className="flex items-center justify-between w-full">
            <div className="flex-1">
              {user?.role === "admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  onClick={() => {
                    setEditOpen(false);
                    setDeleteOpConfirm(true);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Operation
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleEditSave}
                disabled={!editName.trim() || updateOperation.isPending}
              >
                {updateOperation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Deployment Summaries Dialog — the header's Export button
          applies regardless of which tab is active, since it always
          exports the operation's rollup, not the tab's own content. */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Deployment Summaries</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <RadioGroup
              value={exportMode}
              onValueChange={v => setExportMode(v as "operation" | "target")}
              className="gap-2.5"
            >
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <RadioGroupItem value="operation" />
                Operation export — every summary in this operation
              </label>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <RadioGroupItem value="target" />
                Target export — one target only
              </label>
            </RadioGroup>

            {exportMode === "target" && (
              <Select
                value={exportTargetId ? String(exportTargetId) : undefined}
                onValueChange={v => setExportTargetId(Number(v))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Choose a target…" />
                </SelectTrigger>
                <SelectContent>
                  {operationTargets?.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExportOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              {isExporting ? "Building…" : "Export PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Operation Confirmation */}
      <AlertDialog
        open={deleteOpConfirm}
        onOpenChange={o => !o && setDeleteOpConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operation?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This action <strong>cannot be undone</strong>. The following
                  will be permanently deleted:
                </p>
                {deleteOpStats ? (
                  <ul className="text-sm space-y-1 pl-1">
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span>
                        <strong>{deleteOpStats.sheetCount}</strong> running
                        sheet{deleteOpStats.sheetCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span>
                        <strong>{deleteOpStats.rowCount}</strong> observation
                        row{deleteOpStats.rowCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-destructive/70" />
                      <span>
                        <strong>{deleteOpStats.targetCount}</strong> target
                        {deleteOpStats.targetCount !== 1 ? "s" : ""}
                      </span>
                    </li>
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Loading details…
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteOp.mutate({ id: operationId })}
            >
              Delete Operation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Sheet Dialog */}
      <Dialog open={createOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Running Sheet</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* Date — the sheet's title is generated from this + the
                Author/Target below, not typed in directly. */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Date <span className="text-destructive">*</span>
              </label>
              <Input
                type="date"
                value={newSheetDate}
                onChange={e => setNewSheetDate(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5 font-mono truncate">
                {newSheetTitlePreview}
              </p>
            </div>

            {/* Target selector — New / Link Existing / None */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Target{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <div className="flex flex-col gap-2">
                {/* Operation's existing targets — selectable */}
                {(operationTargets ?? []).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (newTargetId === t.id) {
                        setNewTargetId(null);
                        setTargetMode("none");
                      } else {
                        setNewTargetId(t.id);
                        setTargetMode("link");
                      }
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors w-full ${
                      newTargetId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <Target className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">
                      {t.name}
                    </span>
                    {newTargetId === t.id && (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    )}
                  </button>
                ))}

                {/* Link Existing search panel */}
                {targetMode === "link" && newTargetId === null && (
                  <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="relative flex-1">
                        <Input
                          autoFocus
                          className="h-8 w-full pr-8 text-sm"
                          placeholder="Search by name, TGT code or operation…"
                          value={targetSearch}
                          onChange={e => setTargetSearch(e.target.value)}
                        />
                        <ClearInputButton
                          value={targetSearch}
                          onClear={() => setTargetSearch("")}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => {
                          setTargetMode("none");
                          setTargetSearch("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
                      {(allTargetsForSheet ?? []).filter(t => {
                        const q = targetSearch.toLowerCase();
                        return (
                          t.name.toLowerCase().includes(q) ||
                          (t.tgt ?? "").toLowerCase().includes(q) ||
                          (t.operationName ?? "").toLowerCase().includes(q)
                        );
                      }).length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {targetSearch
                            ? "No matching targets"
                            : "Start typing to search"}
                        </p>
                      ) : (
                        (allTargetsForSheet ?? [])
                          .filter(t => {
                            const q = targetSearch.toLowerCase();
                            return (
                              t.name.toLowerCase().includes(q) ||
                              (t.tgt ?? "").toLowerCase().includes(q) ||
                              (t.operationName ?? "").toLowerCase().includes(q)
                            );
                          })
                          .map(t => (
                            <button
                              key={t.id}
                              type="button"
                              className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-muted/60 text-left transition-colors w-full"
                              onClick={() => {
                                setNewTargetId(t.id);
                                setTargetSearch("");
                                setTargetMode("link");
                              }}
                            >
                              <Target className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {t.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t.tgt ? (
                                    <span className="font-mono mr-2">
                                      TGT: {t.tgt}
                                    </span>
                                  ) : null}
                                  {t.operationName ? (
                                    <span>Op: {t.operationName}</span>
                                  ) : null}
                                </p>
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {/* Selected linked target chip */}
                {targetMode === "link" &&
                  newTargetId !== null &&
                  !(operationTargets ?? []).find(t => t.id === newTargetId) && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary bg-primary/10 text-primary">
                      <Target className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">
                        {
                          (allTargetsForSheet ?? []).find(
                            t => t.id === newTargetId
                          )?.name
                        }
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTargetId(null);
                          setTargetMode("none");
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                {/* Action buttons */}
                {!(targetMode === "link" && newTargetId === null) && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setCreateTargetDialogOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5" /> New Target
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setTargetMode("link");
                        setNewTargetId(null);
                        setTargetSearch("");
                      }}
                    >
                      <Search className="w-3.5 h-3.5" /> Link Existing
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* TEAM */}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                TEAM{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>

              {/* CIN input row */}
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="Enter CIN and press Add"
                  value={cinInput}
                  onChange={e => setCinInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCin();
                    }
                  }}
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
              {/* Team group buttons — only shown to admins who have allUsers loaded */}
              {user?.role === "admin" && newSheetTeams.length > 0 && (
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  <span className="text-xs text-muted-foreground self-center mr-1">
                    Add team:
                  </span>
                  {newSheetTeams.map(t => (
                    <Button
                      key={t.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddTeam(t.id)}
                      className="text-xs h-7 px-2.5"
                    >
                      {t.name.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )}

              {/* CIN list */}
              {cinList.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_40px_40px_40px_32px] px-3 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <span>CIN</span>
                    <span
                      className="flex items-center justify-center"
                      title="Team Leader"
                    >
                      <Star className="w-3 h-3 text-yellow-700 dark:text-yellow-300 fill-yellow-400" />
                    </span>
                    <span
                      className="flex items-center justify-center"
                      title="Author"
                    >
                      <Pencil className="w-3 h-3 text-sky-700 dark:text-sky-300" />
                    </span>
                    <span
                      className="flex items-center justify-center"
                      title="Images"
                    >
                      <Camera className="w-3 h-3" />
                    </span>
                    <span></span>
                  </div>
                  {cinList.map(entry => (
                    <div
                      key={entry.cin}
                      className="grid grid-cols-[1fr_40px_40px_40px_32px] items-center px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <span className="text-sm font-mono font-medium text-foreground">
                        {entry.cin}
                      </span>
                      {/* Team Leader — radio: selecting one clears all others */}
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!entry.isTeamLeader}
                          onCheckedChange={() =>
                            setCinList(prev =>
                              prev.map(c => ({
                                ...c,
                                isTeamLeader:
                                  c.cin === entry.cin
                                    ? !entry.isTeamLeader
                                    : false,
                              }))
                            )
                          }
                          className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
                        />
                      </div>
                      {/* Author — radio: selecting one clears all others */}
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!entry.isAuthor}
                          onCheckedChange={() =>
                            setCinList(prev =>
                              prev.map(c => ({
                                ...c,
                                isAuthor:
                                  c.cin === entry.cin ? !entry.isAuthor : false,
                              }))
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
            <Button variant="outline" onClick={() => handleDialogClose(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newSheetDate || createSheet.isPending}
            >
              {createSheet.isPending ? "Creating…" : "Create Sheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Target — same structured Add Target dialog used everywhere else */}
      <AddTargetDialog
        open={createTargetDialogOpen}
        onClose={() => setCreateTargetDialogOpen(false)}
        initialOperation={{ id: operationId, name: operation?.name ?? "" }}
        onSave={async (payload: RegistryCreatePayload) => {
          const { existingAssociateId, ...rest } = payload;
          const result = existingAssociateId
            ? await createLinkedTargetForSheet.mutateAsync({
                ...rest,
                existingAssociateId,
              })
            : await createTargetForSheet.mutateAsync(rest);
          setNewTargetId(result.id);
          setTargetMode("link");
          return result;
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={o => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Running Sheet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the running sheet and all its rows,
              members, and certifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteId !== null && deleteSheet.mutate({ id: deleteId })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy / Move sheet dialog */}
      {copyMoveSheet && (
        <CopyMoveSheetDialog
          open={copyMoveSheet !== null}
          onOpenChange={v => {
            if (!v) setCopyMoveSheet(null);
          }}
          sheetId={copyMoveSheet.id}
          sheetTitle={copyMoveSheet.title}
          currentOperationId={operationId}
        />
      )}
    </DashboardLayout>
  );
}
