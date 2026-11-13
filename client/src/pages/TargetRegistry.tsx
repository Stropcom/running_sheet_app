import { ClearInputButton } from "@/components/ClearInputButton";
import { useCommandFeature } from "@/lib/commandFeatures";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  Plus,
  BookOpen,
  Target,
  ArrowDownAZ,
  Clock,
  Folder,
  Car,
  Home,
  FileText,
  User,
  MapPin,
} from "lucide-react";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useLocation } from "wouter";
import { AddTargetDialog } from "@/components/AddTargetDialog";
import {
  ImportTargetDocumentDialog,
  type DocumentImportPrefill,
  type ImportSession,
} from "@/components/ImportTargetDocumentDialog";
import { documentTargetCount } from "@/lib/importDocumentFocus";
import { IndicesBadge } from "@/components/IndicesBadge";
import type { RegistryTarget } from "./targetRegistry/types";
import { targetTypeIcon } from "./targetRegistry/registryHelpers";
import { TargetCard } from "./targetRegistry/TargetCard";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TargetRegistryPage() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const { data: targets, isLoading } = trpc.target.registry.list.useQuery();

  const { viewMode } = useViewMode();
  const [showImportDocument, setShowImportDocument] = useState(false);
  // Import Target can be switched off for a Command (shared/commandFeatures.ts).
  const importEnabled = useCommandFeature("import");
  const [importPrefill, setImportPrefill] =
    useState<DocumentImportPrefill | null>(null);
  const [importKey, setImportKey] = useState(0);
  // The imported document currently being worked through, pointing at the
  // target now being reviewed/added. Back from the Add Target form returns to
  // that target's review; after each target is saved the Import review reopens
  // for the next one (then its Add Target form), so every target in a
  // multi-target document goes through the same steps.
  const [importSession, setImportSession] = useState<ImportSession | null>(
    null
  );
  // The Operation the previous target in the batch was saved against —
  // pre-selected for the next one (the whole document is about one
  // operation, so re-picking it five times would be pure friction).
  const [importOperation, setImportOperation] = useState<{
    id: number;
    name: string;
  } | null>(null);
  // Ends a multi-target document early (the dialog was cancelled/closed) —
  // the officer can re-import the document to pick up any targets left.
  const endImportSession = () => {
    if (
      importSession &&
      importSession.focus + 1 < documentTargetCount(importSession.full)
    ) {
      toast.info(
        "Stopped importing this document — re-import it to pick up any targets not yet added."
      );
    }
    setImportSession(null);
    setImportOperation(null);
  };
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"alpha" | "recent" | "operation">(
    "alpha"
  );
  const [filterOperationId, setFilterOperationId] = useState<number | null>(
    null
  );
  const [showCreate, setShowCreate] = useState(false);
  // Store just the id, not a snapshot of the target object — deriving it
  // live from `targets` below means the tile dialog always reflects the
  // latest data (e.g. right after a merge), instead of freezing whatever
  // was true at the moment the tile was clicked.
  const [selectedTileTargetId, setSelectedTileTargetId] = useState<
    number | null
  >(null);
  const selectedTileTarget =
    (targets?.find(t => t.id === selectedTileTargetId) as
      | RegistryTarget
      | undefined) ?? null;

  const createMutation = trpc.target.registry.create.useMutation({
    onSuccess: () => {
      utils.target.registry.list.invalidate();
      toast.success("Target added to registry.");
    },
  });

  const createLinkedMutation =
    trpc.target.registry.createLinkedFromAssociate.useMutation({
      onSuccess: () => {
        utils.target.registry.list.invalidate();
        toast.success("Target created and linked to the existing associate.");
      },
    });

  // Options for the Operation filter dropdown — every operation actually
  // linked to at least one target, rather than every operation in the app
  // (an operation with no targets would be a dead-end filter choice).
  const operationFilterOptions = useMemo(() => {
    if (!targets) return [];
    const byId = new Map<number, string>();
    for (const t of targets) {
      for (const op of t.linkedOperations) {
        if (!byId.has(op.operationId))
          byId.set(op.operationId, op.operationName ?? "");
      }
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [targets]);

  const filtered = useMemo(() => {
    if (!targets) return [];
    const q = search.trim().toLowerCase();
    const searched = !q
      ? [...targets]
      : targets.filter(
          t =>
            t.name.toLowerCase().includes(q) ||
            (t.tgt ?? "").toLowerCase().includes(q) ||
            (t.hb ?? "").toLowerCase().includes(q) ||
            (t.hbf ?? "").toLowerCase().includes(q) ||
            (t.v1 ?? "").toLowerCase().includes(q) ||
            (t.v1f ?? "").toLowerCase().includes(q) ||
            (t.v2 ?? "").toLowerCase().includes(q) ||
            (t.v2f ?? "").toLowerCase().includes(q) ||
            t.linkedOperations.some(op =>
              (op.operationName ?? "").toLowerCase().includes(q)
            )
        );
    const opFiltered =
      filterOperationId === null
        ? searched
        : searched.filter(t =>
            t.linkedOperations.some(op => op.operationId === filterOperationId)
          );

    return [...opFiltered].sort((a, b) => {
      if (sortBy === "alpha") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "recent") {
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }
      if (sortBy === "operation") {
        // Sort by first linked operation name alphabetically; unlinked targets go last
        const aOp =
          a.linkedOperations
            .map(o => o.operationName ?? "")
            .sort((x, y) => x.localeCompare(y))[0] ?? "";
        const bOp =
          b.linkedOperations
            .map(o => o.operationName ?? "")
            .sort((x, y) => x.localeCompare(y))[0] ?? "";
        if (!aOp && bOp) return 1; // a unlinked → goes after b
        if (aOp && !bOp) return -1; // b unlinked → a comes first
        const opCmp = aOp.localeCompare(bOp);
        return opCmp !== 0 ? opCmp : a.name.localeCompare(b.name); // tie-break by name
      }
      return 0;
    });
  }, [targets, search, sortBy, filterOperationId]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-400/10 border border-rose-400/20 shrink-0">
              <BookOpen className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Target Registry
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                All targets are stored here independently. Deleting an operation
                or running sheet does not remove targets.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {importEnabled && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowImportDocument(true)}
              >
                <FileText className="h-4 w-4" /> Import Target
              </Button>
            )}
            <Button className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Add Target
            </Button>
          </div>
        </div>

        {/* Search + Filter + Sort */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 sm:flex-none sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 pr-9"
              placeholder="Search targets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <ClearInputButton value={search} onClear={() => setSearch("")} />
          </div>
          {/* Filter + Sort share one row even on mobile, rather than each
              stacking onto its own line — Recent drops out below sm since
              Filter/A–Z/Operation alone already fill a phone-width row. */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Operation filter — same control as the Intelligence folder's
                Targets tab (Filter: All operations / a specific one). */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="hidden sm:inline text-xs text-muted-foreground">
                Filter:
              </span>
              <Select
                value={filterOperationId?.toString() ?? "all"}
                onValueChange={v =>
                  setFilterOperationId(v === "all" ? null : Number(v))
                }
              >
                <SelectTrigger className="h-9 w-auto min-w-[7rem] sm:min-w-[9rem] text-xs">
                  <SelectValue placeholder="Operation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All operations</SelectItem>
                  {operationFilterOptions.map(op => (
                    <SelectItem key={op.id} value={op.id.toString()}>
                      {op.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Sort toggle buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant={sortBy === "alpha" ? "default" : "outline"}
                className="gap-1.5 h-9 px-2 sm:px-3 text-xs"
                onClick={() => setSortBy("alpha")}
                title="Sort A–Z"
              >
                <ArrowDownAZ className="w-3.5 h-3.5" />
                A–Z
              </Button>
              <Button
                size="sm"
                variant={sortBy === "recent" ? "default" : "outline"}
                className="hidden sm:inline-flex gap-1.5 h-9 px-3 text-xs"
                onClick={() => setSortBy("recent")}
                title="Sort by most recently updated"
              >
                <Clock className="w-3.5 h-3.5" />
                Recent
              </Button>
              <Button
                size="sm"
                variant={sortBy === "operation" ? "default" : "outline"}
                className="gap-1.5 h-9 px-2 sm:px-3 text-xs"
                onClick={() => setSortBy("operation")}
                title="Sort by operation name"
              >
                <Folder className="w-3.5 h-3.5" />
                Operation
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        {targets && (
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {targets.length} target
            {targets.length !== 1 ? "s" : ""}
          </p>
        )}

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Target className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground font-medium">
              {search
                ? "No targets match your search."
                : "No targets in the registry yet."}
            </p>
            {!search && (
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="h-4 w-4" /> Add First Target
              </Button>
            )}
          </div>
        ) : viewMode === "tile" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => (
              <div
                key={t.id}
                className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                onClick={() => setSelectedTileTargetId(t.id)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2.5 rounded-lg bg-rose-400/10 border border-rose-400/20 shrink-0">
                    {targetTypeIcon(t.targetType)}
                  </div>
                </div>

                {/* Name */}
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-foreground leading-tight line-clamp-2">
                    {t.name}
                  </p>
                  {t.isIndicesOnly && <IndicesBadge />}
                </div>

                {/* Key details */}
                <div className="flex flex-col gap-1 mt-auto">
                  {(t.v1f || t.v1) && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Car className="w-3 h-3 shrink-0" />
                      <span className="truncate text-foreground/80">
                        {t.v1f ?? t.v1}
                      </span>
                    </span>
                  )}
                  {(t.hbf || t.hb) && (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Home className="w-3 h-3 shrink-0" />
                      <span className="truncate text-foreground/80">
                        {t.hbf ?? t.hb}
                      </span>
                    </span>
                  )}
                </div>

                {/* Linked operations */}
                {t.linkedOperations.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border/40">
                    {t.linkedOperations.slice(0, 2).map(op => (
                      <Badge
                        key={op.operationId}
                        variant="secondary"
                        className="text-xs gap-1"
                      >
                        <BookOpen className="h-3 w-3" />
                        {op.operationName ?? `Op #${op.operationId}`}
                      </Badge>
                    ))}
                    {t.linkedOperations.length > 2 && (
                      <Badge variant="outline" className="text-xs">
                        +{t.linkedOperations.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => (
              <TargetCard
                key={t.id}
                target={t as RegistryTarget}
                onDeleted={() => {}}
              />
            ))}
          </div>
        )}

        {/* Tile view — target detail dialog */}
        {selectedTileTarget && (
          <Dialog
            open={!!selectedTileTarget}
            onOpenChange={open => {
              if (!open) setSelectedTileTargetId(null);
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedTileTarget.targetType === "vehicle" ? (
                    <Car className="w-4 h-4 text-primary" />
                  ) : selectedTileTarget.targetType === "location" ? (
                    <MapPin className="w-4 h-4 text-primary" />
                  ) : (
                    <User className="w-4 h-4 text-primary" />
                  )}
                  {selectedTileTarget.name}
                </DialogTitle>
              </DialogHeader>
              <TargetCard
                target={selectedTileTarget}
                onDeleted={() => {
                  setSelectedTileTargetId(null);
                  utils.target.registry.list.invalidate();
                }}
                defaultExpanded
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Add Target dialog — re-mounted with a fresh key whenever a document
          import hands it a pre-fill, so lazy state init picks up the new
          values instead of whatever a previous import (or a blank open)
          already initialised. */}
      <AddTargetDialog
        key={importPrefill ? `import-${importKey}` : "blank"}
        open={showCreate}
        onClose={() => {
          setShowCreate(false);
          setImportPrefill(null);
          // Cancelling any one target ends the rest of the batch — the
          // officer can re-import the document to pick the others up.
          endImportSession();
        }}
        initialOperation={importOperation}
        onSaved={savedOperation => {
          setShowCreate(false);
          setImportPrefill(null);
          if (
            !importSession ||
            importSession.focus + 1 >= documentTargetCount(importSession.full)
          ) {
            setImportSession(null);
            setImportOperation(null);
            return;
          }
          // Back to the review screen for the next target in the document.
          setImportSession({
            ...importSession,
            focus: importSession.focus + 1,
          });
          setImportOperation(savedOperation);
          setShowImportDocument(true);
        }}
        onBack={
          importSession
            ? () => {
                // Return to this target's review screen.
                setShowCreate(false);
                setImportPrefill(null);
                setShowImportDocument(true);
              }
            : undefined
        }
        onSave={async payload => {
          const { existingAssociateId, ...rest } = payload;
          if (existingAssociateId) {
            return await createLinkedMutation.mutateAsync({
              ...rest,
              existingAssociateId,
            });
          }
          return await createMutation.mutateAsync(rest);
        }}
        initialIdentity={importPrefill?.identity}
        initialAddress={importPrefill?.address}
        initialVehicle={importPrefill?.vehicle}
        initialExtraAddresses={importPrefill?.extraAddresses}
        initialExtraVehicles={importPrefill?.extraVehicles}
        initialAssociates={importPrefill?.associates}
        initialStatus={importPrefill?.status}
        initialImages={importPrefill?.images}
        initialBackground={importPrefill?.background}
        initialDocumentSnapshot={importPrefill}
      />

      {/* Import from Document dialog */}
      <ImportTargetDocumentDialog
        open={showImportDocument}
        session={importSession}
        onBackToUpload={() => setImportSession(null)}
        onClose={() => {
          setShowImportDocument(false);
          endImportSession();
        }}
        onContinue={(prefill, nextSession) => {
          // A fresh upload starts with no operation chosen; a later target
          // in the same document keeps the one already picked.
          if (!importSession) setImportOperation(null);
          setImportSession(nextSession);
          setImportPrefill(prefill);
          setImportKey(k => k + 1);
          setShowImportDocument(false);
          setShowCreate(true);
        }}
      />
    </DashboardLayout>
  );
}
