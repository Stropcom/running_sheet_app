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
  Link2,
  Link2Off,
  List,
  LayoutGrid,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LinkAttachmentDialog } from "@/components/LinkAttachmentDialog";
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
        <div>
          <h1 className="text-xl font-semibold text-foreground">Images</h1>
          <p className="text-sm text-muted-foreground">
            Photos attached to running sheet observations, by operation.
          </p>
        </div>
      </div>

      {isLoading ? (
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
  const { data: operation } = trpc.operation.get.useQuery({ id: operationId });
  const { data: attachments, isLoading } =
    trpc.attachment.listByOperation.useQuery({ operationId });

  const sheets = useMemo(() => {
    if (!attachments) return [];
    const bySheet = new Map<number, { sheetId: number; sheetTitle: string; count: number }>();
    for (const a of attachments as any[]) {
      const existing = bySheet.get(a.sheetId);
      if (existing) existing.count += 1;
      else bySheet.set(a.sheetId, { sheetId: a.sheetId, sheetTitle: a.sheetTitle, count: 1 });
    }
    return Array.from(bySheet.values());
  }, [attachments]);

  // Grouped for Operation view — attachments already arrive newest-first, so
  // a Map keyed by sheetId (which preserves insertion order) naturally orders
  // groups by each sheet's most recent photo without extra sorting.
  const groupedBySheet = useMemo(() => {
    if (!attachments) return [];
    const bySheet = new Map<number, { sheetId: number; sheetTitle: string; photos: any[] }>();
    for (const a of attachments as any[]) {
      let group = bySheet.get(a.sheetId);
      if (!group) {
        group = { sheetId: a.sheetId, sheetTitle: a.sheetTitle, photos: [] };
        bySheet.set(a.sheetId, group);
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
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground truncate">
            {operation?.name ?? "Images"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {viewMode === "sheets" ? "Running sheets with photos" : "All photos in this operation"}
          </p>
        </div>
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
      ) : sheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="p-4 rounded-2xl bg-muted/40 mb-4">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">No photos yet</p>
          <p className="text-muted-foreground text-sm">
            Attach a photo to any observation containing "PHOTOGRAPH/S TAKEN" on
            a running sheet in this operation.
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
  const [linkingId, setLinkingId] = useState<number | null>(null);
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
              <button
                onClick={() => setLinkingId(a.id)}
                title={a.linkedCount > 0 ? "Linked to an entity — click to link to another" : "Not linked to an entity — click to link"}
                className={`absolute top-1.5 left-1.5 h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
                  a.linkedCount > 0
                    ? "bg-emerald-600/90 text-white hover:bg-emerald-500"
                    : "bg-amber-500/90 text-white hover:bg-amber-400"
                }`}
              >
                {a.linkedCount > 0 ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
              </button>
              <button
                onClick={() => deleteAttachment.mutate({ id: a.id })}
                title="Delete photo"
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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

      {linkingId !== null && (
        <LinkAttachmentDialog
          attachmentId={linkingId}
          open={linkingId !== null}
          onOpenChange={open => { if (!open) setLinkingId(null); }}
        />
      )}
    </div>
  );
}
