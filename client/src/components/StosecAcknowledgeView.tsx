/**
 * The recipient-facing view of a POSTED STOSEC briefing: map on one side,
 * briefing content on the other. This is the page the notification's link
 * opens — "closing" it just means navigating elsewhere, and "reopening" it
 * is clicking the notification again, since both land on the same URL. See
 * StosecBriefingDetailPage for the routing that gets here.
 */
import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowLeft,
  MapPin,
  Check,
  ShieldAlert,
  Car,
  Home,
  Users,
} from "lucide-react";
import { format } from "date-fns";

interface Props {
  briefing: {
    id: number;
    operationName: string;
    situation: string | null;
    mission: string | null;
    objectives: string[];
    legalAuthArrest: string | null;
    afpOrders: string | null;
    warrant: string | null;
    commsPrimary: string | null;
    commsSecondary: string | null;
    teamSlots: {
      name: string;
      vehicle: string;
      foot: string;
      skill: string;
      kit: string;
      isTeamLeader: boolean;
    }[];
    postedAt: number | null;
    postedByCIN: string | null;
    myAcknowledgedAt: number | null;
    acknowledgedCount: number;
    target: {
      name: string;
      tgt: string | null;
      v1: string | null;
      v1f: string | null;
      hb: string | null;
      hbf: string | null;
    } | null;
  };
}

export function StosecAcknowledgeView({ briefing }: Props) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [acknowledgedAt, setAcknowledgedAt] = useState(
    briefing.myAcknowledgedAt
  );

  const acknowledge = trpc.stosecBriefing.acknowledge.useMutation({
    onSuccess: ack => {
      setAcknowledgedAt(ack.acknowledgedAt);
      utils.stosecBriefing.getById.invalidate({ id: briefing.id });
    },
    onError: e => toast.error(e.message ?? "Failed to acknowledge"),
  });

  const homeAddress = briefing.target?.hbf || briefing.target?.hb || null;

  // MapView only calls onMapReady once the Google Maps script has already
  // loaded (see components/Map.tsx), so google.maps is safe to use directly.
  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    if (!homeAddress) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: homeAddress }, (results, status) => {
      if (status === "OK" && results?.[0] && mapRef.current) {
        const pos = results[0].geometry.location;
        mapRef.current.setCenter(pos);
        mapRef.current.setZoom(15);
        new google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: pos,
          title: homeAddress,
        });
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button
          onClick={() => setLocation("/administration/stosec")}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          aria-label="Close"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <h1 className="text-sm font-semibold flex-1 min-w-0 truncate">
          STOSEC — {briefing.operationName}
        </h1>
        <span className="text-[10px] text-muted-foreground">
          {briefing.acknowledgedCount} acknowledged
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 flex-1 min-h-0">
        <div className="relative min-h-[260px] sm:min-h-0">
          <MapView
            className="w-full h-full"
            initialZoom={11}
            onMapReady={handleMapReady}
          />
          {!homeAddress && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
              <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No linked target address to plot
              </p>
            </div>
          )}
        </div>

        <div className="overflow-y-auto p-5 space-y-5 border-t sm:border-t-0 sm:border-l border-border">
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
              <div className="space-y-1 text-sm">
                <p className="font-medium">{briefing.target.name}</p>
                {(briefing.target.v1f || briefing.target.v1) && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Car className="h-3 w-3" />
                    {briefing.target.v1f || briefing.target.v1}
                  </p>
                )}
                {homeAddress && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Home className="h-3 w-3" />
                    {homeAddress}
                  </p>
                )}
              </div>
            </Section>
          )}
          {(briefing.legalAuthArrest ||
            briefing.afpOrders ||
            briefing.warrant ||
            briefing.commsPrimary ||
            briefing.commsSecondary) && (
            <Section label="Admin & log">
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
            {acknowledgedAt ? (
              <div className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-muted text-sm font-semibold">
                <Check className="h-4 w-4 text-emerald-600" />
                Acknowledged · {format(new Date(acknowledgedAt), "h:mm a")}
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
