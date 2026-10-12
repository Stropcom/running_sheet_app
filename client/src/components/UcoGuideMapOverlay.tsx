/**
 * The recipient-facing view of a POSTED UCO Surveillance Deployment Guide,
 * docked over the live Mapping page rather than replacing it — same pattern
 * as SmeacMapOverlay. Opened via `?ucoGuide=<id>` on /intelligence/mapping,
 * which is also what the guide's Post notification links to. Closing just
 * clears the query param — reopening is clicking the notification again.
 *
 * Unlike SMEAC, most of the document is a fixed reference (purpose, iSURV
 * key, command & control) rendered plainly and always open — there is
 * nothing to collapse, the panel just scrolls. The one live control is the
 * surveillance level tracker: any recipient can upgrade/downgrade it as the
 * deployment progresses, independent of acknowledgement.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { UcoGuideReadOnlyContent } from "@/components/UcoGuideReadOnlyContent";
import { X, Check, Eye, Pencil } from "lucide-react";
import { format } from "date-fns";

export function UcoGuideMapOverlay({
  briefingId,
  onClose,
}: {
  briefingId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: guide, isLoading } = trpc.ucoGuide.getById.useQuery(
    { id: briefingId },
    { refetchInterval: 8000 }
  );
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);

  const acknowledge = trpc.ucoGuide.acknowledge.useMutation({
    onSuccess: ack => {
      setAcknowledgedAt(ack.acknowledgedAt);
      utils.ucoGuide.getById.invalidate({ id: briefingId });
    },
    onError: e => toast.error(e.message ?? "Failed to acknowledge"),
  });

  const setLevelMutation = trpc.ucoGuide.setLevel.useMutation({
    onSuccess: () => utils.ucoGuide.getById.invalidate({ id: briefingId }),
    onError: e => toast.error(e.message ?? "Failed to update level"),
  });

  const myAckAt = acknowledgedAt ?? guide?.myAcknowledgedAt ?? null;

  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[440px] flex flex-col bg-card/97 backdrop-blur-sm border-l border-border shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Eye className="h-4 w-4 text-amber-500 shrink-0" />
        <h1 className="text-sm font-semibold flex-1 min-w-0 truncate">
          UCO Surveillance Deployment Guide
        </h1>
        {guide && (
          <span className="text-[10px] font-mono font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            Rev {guide.revision}
          </span>
        )}
        {user?.role === "admin" && guide && (
          <button
            onClick={() =>
              setLocation(`/administration/uco-guide/${guide.id}/edit`)
            }
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Edit guide"
            title="Edit guide"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0"
          aria-label="Close"
          title="Close — reopen from Notifications"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : !guide ? (
          <p className="p-5 text-sm text-muted-foreground">Guide not found.</p>
        ) : (
          <div className="p-5 space-y-4">
            <UcoGuideReadOnlyContent
              guide={guide}
              onSetLevel={level =>
                setLevelMutation.mutate({ id: guide.id, level })
              }
            />

            <div className="pt-2">
              {myAckAt ? (
                <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-muted text-sm font-semibold">
                  <Check className="h-4 w-4 text-emerald-600" />
                  Acknowledged · {format(new Date(myAckAt), "h:mm a")}
                </div>
              ) : (
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => acknowledge.mutate({ id: guide.id })}
                  disabled={acknowledge.isPending}
                >
                  {acknowledge.isPending ? (
                    <Spinner className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Acknowledge
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground text-center mt-1.5">
                Close anytime — reopen from Notifications
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
