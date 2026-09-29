/**
 * The recipient-facing view of a POSTED SMEAC briefing, docked over the
 * live Mapping page rather than replacing it — so the officer can read the
 * briefing while the real map (with its full markers, team tags, etc.)
 * keeps running underneath/beside it. Opened via `?smeac=<id>` on
 * /intelligence/mapping (see IntelligenceMapping.tsx), which is also what
 * the SMEAC "Post" notification links to. Closing just clears the query
 * param — reopening is clicking the notification again, or the list page.
 *
 * The actual document (target chips + S/M/E/A/C sections) is
 * SmeacReadOnlyContent — this component only adds the chrome specific to
 * being docked over the map: the header bar, close button, and the
 * Acknowledge action. The SMEAC Briefings list page's inline review row
 * renders the same shared content with different chrome (Edit/Export
 * buttons instead) — see SmeacBriefingListPage.tsx.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SmeacReadOnlyContent } from "@/components/SmeacReadOnlyContent";
import { X, Check, ShieldAlert, Pencil } from "lucide-react";
import { format } from "date-fns";

export function SmeacMapOverlay({
  briefingId,
  onClose,
}: {
  briefingId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  // Polled while open so a team member's pill turns green for everyone
  // watching as acknowledgements come in, not just on their own action.
  const { data: briefing, isLoading } = trpc.smeacBriefing.getById.useQuery(
    { id: briefingId },
    { refetchInterval: 8000 }
  );
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);

  const acknowledge = trpc.smeacBriefing.acknowledge.useMutation({
    onSuccess: ack => {
      setAcknowledgedAt(ack.acknowledgedAt);
      utils.smeacBriefing.getById.invalidate({ id: briefingId });
    },
    onError: e => toast.error(e.message ?? "Failed to acknowledge"),
  });

  const myAckAt = acknowledgedAt ?? briefing?.myAcknowledgedAt ?? null;

  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[420px] flex flex-col bg-card/97 backdrop-blur-sm border-l border-border shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
        <h1 className="text-sm font-semibold flex-1 min-w-0 truncate">
          {briefing ? `SMEAC — ${briefing.operationName}` : "SMEAC"}
        </h1>
        {briefing && (
          <span className="text-[10px] font-mono font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            Rev {briefing.revision}
          </span>
        )}
        {user?.role === "admin" && briefing && (
          <button
            onClick={() =>
              setLocation(`/administration/smeac/${briefing.id}/edit`)
            }
            className="p-1.5 rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Edit briefing"
            title="Edit briefing"
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
        ) : !briefing ? (
          <p className="p-5 text-sm text-muted-foreground">
            Briefing not found.
          </p>
        ) : (
          <div className="p-5 space-y-4">
            <SmeacReadOnlyContent briefing={briefing} />

            <div className="pt-2">
              {myAckAt ? (
                <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-muted text-sm font-semibold">
                  <Check className="h-4 w-4 text-emerald-600" />
                  Acknowledged · {format(new Date(myAckAt), "h:mm a")}
                </div>
              ) : (
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => acknowledge.mutate({ id: briefing.id })}
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
