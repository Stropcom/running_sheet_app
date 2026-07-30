import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, UserPlus, Trash2 } from "lucide-react";
import { format } from "date-fns";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  dob: "DOB",
  aliases: "Aliases",
  role: "Role",
  cob: "COB",
  passport: "Passport",
  ocg: "OCG",
  ids: "IDs",
  promisId: "PROMIS ID",
};
const FIELD_ORDER = Object.keys(FIELD_LABELS);

const SECTION_LABELS: Record<string, string> = {
  current_address: "Current Address",
  previous_address: "Previous Address",
  vehicle: "Vehicle",
  summary: "Summary",
  communications: "Communications",
};

const DEDUP_TYPES = new Set(["person", "vehicle", "address", "business"]);

function MentionRow({
  documentId,
  mention,
}: {
  documentId: number;
  mention: any;
}) {
  const utils = trpc.useUtils();
  const [searchOpen, setSearchOpen] = useState(false);
  const canSearchMatches = DEDUP_TYPES.has(mention.type);

  const { data: matches } = trpc.externalIntel.searchMatchesForMention.useQuery(
    { type: mention.type, label: mention.label },
    { enabled: searchOpen && canSearchMatches }
  );

  const resolve = trpc.externalIntel.resolveMention.useMutation({
    onSuccess: () => utils.externalIntel.get.invalidate({ id: documentId }),
  });

  if (mention.status !== "pending_review") {
    const isRejected = mention.status === "rejected";
    return (
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
          isRejected
            ? "border-border/50 opacity-50"
            : "border-emerald-500/30 bg-emerald-500/5"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="shrink-0 capitalize">
            {mention.type}
          </Badge>
          <span className="text-sm truncate">{mention.label}</span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {isRejected
            ? "Not relevant"
            : mention.matchedExistingKey
              ? "Matched existing"
              : "New entity"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="shrink-0 capitalize">
            {mention.type}
          </Badge>
          <span className="text-sm truncate">{mention.label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canSearchMatches && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSearchOpen(o => !o)}
            >
              Find match
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() =>
              resolve.mutate({ mentionId: mention.id, status: "new_entity" })
            }
          >
            <UserPlus className="h-3.5 w-3.5" />
            New
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-muted-foreground"
            onClick={() =>
              resolve.mutate({ mentionId: mention.id, status: "rejected" })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {searchOpen && canSearchMatches && (
        <div className="flex flex-col gap-1 pl-2 border-l-2 border-border/60">
          {!matches || matches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">
              No similar existing entities found.
            </p>
          ) : (
            matches.map((m: any) => (
              <button
                key={m.key}
                onClick={() =>
                  resolve.mutate({
                    mentionId: mention.id,
                    status: "matched",
                    matchedExistingKey: m.key,
                  })
                }
                className="flex items-center justify-between gap-2 text-left text-sm px-2 py-1.5 rounded hover:bg-accent/50"
              >
                <span className="truncate">{m.label}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {m.reason}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ExternalDocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const documentId = Number(params.id);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: doc, isLoading } = trpc.externalIntel.get.useQuery({
    id: documentId,
  });

  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    if (doc?.fields) setFields(doc.fields as Record<string, string>);
  }, [doc?.fields]);

  const updateFields = trpc.externalIntel.updateFields.useMutation({
    onSuccess: () => toast.success("Fields saved"),
  });
  const confirmReview = trpc.externalIntel.confirmReview.useMutation({
    onSuccess: () => {
      utils.externalIntel.get.invalidate({ id: documentId });
      utils.externalIntel.list.invalidate();
      toast.success("Document confirmed");
    },
  });

  const mentions = doc?.mentions ?? [];
  const pendingCount = useMemo(
    () => mentions.filter((m: any) => m.status === "pending_review").length,
    [mentions]
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="px-4 py-3 text-sm text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  if (!doc) {
    return (
      <DashboardLayout>
        <div className="px-4 py-3 text-sm text-muted-foreground">
          Document not found.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 px-4 py-3 max-w-5xl">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => setLocation("/intelligence/documents")}
          >
            <ArrowLeft className="h-4 w-4" />
            Documents
          </Button>
          <Badge
            variant="outline"
            className={
              doc.status === "reviewed"
                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                : "bg-amber-500/15 text-amber-600 border-amber-500/30"
            }
          >
            {doc.status === "reviewed" ? "Reviewed" : "Needs review"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Uploaded by {doc.uploadedByCIN ?? "Unknown"} ·{" "}
            {format(new Date(doc.createdAt), "d MMM yyyy, h:mm a")}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <div className="flex flex-col gap-3">
            <img
              src={doc.attachmentUrl}
              alt="Source document"
              className="w-full rounded-xl border border-border"
            />
            <p className="text-xs text-muted-foreground">
              Compare extracted fields against the source image before
              confirming.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Extracted fields
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FIELD_ORDER.map(key => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      {FIELD_LABELS[key]}
                    </label>
                    <Input
                      value={fields[key] ?? ""}
                      onChange={e =>
                        setFields(f => ({ ...f, [key]: e.target.value }))
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() => updateFields.mutate({ id: documentId, fields })}
                disabled={updateFields.isPending}
              >
                Save field corrections
              </Button>
            </section>

            {doc.sections.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Document sections (verbatim)
                </h2>
                <div className="flex flex-col gap-3">
                  {doc.sections.map((s: any) => (
                    <div key={s.id} className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {SECTION_LABELS[s.heading] ?? s.heading}
                      </span>
                      <Textarea
                        value={s.bodyText}
                        readOnly
                        className="text-sm resize-none bg-muted/30"
                        rows={s.heading === "summary" ? 6 : 2}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Extracted entities
                </h2>
                {pendingCount > 0 && (
                  <span className="text-xs text-amber-600">
                    {pendingCount} awaiting review
                  </span>
                )}
              </div>
              {mentions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No entities extracted from this document.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {mentions.map((m: any) => (
                    <MentionRow
                      key={m.id}
                      documentId={documentId}
                      mention={m}
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="flex justify-end gap-2 pb-6">
              {doc.status !== "reviewed" ? (
                <Button
                  className="gap-2"
                  onClick={() => confirmReview.mutate({ id: documentId })}
                  disabled={confirmReview.isPending}
                >
                  <Check className="h-4 w-4" />
                  Confirm review
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-emerald-500" />
                  Reviewed by {doc.reviewedByCIN} on{" "}
                  {doc.reviewedAt
                    ? format(new Date(doc.reviewedAt), "d MMM yyyy")
                    : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
