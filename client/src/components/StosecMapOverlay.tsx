/**
 * The recipient-facing view of a POSTED STOSEC briefing, docked over the
 * live Mapping page rather than replacing it — so the officer can read the
 * briefing while the real map (with its full markers, team tags, etc.)
 * keeps running underneath/beside it. Opened via `?stosec=<id>` on
 * /intelligence/mapping (see IntelligenceMapping.tsx), which is also what
 * the STOSEC "Post" notification links to. Closing just clears the query
 * param — reopening is clicking the notification again, or the list page.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { INTEL_CHIP_CLASSES } from "@/components/IntelEntityChip";
import {
  X,
  MapPin,
  Check,
  ShieldAlert,
  Pencil,
  Car,
  User,
  Users,
} from "lucide-react";
import { format } from "date-fns";

export function StosecMapOverlay({
  briefingId,
  onClose,
}: {
  briefingId: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: briefing, isLoading } = trpc.stosecBriefing.getById.useQuery({
    id: briefingId,
  });
  const [acknowledgedAt, setAcknowledgedAt] = useState<number | null>(null);

  const acknowledge = trpc.stosecBriefing.acknowledge.useMutation({
    onSuccess: ack => {
      setAcknowledgedAt(ack.acknowledgedAt);
      utils.stosecBriefing.getById.invalidate({ id: briefingId });
    },
    onError: e => toast.error(e.message ?? "Failed to acknowledge"),
  });

  const myAckAt = acknowledgedAt ?? briefing?.myAcknowledgedAt ?? null;
  const homeAddress = briefing
    ? briefing.hbOverride || briefing.target?.hbf || briefing.target?.hb
    : null;

  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[420px] flex flex-col bg-card/97 backdrop-blur-sm border-l border-border shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
        <h1 className="text-sm font-semibold flex-1 min-w-0 truncate">
          {briefing ? `STOSEC — ${briefing.operationName}` : "STOSEC"}
        </h1>
        {briefing && (
          <span className="text-[10px] font-mono font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            Rev {briefing.revision}
          </span>
        )}
        {user?.role === "admin" && briefing && (
          <button
            onClick={() =>
              setLocation(`/administration/stosec/${briefing.id}/edit`)
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
          <div className="p-5 space-y-5">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-card border border-border shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {briefing.acknowledgedCount} acknowledged
            </span>

            {briefing.situation && (
              <Section label="Situation">
                <p className="text-sm">{briefing.situation}</p>
              </Section>
            )}
            {briefing.mission && (
              <Section label="Mission">
                <p className="text-sm">{briefing.mission}</p>
              </Section>
            )}
            {briefing.objectives.length > 0 && (
              <Section label="Objectives">
                <ol className="space-y-1">
                  {briefing.objectives.map((o, i) => (
                    <li key={i} className="text-sm flex gap-2">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      {o}
                    </li>
                  ))}
                </ol>
              </Section>
            )}
            {briefing.target && (
              <Section label="Target reference">
                <div className="flex flex-col gap-1.5 items-start">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${INTEL_CHIP_CLASSES.person}`}
                  >
                    <User className="w-3 h-3" />
                    {briefing.target.name}
                  </span>
                  {(briefing.voiOverride ||
                    briefing.target.v1f ||
                    briefing.target.v1) && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${INTEL_CHIP_CLASSES.vehicle}`}
                    >
                      <Car className="w-3 h-3" />
                      {briefing.voiOverride ||
                        briefing.target.v1f ||
                        briefing.target.v1}
                    </span>
                  )}
                  {homeAddress && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${INTEL_CHIP_CLASSES.address}`}
                    >
                      <MapPin className="w-3 h-3" />
                      {homeAddress}
                    </span>
                  )}
                </div>
              </Section>
            )}
            {(briefing.legalAuthArrest ||
              briefing.afpOrders ||
              briefing.warrant) && (
              <Section label="Administration & logistics">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {briefing.legalAuthArrest && (
                    <AdminField
                      label="Legal auth — arrest"
                      value={briefing.legalAuthArrest}
                    />
                  )}
                  {briefing.afpOrders && (
                    <AdminField label="AFP Orders" value={briefing.afpOrders} />
                  )}
                  {briefing.warrant && (
                    <AdminField label="Warrant" value={briefing.warrant} />
                  )}
                </div>
              </Section>
            )}
            {(briefing.commsPrimary || briefing.commsSecondary) && (
              <Section label="Command & signal">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {briefing.commsPrimary && (
                    <AdminField
                      label="Comms Primary"
                      value={briefing.commsPrimary}
                    />
                  )}
                  {briefing.commsSecondary && (
                    <AdminField
                      label="Comms Secondary"
                      value={briefing.commsSecondary}
                    />
                  )}
                </div>
              </Section>
            )}
            {briefing.teamSlots.length > 0 && (
              <Section label="Surveillance team">
                <div className="flex flex-wrap gap-1.5">
                  {briefing.teamSlots.map((slot, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs"
                    >
                      <Users className="h-3 w-3" />
                      {slot.name}
                      {slot.isTeamLeader && (
                        <span className="text-[9px] font-bold ml-0.5">TL</span>
                      )}
                    </span>
                  ))}
                </div>
              </Section>
            )}
            {briefing.postedAt && (
              <p className="text-xs text-muted-foreground">
                Posted by {briefing.postedByCIN} ·{" "}
                {format(new Date(briefing.postedAt), "d MMM yyyy, h:mm a")}
              </p>
            )}

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

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </h4>
      {children}
    </div>
  );
}

function AdminField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
