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
  Trash2,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState } from "react";
import { toast } from "sonner";

export default function ImagesPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ operationId?: string }>();
  const operationId = params.operationId
    ? parseInt(params.operationId, 10)
    : null;

  return (
    <DashboardLayout>
      {operationId ? (
        <OperationGallery
          operationId={operationId}
          onBack={() => navigate("/images")}
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

function OperationGallery({
  operationId,
  onBack,
}: {
  operationId: number;
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { data: operation } = trpc.operation.get.useQuery({ id: operationId });
  const { data: attachments, isLoading } =
    trpc.attachment.listByOperation.useQuery({ operationId });

  const deleteAttachment = trpc.attachment.delete.useMutation({
    onSuccess: () => {
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
            {operation?.name ?? "Images"}
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
            a running sheet.
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
                <p className="text-[10px] text-white truncate">
                  {a.sheetTitle}
                  {a.rowTime ? ` · ${a.rowTime}` : ""}
                </p>
              </div>
              <button
                onClick={() => deleteAttachment.mutate({ id: a.id })}
                title="Delete photo"
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
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
    </div>
  );
}
