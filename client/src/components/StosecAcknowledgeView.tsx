/**
 * The recipient-facing view of a POSTED STOSEC briefing: map on one side,
 * briefing content on the other. This is the page the notification's link
 * opens — "closing" it just means navigating elsewhere, and "reopening" it
 * is clicking the notification again, since both land on the same URL. See
 * StosecBriefingDetailPage for the routing that gets here.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ArrowLeft,
  MapPin,
  Check,
  ShieldAlert,
  Pencil,
  Car,
  Home,
  Users,
} from "lucide-react";
import { format } from "date-fns";

interface Props {
  briefing: {
    id: number;
    operationId: number;
    operationName: string;
    situation: string | null;
    mission: string | null;
    objectives: string[];
    legalAuthArrest: string | null;
    afpOrders: string | null;
    warrant: string | null;
    commsPrimary: string | null;
    commsSecondary: string | null;
    voiOverride: string | null;
    hbOverride: string | null;
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

function teamColor(team: string | null): string {
  if (team === "TEAM1") return "#6366f1"; // indigo
  if (team === "TEAM2") return "#0ea5e9"; // sky
  if (team === "PTT") return "#f59e0b"; // amber
  return "#64748b"; // slate — no team set
}

function buildLiveUserPin(name: string, team: string | null, moving: boolean) {
  const el = document.createElement("div");
  el.style.cssText = `
    display:flex;align-items:center;gap:4px;
    background:#fff;border-radius:999px;padding:3px 8px 3px 3px;
    box-shadow:0 2px 6px rgba(0,0,0,0.35);
    border:2px solid ${teamColor(team)};
    font-family:system-ui,sans-serif;font-size:10px;font-weight:700;
    white-space:nowrap;cursor:default;
  `;
  const dot = document.createElement("span");
  dot.style.cssText = `width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${moving ? "#16a34a" : "#94a3b8"};`;
  el.appendChild(dot);
  const label = document.createElement("span");
  label.textContent = name.toUpperCase();
  label.style.color = "#111";
  el.appendChild(label);
  return el;
}

export function StosecAcknowledgeView({ briefing }: Props) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
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

  const homeAddress =
    briefing.hbOverride || briefing.target?.hbf || briefing.target?.hb || null;

  // MapView only calls onMapReady once the Google Maps script has already
  // loaded (see components/Map.tsx), so google.maps is safe to use directly.
  const homeMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null
  );
  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);
    if (!homeAddress) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: homeAddress }, (results, status) => {
      if (status === "OK" && results?.[0] && mapRef.current) {
        const pos = results[0].geometry.location;
        mapRef.current.setCenter(pos);
        mapRef.current.setZoom(14);
        const pin = document.createElement("div");
        pin.style.cssText = `
          width:26px;height:26px;border-radius:50% 50% 50% 0;
          transform:rotate(45deg);background:#dc2626;
          border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);
        `;
        homeMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current,
          position: pos,
          content: pin,
          title: `${homeAddress} (target location)`,
        });
      }
    });
  };

  // Live team positions — reuses the same location feed the main Mapping
  // page uses. The server currently doesn't filter by operationIds (it
  // returns every sharing-enabled user app-wide), so this is filtered
  // client-side to just the officers on this briefing's operation.
  const { data: liveUsersRaw } = trpc.intelligence.userLocations.useQuery(
    { operationIds: [briefing.operationId] },
    { refetchInterval: 3000 }
  );
  const liveUsers = (
    (liveUsersRaw as
      | {
          userId: number;
          deviceId: string;
          name: string;
          team: string | null;
          lat: number;
          lng: number;
          speed: number | null;
          operationIds: number[];
        }[]
      | undefined) ?? []
  ).filter(u => u.operationIds.includes(briefing.operationId));

  const liveMarkersRef = useRef<
    Map<string, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  const didInitialFitRef = useRef(false);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const seen = new Set<string>();

    liveUsers.forEach(u => {
      const key = `${u.userId}_${u.deviceId}`;
      seen.add(key);
      const pos = { lat: u.lat, lng: u.lng };
      const existing = liveMarkersRef.current.get(key);
      if (existing) {
        existing.position = pos;
      } else {
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: pos,
          content: buildLiveUserPin(u.name, u.team, (u.speed ?? 0) > 0.5),
          title: u.name,
        });
        liveMarkersRef.current.set(key, marker);
      }
    });

    // Drop markers for users no longer in the feed (out of range / stopped sharing)
    liveMarkersRef.current.forEach((marker, key) => {
      if (!seen.has(key)) {
        marker.map = null;
        liveMarkersRef.current.delete(key);
      }
    });

    // Fit the view once, the first time there's something to show — after
    // that, let the officer pan/zoom freely while pins keep moving.
    if (!didInitialFitRef.current && (liveUsers.length > 0 || homeAddress)) {
      didInitialFitRef.current = true;
      if (liveUsers.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        liveUsers.forEach(u => bounds.extend({ lat: u.lat, lng: u.lng }));
        if (homeMarkerRef.current?.position) {
          bounds.extend(homeMarkerRef.current.position as google.maps.LatLng);
        }
        map.fitBounds(bounds, 80);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, JSON.stringify(liveUsers)]);

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
        {user?.role === "admin" && (
          <button
            onClick={() =>
              setLocation(`/administration/stosec/${briefing.id}/edit`)
            }
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 flex-1 min-h-0">
        <div className="relative min-h-[260px] sm:min-h-0">
          <MapView
            className="w-full h-full"
            initialZoom={11}
            onMapReady={handleMapReady}
          />
          {!homeAddress && liveUsers.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
              <MapPin className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                No location or live team positions to plot
              </p>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/90 backdrop-blur-sm border border-border shadow-sm text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {liveUsers.length} live
          </div>
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
                {(briefing.voiOverride ||
                  briefing.target.v1f ||
                  briefing.target.v1) && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Car className="h-3 w-3" />
                    {briefing.voiOverride ||
                      briefing.target.v1f ||
                      briefing.target.v1}
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
