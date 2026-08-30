/**
 * Unified External Events timeline — one feed across every connector type
 * (GPS positions, signal detections, camera status changes), filterable by
 * source and sorted by time. Admin-only, matching the rest of the
 * Integrations-side visibility decision.
 *
 * "Create Observation" deliberately does NOT auto-create a running sheet
 * row — it copies a suggested observation line to the clipboard so a
 * certified officer still reviews and pastes it themselves. Deep
 * integration with the RS Quick Entry flow is a follow-up, not attempted
 * here to avoid a risky, under-researched change to that flow.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";

const SOURCE_TYPES = [
  "CAMERA",
  "GPS",
  "SIGNAL",
  "SENSOR",
  "VMS",
  "OTHER",
] as const;

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function suggestedObservationText(event: {
  eventType: string;
  title: string | null;
  eventTime: number;
  latitude: number | null;
  longitude: number | null;
  isSimulated: boolean;
}): string {
  const time = new Date(event.eventTime).toLocaleTimeString();
  const where =
    event.latitude != null && event.longitude != null
      ? ` at ${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`
      : "";
  const sim = event.isSimulated ? " [SIMULATED — verify before use]" : "";
  return `${event.eventType}: ${event.title ?? "Unknown"}${where} — ${time}${sim}`;
}

export function ExternalEventsPanel({
  operationId,
  open,
  onClose,
}: {
  operationId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [sourceType, setSourceType] = useState<string>("all");

  const { data: events, isLoading } = trpc.integrations.events.list.useQuery(
    {
      operationId: operationId ?? undefined,
      sourceType:
        sourceType === "all"
          ? undefined
          : (sourceType as (typeof SOURCE_TYPES)[number]),
      limit: 100,
    },
    { enabled: open, refetchInterval: open ? 8000 : false }
  );

  const copyObservation = (event: NonNullable<typeof events>[number]) => {
    const text = suggestedObservationText(event);
    navigator.clipboard
      .writeText(text)
      .then(() =>
        toast.success("Copied — paste into the relevant running sheet row.")
      )
      .catch(() => toast.error("Couldn't copy to clipboard."));
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>External Events</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs text-muted-foreground">
            Machine-supplied data, not observations — review before acting on
            it. "Create Observation" copies suggested text; it never creates a
            running sheet row automatically.
          </p>
          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger className="w-36 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {SOURCE_TYPES.map(t => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading…
          </div>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            No external events yet for this operation.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map(event => (
              <div
                key={event.id}
                className="border border-border rounded-lg p-3 text-sm flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {event.sourceType}
                    </Badge>
                    <span className="font-medium">{event.eventType}</span>
                    {event.isSimulated && (
                      <Badge className="text-[10px] bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
                        SIMULATED
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 truncate">
                    {event.title ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatTime(event.eventTime)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copyObservation(event)}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Create Observation
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
