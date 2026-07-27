import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderOpen,
  Image as ImageIcon,
  ArrowLeft,
  X,
  List,
  LayoutGrid,
  Upload,
  Clock,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LinkAttachmentDialog } from "@/components/LinkAttachmentDialog";
import { DeletePhotoButton } from "@/components/DeletePhotoButton";
import { AttachmentLinkBadge } from "@/components/AttachmentLinkBadge";
import { UploadImageDialog } from "@/components/UploadImageDialog";
import { formatAttachmentBanner } from "@/lib/attachmentBanner";

// Folder progression: Images → Operation → Running Sheet → RS images

export default function ImagesPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ operationId?: string; sheetId?: string }>();
  const operationId = params.operationId
    ? parseInt(params.operationId, 10)
    : null;
  const sheetId = params.sheetId ? parseInt(params.sheetId, 10) : null;

  return (
    <DashboardLayout>
      {operationId && sheetId ? (
        <SheetGallery
          operationId={operationId}
          sheetId={sheetId}
          onBack={() => navigate(`/images/${operationId}`)}
        />
      ) : operationId ? (
        <SheetFolderList
          operationId={operationId}
          onBack={() => navigate("/images")}
          onSelect={id => navigate(`/images/${operationId}/${id}`)}
        />
      ) : (
        <OperationFolderList
          isAuthenticated={isAuthenticated}
          onSelect={id => navigate(`/images/${id}`)}
        />
      )}
    </DashboardLayout>
  );
}

function OperationFolderList({
  isAuthenticated,
  onSelect,
}: {
  isAuthenticated: boolean;
  onSelect: (id: number) => void;
}) {
  const [topTab, setTopTab] = useState<"operations" | "uploaded">("operations");
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: operations, isLoading } = trpc.operation.list.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
    }
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/20">
          <ImageIcon className="w-5 h-5 text-pink-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Images</h1>
          <p className="text-sm text-muted-foreground">
            Photos attached to running sheet observations, by operation.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
          <Upload className="w-3.5 h-3.5" />
          Upload
        </Button>
      </div>

      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl border border-border bg-muted/30 w-fit">
        <button
          onClick={() => setTopTab("operations")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            topTab === "operations"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          By Operation
        </button>
        <button
          onClick={() => setTopTab("uploaded")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            topTab === "uploaded"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Uploaded
        </button>
      </div>

      {topTab === "uploaded" ? (
        <UploadedGallery />
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !operations || operations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-2xl bg-muted/40 mb-4">
            <FolderOpen className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">No operations yet</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {operations.map((op: any) => (
            <div
              key={op.id}
              className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-pink-500/30 transition-all duration-150 cursor-pointer"
              onClick={() => onSelect(op.id)}
            >
              <div className="p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/20 shrink-0">
                <FolderOpen className="w-5 h-5 text-pink-500" />
              </div>
              <span className="font-semibold text-foreground truncate flex-1">
                {op.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <UploadImageDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

// Flat, cross-operation list of every manually-uploaded photo, newest
// first, sub-grouped by upload date so a large backlog is still scannable.
function UploadedGallery() {
  const utils = trpc.useUtils();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ id: number; url: string } | null>(null);
  const { data: attachments, isLoading } = trpc.attachment.listUploaded.useQuery();

  const deleteAttachment = trpc.attachment.delete.useMutation({
    onSuccess: () => {
      utils.attachment.listUploaded.invalidate();
      utils.attachment.listByOperation.invalidate();
      toast.success("Photo deleted");
    },
    onError: e => toast.error(e.message),
  });

  const groupedByDate = useMemo(() => {
    if (!attachments) return [];
    const byDate = new Map<string, { label: string; photos: any[] }>();
    for (const a of attachments as any[]) {
      const d = new Date(a.createdAt);
      const key = isNaN(d.getTime()) ? "unknown" : d.toISOString().slice(0, 10);
      const label = isNaN(d.getTime())
        ? "Unknown date"
        : new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Perth", day: "2-digit", month: "short", year: "numeric" }).format(d);
      let group = byDate.get(key);
      if (!group) {
        group = { label, photos: [] };
        byDate.set(key, group);
      }
      group.photos.push(a);
    }
    return Array.from(byDate.values());
  }, [attachments]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (!attachments || attachments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="p-4 rounded-2xl bg-muted/40 mb-4">
          <Upload className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="text-foreground font-medium mb-1">No manually uploaded photos yet</p>
        <p className="text-muted-foreground text-sm">
          Use the Upload button to add a photo independent of a running sheet row.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groupedByDate.map(group => (
        <div key={group.label}>
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-xs font-semibold text-pink-500 truncate w-fit">
            {group.label}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {group.photos.map((a: any) => (
              <div key={a.id} className="group relative rounded-xl overflow-hidden border border-border bg-card">
                <img
                  src={a.url}
                  alt="Uploaded photograph"
                  className="w-full aspect-square object-cover cursor-zoom-in"
                  onClick={() => setLightbox(a.url)}
                />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                  <p className="text-[10px] text-white truncate">{formatAttachmentBanner(a)}</p>
                </div>
                <AttachmentLinkBadge
                  linkedCount={a.linkedCount}
                  linkedCategories={a.linkedCategories}
                  onClick={() => setLinking({ id: a.id, url: a.url })}
                  positionClassName="absolute top-1.5 left-1.5"
                />
                <DeletePhotoButton
                  pending={deleteAttachment.isPending}
                  onConfirm={() => deleteAttachment.mutate({ id: a.id })}
                />
                {a.operationName && (
                  <div className="absolute top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white truncate max-w-[55%] text-center">
                    {a.operationName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={lightbox} alt="Uploaded photograph" className="max-w-full max-h-full rounded shadow-2xl" />
        </div>
      )}

      {linking !== null && (
        <LinkAttachmentDialog
          attachmentId={linking.id}
          photoUrl={linking.url}
          open={linking !== null}
          onOpenChange={open => { if (!open) setLinking(null); }}
        />
      )}
    </div>
  );
}

// Level 2: running sheets within the operation that have at least one
// attached photo, grouped from the operation's flat attachment list. Also
// offers a read-only "Operation view" — every photo from every sheet on one
// page, sectioned by a thin banner naming which running sheet each group
// came from. Linking/deleting a photo still only happens in the per-sheet
// gallery (level 3), reached via the "Running Sheet view" list below.
function SheetFolderList({
  operationId,
  onBack,
  onSelect,
}: {
  operationId: number;
  onBack: () => void;
  onSelect: (sheetId: number) => void;
}) {
  const [viewMode, setViewMode] = useState<"sheets" | "combined">("sheets");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: operation } = trpc.operation.get.useQuery({ id: operationId });
  const { data: attachments, isLoading } =
    trpc.attachment.listByOperation.useQuery({ operationId });

  // Manually-uploaded photos with no row (sheetId null via the left join)
  // have no running sheet to group under here — they live in the top-level
  // "Uploaded" tab instead. Row-attached photos, including manual uploads
  // that did have a row picked, still group normally.
  const sheets = useMemo(() => {
    if (!attachments) return [];
    const bySheet = new Map<number, { sheetId: number; sheetTitle: string; count: number }>();
    for (const a of attachments as any[]) {
      if (a.sheetId == null) continue;
      const existing = bySheet.get(a.sheetId);
      if (existing) existing.count += 1;
      else bySheet.set(a.sheetId, { sheetId: a.sheetId, sheetTitle: a.sheetTitle, count: 1 });
    }
    return Array.from(bySheet.values());
  }, [attachments]);

  // Grouped for Operation view — attachments already arrive newest-first, so
  // a Map keyed by sheetId (which preserves insertion order) naturally orders
  // groups by each sheet's most recent photo without extra sorting.
  // Manually-uploaded photos with no row (sheetId null) still belong in this
  // "all photos in the operation" view — they're bucketed under a synthetic
  // "Manually uploaded" group instead of a running sheet's.
  const MANUAL_GROUP_KEY = -1;
  const groupedBySheet = useMemo(() => {
    if (!attachments) return [];
    const bySheet = new Map<number, { sheetId: number; sheetTitle: string; photos: any[] }>();
    for (const a of attachments as any[]) {
      const key = a.sheetId ?? MANUAL_GROUP_KEY;
      let group = bySheet.get(key);
      if (!group) {
        group = { sheetId: key, sheetTitle: key === MANUAL_GROUP_KEY ? "Manually uploaded" : a.sheetTitle, photos: [] };
        bySheet.set(key, group);
      }
      group.photos.push(a);
    }
    return Array.from(bySheet.values());
  }, [attachments]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/20">
          <ImageIcon className="w-5 h-5 text-pink-500" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-foreground truncate">
            {operation?.name ?? "Images"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {viewMode === "sheets" ? "Running sheets with photos" : "All photos in this operation"}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
          <Upload className="w-3.5 h-3.5" />
          Upload
        </Button>
      </div>

      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl border border-border bg-muted/30 w-fit">
        <button
          onClick={() => setViewMode("sheets")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === "sheets"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List className="w-3.5 h-3.5" />
          Running Sheet view
        </button>
        <button
          onClick={() => setViewMode("combined")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === "combined"
              ? "bg-card text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Operation view
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !attachments || attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-2xl bg-muted/40 mb-4">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">No photos yet</p>
          <p className="text-muted-foreground text-sm">
            Attach a photo to any observation containing "PHOTOGRAPH/S TAKEN" on
            a running sheet in this operation, or upload one directly.
          </p>
        </div>
      ) : viewMode === "sheets" && sheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-2xl bg-muted/40 mb-4">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">No running-sheet photos yet</p>
          <p className="text-muted-foreground text-sm">
            All photos in this operation so far were uploaded directly — switch to Operation view to see them.
          </p>
        </div>
      ) : viewMode === "sheets" ? (
        <div className="flex flex-col gap-2">
          {sheets.map(s => (
            <div
              key={s.sheetId}
              className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent/20 hover:border-pink-500/30 transition-all duration-150 cursor-pointer"
              onClick={() => onSelect(s.sheetId)}
            >
              <div className="p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/20 shrink-0">
                <FolderOpen className="w-5 h-5 text-pink-500" />
              </div>
              <span className="font-semibold text-foreground truncate flex-1">
                {s.sheetTitle || `Sheet #${s.sheetId}`}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {s.count} photo{s.count === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedBySheet.map(group => (
            <div key={group.sheetId}>
              <div className="mb-2 px-3 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-xs font-semibold text-pink-500 truncate">
                {group.sheetTitle || `Sheet #${group.sheetId}`}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {group.photos.map((a: any) => (
                  <div
                    key={a.id}
                    className="group relative rounded-xl overflow-hidden border border-border bg-card"
                  >
                    <img
                      src={a.url}
                      alt="Attached photograph"
                      className="w-full aspect-square object-cover cursor-zoom-in"
                      onClick={() => setLightbox(a.url)}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                      <p className="text-[10px] text-white truncate">{formatAttachmentBanner(a)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Attached photograph"
            className="max-w-full max-h-full rounded shadow-2xl"
          />
        </div>
      )}

      <UploadImageDialog open={uploadOpen} onOpenChange={setUploadOpen} defaultOperationId={operationId} />
    </div>
  );
}

// Level 3: the actual photos for one running sheet.
function SheetGallery({
  operationId,
  sheetId,
  onBack,
}: {
  operationId: number;
  sheetId: number;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ id: number; url: string } | null>(null);
  const { data: sheet } = trpc.sheet.get.useQuery({ id: sheetId });
  const { data: attachments, isLoading } =
    trpc.attachment.listBySheet.useQuery({ sheetId });

  const deleteAttachment = trpc.attachment.delete.useMutation({
    onSuccess: () => {
      utils.attachment.listBySheet.invalidate({ sheetId });
      utils.attachment.listByOperation.invalidate({ operationId });
      toast.success("Photo deleted");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/20">
          <ImageIcon className="w-5 h-5 text-pink-500" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground truncate">
            {sheet?.title ?? "Images"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {attachments?.length ?? 0} photo
            {attachments?.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : !attachments || attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-2xl bg-muted/40 mb-4">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">No photos yet</p>
          <p className="text-muted-foreground text-sm">
            Attach a photo to any observation containing "PHOTOGRAPH/S TAKEN" on
            this running sheet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {attachments.map((a: any) => (
            <div
              key={a.id}
              className="group relative rounded-xl overflow-hidden border border-border bg-card"
            >
              <img
                src={a.url}
                alt="Attached photograph"
                className="w-full aspect-square object-cover cursor-zoom-in"
                onClick={() => setLightbox(a.url)}
              />
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1">
                <p className="text-[10px] text-white truncate">{formatAttachmentBanner(a)}</p>
              </div>
              <AttachmentLinkBadge
                linkedCount={a.linkedCount}
                linkedCategories={a.linkedCategories}
                onClick={() => setLinking({ id: a.id, url: a.url })}
                positionClassName="absolute top-1.5 left-1.5"
              />
              <DeletePhotoButton
                pending={deleteAttachment.isPending}
                onConfirm={() => deleteAttachment.mutate({ id: a.id })}
              />
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Attached photograph"
            className="max-w-full max-h-full rounded shadow-2xl"
          />
        </div>
      )}

      {linking !== null && (
        <LinkAttachmentDialog
          attachmentId={linking.id}
          photoUrl={linking.url}
          open={linking !== null}
          onOpenChange={open => { if (!open) setLinking(null); }}
        />
      )}
    </div>
  );
}
