import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compressAttachmentImage } from "@/lib/imageCompress";
import { FileScan, ImagePlus, Upload } from "lucide-react";
import { format } from "date-fns";

// Upload → deterministic OCR + extraction (server/externalIntel/) → officer
// review/confirm. See external_intel_import_plan.md — no LLM/AI call
// anywhere in this path, per the Golden Rule in CLAUDE.md.

function UploadDocumentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<{
    blob: Blob;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<number | null>(null);

  const { data: operations } = trpc.operation.list.useQuery(undefined, {
    enabled: open,
  });
  const upload = trpc.externalIntel.upload.useMutation();

  const reset = () => {
    setFile(null);
    setPreview(null);
    setOperationId(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const compressed = await compressAttachmentImage(f);
      const blob = compressed?.blob ?? f;
      const mimeType = compressed?.mimeType ?? f.type;
      const fileName = compressed?.fileName ?? f.name;
      if (blob.size > 25 * 1024 * 1024) {
        toast.error("File must be under 25 MB.");
        return;
      }
      setFile({ blob, mimeType, fileName });
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(blob);
    } catch {
      toast.error("Couldn't process that file — try again.");
    }
  };

  const canSubmit = !!file && operationId != null && !upload.isPending;

  const handleSubmit = async () => {
    if (!file || operationId == null) return;
    const dataBase64: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve((reader.result as string).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file.blob);
    });

    try {
      const result = await upload.mutateAsync({
        operationId,
        dataBase64,
        mimeType: file.mimeType,
        fileName: file.fileName,
      });
      utils.externalIntel.list.invalidate();
      toast.success("Document uploaded — extraction complete, review it now.");
      onOpenChange(false);
      reset();
      setLocation(`/intelligence/documents/${result.documentId}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import intelligence document</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Document photo/scan
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          {file ? (
            <div className="flex flex-col gap-2 w-fit">
              {preview && (
                <img
                  src={preview}
                  alt="Selected document"
                  className="max-w-[220px] rounded-lg border border-border"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                Change file
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              className="w-fit gap-2"
            >
              <ImagePlus className="h-4 w-4" />
              Choose photo/scan
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Operation (required)
          </p>
          <Select
            value={operationId != null ? String(operationId) : undefined}
            onValueChange={v => setOperationId(Number(v))}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select operation…" />
            </SelectTrigger>
            <SelectContent>
              {(operations ?? []).map((o: any) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          OCR and field extraction run automatically after upload — nothing is
          saved to Intelligence until you review and confirm it.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
          >
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit}>
            {upload.isPending ? "Processing…" : "Upload & extract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending_review: {
    label: "Needs review",
    className: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  },
  reviewed: {
    label: "Reviewed",
    className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  },
};

export default function ExternalDocumentsPage() {
  const [, setLocation] = useLocation();
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: documents, isLoading } = trpc.externalIntel.list.useQuery();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FileScan className="h-5 w-5 text-amber-400" />
              Document Import
            </h1>
            <p className="text-sm text-muted-foreground">
              Import photographed/scanned intelligence documents — OCR runs
              automatically, you review and confirm before anything is saved.
            </p>
          </div>
          <Button onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Import document
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !documents || documents.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
            No documents imported yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {documents.map((doc: any) => {
              const status =
                STATUS_LABEL[doc.status] ?? STATUS_LABEL.pending_review;
              return (
                <button
                  key={doc.id}
                  onClick={() =>
                    setLocation(`/intelligence/documents/${doc.id}`)
                  }
                  className="text-left border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-colors bg-card"
                >
                  <div className="aspect-video bg-muted overflow-hidden">
                    <img
                      src={doc.attachmentUrl}
                      alt="Document"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {doc.fields?.name || "(name not extracted)"}
                      </span>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {doc.uploadedByCIN ?? "Unknown"} ·{" "}
                      {format(new Date(doc.createdAt), "d MMM yyyy, h:mm a")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </DashboardLayout>
  );
}
